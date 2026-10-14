"""SVG + Multi-Format Export Engine (export_service.py).

Dynamically generates responsive SVG for the Hierarchical Knowledge Tree
and exports to PNG, PDF, SVG, JPG format outputs.

Includes fallback chain so conversions never fail even if C-libraries are missing.
"""

from __future__ import annotations

import datetime
import io
import math
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont

from app.config import settings
from app.utils.logging import logger


class ExportService:
    """Multi-format export engine for Knowledge Trees."""

    def __init__(self) -> None:
        self.storage_dir = Path(settings.export_storage_path)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def generate_svg(
        self,
        tree: Dict[str, Any],
        speakers: List[Dict[str, Any]],
        title: str = "Knowledge Tree",
    ) -> str:
        """Generate SVG string dynamically with node shapes, speaker lanes, and metadata comments."""

        canvas = tree.get("canvas", {"width": settings.canvas_width_px, "height": 800})
        width = int(canvas.get("width", settings.canvas_width_px))
        height = int(canvas.get("height", 800))
        meta = tree.get("metadata", {})
        nodes = tree.get("nodes", [])
        edges = tree.get("edges", [])

        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        speaker_comments = "\n".join(
            f"<!-- Speaker: {s.get('speaker_name')}, ID: {s.get('speaker_id')}, Influence: {s.get('influence_score', 5.0)} -->"
            for s in speakers
        )

        svg_parts = [
            f'<?xml version="1.0" encoding="UTF-8"?>',
            f'<!-- Generated: {now_str} -->',
            f'<!-- Speakers: {len(speakers)}, Nodes: {len(nodes)}, Edges: {len(edges)} -->',
            speaker_comments,
            f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="background-color: #0F172A; font-family: \'Roboto\', system-ui, sans-serif;">',
            f'  <defs>',
            f'    <style>',
            f'      @font-face {{ font-family: "Roboto"; src: local("Segoe UI"), local("Roboto"), local("Arial"); }}',
            f'      .title {{ font-size: 22px; font-weight: bold; fill: #F8FAFC; }}',
            f'      .subtitle {{ font-size: 13px; fill: #94A3B8; }}',
            f'      .lane-label {{ font-size: 14px; font-weight: 600; fill: #CBD5E1; }}',
            f'      .node-text {{ font-size: 12px; font-weight: 500; dominant-baseline: middle; text-anchor: middle; }}',
            f'      .edge-text {{ font-size: 10px; fill: #94A3B8; dominant-baseline: middle; text-anchor: middle; }}',
            f'    </style>',
            f'    <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">',
            f'      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B"/>',
            f'    </marker>',
            f'  </defs>',
        ]

        # Header Title
        svg_parts.append(f'  <text x="30" y="40" class="title">{title}</text>')
        svg_parts.append(
            f'  <text x="30" y="62" class="subtitle">Hierarchical Knowledge Tree • {len(speakers)} Speakers • {len(nodes)} Nodes • {len(edges)} Relationships</text>'
        )

        # Speaker Lanes
        lane_height = int(canvas.get("speaker_lane_height", height / max(1, len(speakers))))
        spk_color_map = {s["speaker_id"]: s.get("color_hex", "#38BDF8") for s in speakers}

        for idx, spk in enumerate(speakers):
            y_top = idx * lane_height + 80
            lane_color = spk.get("color_hex", "#38BDF8")
            spk_name = spk.get("speaker_name", f"Speaker {idx+1}")

            svg_parts.append(
                f'  <rect x="20" y="{y_top}" width="{width - 40}" height="{lane_height - 10}" rx="8" fill="{lane_color}" fill-opacity="0.05" stroke="{lane_color}" stroke-opacity="0.2" stroke-dasharray="4,4"/>'
            )
            svg_parts.append(
                f'  <text x="35" y="{y_top + 25}" class="lane-label" fill="{lane_color}">● {spk_name} (Lane {idx+1})</text>'
            )

        # Edges (Bezier curves)
        for edge in edges:
            x1, y1 = edge.get("x1", 0), edge.get("y1", 0)
            x2, y2 = edge.get("x2", 0), edge.get("y2", 0)
            path_d = edge.get("path_d") or f"M {x1} {y1} L {x2} {y2}"
            is_cross = edge.get("cross_speaker", False)

            stroke_color = "#64748B" if is_cross else "#38BDF8"
            dash = 'stroke-dasharray="5,5"' if is_cross else ""
            thickness = "1.5" if is_cross else "2.0"
            label = edge.get("label", edge.get("type", ""))

            svg_parts.append(
                f'  <path d="{path_d}" stroke="{stroke_color}" stroke-width="{thickness}" {dash} fill="none" marker-end="url(#arrow)"/>'
            )

        # Nodes (SVG Shapes)
        for node in nodes:
            nx = float(node.get("x", 100))
            ny = float(node.get("y", 100))
            ntype = str(node.get("type", "concept")).lower()
            label = _escape_xml(str(node.get("label", "Node")))
            spk_id = node.get("primary_speaker", "speaker_1")
            fill_color = spk_color_map.get(spk_id, "#38BDF8")
            is_shared = len(node.get("mentioned_by_speakers", [])) > 1

            border_stroke = "#999999" if is_shared else fill_color
            stroke_dash = 'stroke-dasharray="3,3"' if is_shared else ""

            text_color = _contrast_color(fill_color)

            # Node Shape rendering
            shape_svg = _render_node_shape(nx, ny, ntype, fill_color, border_stroke, stroke_dash)
            svg_parts.append(shape_svg)

            # Node Label
            svg_parts.append(
                f'  <text x="{nx}" y="{ny}" class="node-text" fill="{text_color}">{label}</text>'
            )

        svg_parts.append("</svg>")
        return "\n".join(svg_parts)

    def export_all_formats(
        self,
        tree: Dict[str, Any],
        speakers: List[Dict[str, Any]],
        title: str,
        requested_formats: Optional[List[str]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """Generate and save export files for requested formats (SVG, PNG, PDF, JPG)."""

        formats = [f.strip().lower() for f in (requested_formats or settings.parsed_export_formats)]
        title_slug = _slugify(title or "knowledge_tree")
        spk_count = len(speakers)
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

        svg_content = self.generate_svg(tree, speakers, title)
        exports: Dict[str, Dict[str, Any]] = {}

        # 1. Native SVG
        if "svg" in formats:
            filename = f"{title_slug}_{spk_count}speakers_{timestamp}.svg"
            filepath = self.storage_dir / filename
            filepath.write_text(svg_content, encoding="utf-8")
            exports["svg"] = {
                "content": svg_content,
                "downloadUrl": f"/api/audio/export-file/{filename}",
                "size_bytes": len(svg_content.encode("utf-8")),
                "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }

        # Render PNG intermediate / final
        png_bytes: Optional[bytes] = None
        if any(fmt in formats for fmt in ("png", "jpg", "pdf")):
            png_bytes = self._render_png_bytes(svg_content, tree)

        # 2. PNG Export
        if "png" in formats and png_bytes:
            filename = f"{title_slug}_{spk_count}speakers_{timestamp}.png"
            filepath = self.storage_dir / filename
            filepath.write_bytes(png_bytes)
            exports["png"] = {
                "downloadUrl": f"/api/audio/export-file/{filename}",
                "size_bytes": len(png_bytes),
                "dpi": settings.png_dpi,
                "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }

        # 3. JPG Export
        if "jpg" in formats and png_bytes:
            jpg_bytes = self._convert_png_to_jpg(png_bytes)
            filename = f"{title_slug}_{spk_count}speakers_{timestamp}.jpg"
            filepath = self.storage_dir / filename
            filepath.write_bytes(jpg_bytes)
            exports["jpg"] = {
                "downloadUrl": f"/api/audio/export-file/{filename}",
                "size_bytes": len(jpg_bytes),
                "quality": settings.jpg_quality,
                "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }

        # 4. PDF Export
        if "pdf" in formats:
            pdf_bytes = self._render_pdf_bytes(svg_content, png_bytes, tree, title)
            filename = f"{title_slug}_{spk_count}speakers_{timestamp}.pdf"
            filepath = self.storage_dir / filename
            filepath.write_bytes(pdf_bytes)
            exports["pdf"] = {
                "downloadUrl": f"/api/audio/export-file/{filename}",
                "size_bytes": len(pdf_bytes),
                "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }

        return exports

    def _render_png_bytes(self, svg_content: str, tree: Dict[str, Any]) -> bytes:
        """Render PNG bytes using CairoSVG, ReportLab, or Pillow rasterizer fallback."""

        # Attempt 1: CairoSVG
        try:
            import cairosvg  # type: ignore

            return cairosvg.svg2png(bytestring=svg_content.encode("utf-8"), dpi=settings.png_dpi)
        except Exception as exc:  # noqa: BLE001
            logger.debug("cairosvg PNG rendering unavailable (%s), using Pillow rasterizer fallback", exc)

        # Attempt 2: Pillow rasterizer fallback
        canvas = tree.get("canvas", {"width": 1200, "height": 800})
        w = int(canvas.get("width", 1200))
        h = int(canvas.get("height", 800))

        img = Image.new("RGB", (w, h), color="#0F172A")
        draw = ImageDraw.Draw(img)

        # Draw nodes & edges on canvas bitmap
        for e in tree.get("edges", []):
            x1, y1 = float(e.get("x1", 0)), float(e.get("y1", 0))
            x2, y2 = float(e.get("x2", 0)), float(e.get("y2", 0))
            draw.line([(x1, y1), (x2, y2)], fill="#38BDF8", width=2)

        for n in tree.get("nodes", []):
            nx, ny = float(n.get("x", 100)), float(n.get("y", 100))
            label = str(n.get("label", "Node"))
            draw.ellipse([nx - 30, ny - 30, nx + 30, ny + 30], fill="#0284C7", outline="#38BDF8", width=2)
            draw.text((nx - 20, ny - 5), label[:10], fill="#FFFFFF")

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def _convert_png_to_jpg(self, png_bytes: bytes) -> bytes:
        """Convert PNG image bytes to JPG using Pillow."""
        img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=settings.jpg_quality)
        return buf.getvalue()

    def _render_pdf_bytes(
        self,
        svg_content: str,
        png_bytes: Optional[bytes],
        tree: Dict[str, Any],
        title: str,
    ) -> bytes:
        """Render PDF bytes using ReportLab or CairoSVG."""
        try:
            import cairosvg  # type: ignore

            return cairosvg.svg2pdf(bytestring=svg_content.encode("utf-8"))
        except Exception:  # noqa: BLE001
            pass

        # ReportLab PDF generation fallback
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas as pdf_canvas

        buf = io.BytesIO()
        c = pdf_canvas.Canvas(buf, pagesize=A4)
        c.drawString(50, 800, f"AuraSync Knowledge Tree Report: {title}")

        if png_bytes:
            from reportlab.lib.utils import ImageReader

            img_reader = ImageReader(io.BytesIO(png_bytes))
            c.drawImage(img_reader, 50, 350, width=500, height=400, preserveAspectRatio=True)

        c.showPage()
        c.save()
        return buf.getvalue()


def _render_node_shape(
    cx: float,
    cy: float,
    ntype: str,
    fill_color: str,
    border_color: str,
    stroke_dash: str,
) -> str:
    """Return SVG XML element string for specified node type."""

    if ntype == "concept":
        # Circle r=30
        return f'  <circle cx="{cx}" cy="{cy}" r="30" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    elif ntype == "decision":
        # Diamond 40x40
        pts = f"{cx},{cy-25} {cx+25},{cy} {cx},{cy+25} {cx-25},{cy}"
        return f'  <polygon points="{pts}" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    elif ntype == "action":
        # Rectangle 60x40
        return f'  <rect x="{cx-30}" y="{cy-20}" width="60" height="40" rx="6" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    elif ntype == "metric":
        # Hexagon r=35
        pts = []
        for i in range(6):
            angle = math.pi / 3 * i
            pts.append(f"{cx + 28 * math.cos(angle):.1f},{cy + 28 * math.sin(angle):.1f}")
        return f'  <polygon points="{" ".join(pts)}" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    elif ntype == "boundary":
        # Dashed Circle r=35
        return f'  <circle cx="{cx}" cy="{cy}" r="35" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" stroke-dasharray="4,4" fill-opacity="0.8"/>'
    elif ntype == "risk":
        # Triangle 40
        pts = f"{cx},{cy-25} {cx+25},{cy+20} {cx-25},{cy+20}"
        return f'  <polygon points="{pts}" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    elif ntype == "milestone":
        # Star 40
        pts = []
        for i in range(10):
            r = 28 if i % 2 == 0 else 14
            angle = math.pi / 5 * i - math.pi / 2
            pts.append(f"{cx + r * math.cos(angle):.1f},{cy + r * math.sin(angle):.1f}")
        return f'  <polygon points="{" ".join(pts)}" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" {stroke_dash} fill-opacity="0.9"/>'
    else:
        return f'  <circle cx="{cx}" cy="{cy}" r="28" fill="{fill_color}" stroke="{border_color}" stroke-width="2.5" fill-opacity="0.9"/>'


def _contrast_color(hex_color: str) -> str:
    """Return '#0F172A' (dark) or '#F8FAFC' (white) based on background luminance."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        lum = (0.299 * r + 0.587 * g + 0.114 * b)
        return "#0F172A" if lum > 160 else "#F8FAFC"
    return "#F8FAFC"


def _slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "_", text).strip("_")[:40]


def _escape_xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


export_service = ExportService()
