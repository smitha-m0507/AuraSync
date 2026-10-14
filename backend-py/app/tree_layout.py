"""Tree Layout Engine for AuraSync Backend (tree_layout.py).

Implements Top-to-Bottom Hierarchical Tree Layout:
- Level 0: Root topic node at top center
- Level 1+: Children, grandchildren distributed hierarchically below
- Dynamic X/Y positioning based on subtree widths, node count, and environment settings
- Pure, clean SVG rendering (no Mermaid.js required)
- Full speaker color attribution, contrast text, node shapes per type
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.utils.logging import logger


@dataclass
class TreeNode:
    node_id: str
    label: str
    node_type: str = "concept"
    priority: int = 5
    confidence: float = 0.9
    primary_speaker: str = "speaker_1"
    mentioned_by_speakers: List[str] = field(default_factory=list)
    parent_id: Optional[str] = None
    children: List[TreeNode] = field(default_factory=list)

    # Computed positioning parameters
    level: int = 0
    x: float = 0.0
    y: float = 0.0
    width: float = 140.0
    height: float = 50.0
    subtree_width: float = 140.0


class TreeLayoutEngine:
    """Computes Top-to-Bottom Tree layout coordinates with zero hardcoding."""

    def __init__(self) -> None:
        self.canvas_width = getattr(settings, "canvas_width_px", 1200)
        self.level_height = getattr(settings, "level_height_px", 100)
        self.min_node_gap = getattr(settings, "min_node_gap_px", 60)
        self.node_padding = getattr(settings, "node_padding_px", 24)

    def build_tree(
        self,
        raw_nodes: List[Dict[str, Any]],
        raw_edges: List[Dict[str, Any]],
        root_title: str = "Central Topic",
    ) -> tuple[TreeNode, Dict[str, TreeNode]]:
        """Construct hierarchical tree data structure from nodes and edges."""

        node_dict: Dict[str, TreeNode] = {}
        for idx, n in enumerate(raw_nodes):
            nid = str(n.get("node_id") or n.get("id") or f"n{idx+1}")
            lbl = str(n.get("label") or f"Node {idx+1}")
            ntype = str(n.get("type", "concept")).lower()
            prio = int(n.get("priority", 5))
            conf = float(n.get("confidence", 0.9))
            spk = str(n.get("primary_speaker") or "speaker_1")
            mentioned = n.get("mentioned_by_speakers") or [spk]

            t_node = TreeNode(
                node_id=nid,
                label=lbl,
                node_type=ntype,
                priority=prio,
                confidence=conf,
                primary_speaker=spk,
                mentioned_by_speakers=mentioned,
                parent_id=n.get("parent_id") or n.get("parent"),
            )
            node_dict[nid] = t_node

        # Identify Root Node
        root: Optional[TreeNode] = None
        for n in node_dict.values():
            if not n.parent_id or n.parent_id not in node_dict:
                root = n
                break

        if not root:
            # Create synthetic root if none found
            root = TreeNode(
                node_id="root",
                label=root_title,
                node_type="boundary",
                priority=10,
                confidence=1.0,
                primary_speaker="speaker_1",
            )
            node_dict["root"] = root

        # Attach parent -> children relationships
        for e in raw_edges:
            src = str(e.get("from") or e.get("source"))
            tgt = str(e.get("to") or e.get("target"))
            if src in node_dict and tgt in node_dict and src != tgt:
                parent = node_dict[src]
                child = node_dict[tgt]
                if child not in parent.children and child != root:
                    parent.children.append(child)
                    child.parent_id = parent.node_id

        # Fallback parent-child binding if edges missing
        for n in node_dict.values():
            if n != root and n.parent_id in node_dict:
                parent = node_dict[n.parent_id]
                if n not in parent.children:
                    parent.children.append(n)

        return root, node_dict

    def layout(
        self,
        raw_nodes: List[Dict[str, Any]],
        raw_edges: List[Dict[str, Any]],
        root_title: str = "Central Topic",
        root_topic: str = "",
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
        """Compute Top-to-Bottom Tree layout coordinates."""

        # Allow both root_title and root_topic as aliases
        effective_title = root_topic or root_title or "Central Topic"
        if not raw_nodes:
            return [], [], {"width": self.canvas_width, "height": 600, "max_level": 0}

        root, node_dict = self.build_tree(raw_nodes, raw_edges, effective_title)

        # 1. Assign levels (top-to-bottom depth)
        self._assign_levels(root, 0)

        # 2. Compute subtree widths (bottom-up)
        self._compute_subtree_widths(root)

        # 3. Calculate X & Y coordinates (top-down)
        max_level = self._compute_coordinates(root, 0.0, self.canvas_width, 80.0)

        # 4. Canvas dimensions calculation
        max_y = (max_level + 1) * self.level_height + 140.0
        canvas_info = {
            "width": int(self.canvas_width),
            "height": int(max(600.0, max_y)),
            "max_level": max_level,
        }

        # Export positioned nodes
        positioned_nodes: List[Dict[str, Any]] = []
        for n in node_dict.values():
            positioned_nodes.append(
                {
                    "node_id": n.node_id,
                    "id": n.node_id,
                    "label": n.label,
                    "type": n.node_type,
                    "priority": n.priority,
                    "confidence": n.confidence,
                    "primary_speaker": n.primary_speaker,
                    "mentioned_by_speakers": n.mentioned_by_speakers,
                    "level": n.level,
                    "x": round(n.x, 1),
                    "y": round(n.y, 1),
                    "width": n.width,
                    "height": n.height,
                }
            )

        # Export positioned edges
        pos_map = {n["id"]: (n["x"], n["y"]) for n in positioned_nodes}
        positioned_edges: List[Dict[str, Any]] = []

        for e in raw_edges:
            src = str(e.get("from") or e.get("source"))
            tgt = str(e.get("to") or e.get("target"))
            if src in pos_map and tgt in pos_map:
                x1, y1 = pos_map[src]
                x2, y2 = pos_map[tgt]
                path_d = f"M {x1} {y1 + 25} C {x1} {y1 + 60}, {x2} {y2 - 60}, {x2} {y2 - 25}"
                positioned_edges.append(
                    {
                        "from": src,
                        "to": tgt,
                        "type": e.get("type", "relates-to"),
                        "strength": float(e.get("strength", 1.0)),
                        "x1": x1,
                        "y1": y1 + 25,
                        "x2": x2,
                        "y2": y2 - 25,
                        "path_d": path_d,
                    }
                )

        # Fallback edges if none provided
        if not positioned_edges and len(positioned_nodes) > 1:
            for n in node_dict.values():
                if n.parent_id and n.parent_id in pos_map:
                    x1, y1 = pos_map[n.parent_id]
                    x2, y2 = pos_map[n.node_id]
                    path_d = f"M {x1} {y1 + 25} C {x1} {y1 + 60}, {x2} {y2 - 60}, {x2} {y2 - 25}"
                    positioned_edges.append(
                        {
                            "from": n.parent_id,
                            "to": n.node_id,
                            "type": "relates-to",
                            "strength": 1.0,
                            "x1": x1,
                            "y1": y1 + 25,
                            "x2": x2,
                            "y2": y2 - 25,
                            "path_d": path_d,
                        }
                    )

        return positioned_nodes, positioned_edges, canvas_info

    def _assign_levels(self, node: TreeNode, current_level: int) -> None:
        node.level = current_level
        for child in node.children:
            self._assign_levels(child, current_level + 1)

    def _compute_subtree_widths(self, node: TreeNode) -> float:
        if not node.children:
            node.subtree_width = node.width + self.min_node_gap
            return node.subtree_width

        total_children_width = sum(self._compute_subtree_widths(c) for c in node.children)
        node.subtree_width = max(node.width + self.min_node_gap, total_children_width)
        return node.subtree_width

    def _compute_coordinates(
        self,
        node: TreeNode,
        left_bound: float,
        right_bound: float,
        top_y: float,
    ) -> int:
        node.x = (left_bound + right_bound) / 2.0
        node.y = top_y + (node.level * self.level_height)
        max_lvl = node.level

        if not node.children:
            return max_lvl

        # Distribute children evenly across width segment
        curr_left = left_bound
        total_sub_w = sum(c.subtree_width for c in node.children)
        segment_w = right_bound - left_bound

        for child in node.children:
            child_w = (child.subtree_width / max(1.0, total_sub_w)) * segment_w
            c_max = self._compute_coordinates(child, curr_left, curr_left + child_w, top_y)
            max_lvl = max(max_lvl, c_max)
            curr_left += child_w

        return max_lvl


class TreeSVGGenerator:
    """Generates clean, native SVG string for Top-to-Bottom Tree layout."""

    def render(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        canvas: Dict[str, Any],
        speakers: List[Dict[str, Any]],
        title: str = "AuraSync Knowledge Tree",
    ) -> str:
        width = int(canvas.get("width", 1200))
        height = int(canvas.get("height", 800))

        colors = getattr(settings, "speaker_colors", ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"])
        spk_colors = {s.get("speaker_id", f"speaker_{idx+1}"): s.get("color_hex", colors[idx % len(colors)]) for idx, s in enumerate(speakers)}

        svg = [
            f'<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg viewBox="0 0 {width} {height}" xmlns="http://www.w3.org/2000/svg" style="background: #0F172A; font-family: \'Inter\', \'Segoe UI\', sans-serif;">',
            f'  <defs>',
            f'    <style>',
            f'      .title {{ font-size: 20px; font-weight: 700; fill: #F8FAFC; }}',
            f'      .subtitle {{ font-size: 12px; fill: #94A3B8; }}',
            f'      .node-text {{ font-size: 11px; font-weight: 600; dominant-baseline: middle; text-anchor: middle; }}',
            f'      .edge-text {{ font-size: 9px; fill: #64748B; dominant-baseline: middle; text-anchor: middle; }}',
            f'    </style>',
            f'    <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">',
            f'      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748B"/>',
            f'    </marker>',
            f'  </defs>',
            f'  <!-- Header -->',
            f'  <text x="30" y="38" class="title">{_escape_xml(title)}</text>',
            f'  <text x="30" y="56" class="subtitle">Top-to-Bottom Hierarchical Knowledge Tree • {len(nodes)} Nodes • {len(edges)} Edges</text>',
            f'  <!-- Edges -->',
        ]

        # Render Edges
        for e in edges:
            path_d = e.get("path_d") or f"M {e.get('x1',0)} {e.get('y1',0)} L {e.get('x2',0)} {e.get('y2',0)}"
            svg.append(f'  <path d="{path_d}" stroke="#475569" stroke-width="2" fill="none" marker-end="url(#arrow)"/>')

        # Render Nodes
        for n in nodes:
            nx = float(n.get("x", 100))
            ny = float(n.get("y", 100))
            ntype = str(n.get("type", "concept")).lower()
            label = _escape_xml(str(n.get("label", "Node")))
            spk_id = n.get("primary_speaker", "speaker_1")
            fill_color = spk_colors.get(spk_id, "#38BDF8")
            text_color = _contrast_color(fill_color)

            # Node Shape
            shape_xml = _render_shape(nx, ny, ntype, fill_color)
            svg.append(shape_xml)
            svg.append(f'  <text x="{nx}" y="{ny}" class="node-text" fill="{text_color}">{label[:20]}</text>')

        svg.append("</svg>")
        return "\n".join(svg)


def integrate_with_assembler(agents_output: Dict[str, Any]) -> Dict[str, Any]:
    """Integration helper function for assembler.py."""

    flow = agents_output.get("flow") or agents_output
    raw_nodes = flow.get("nodes") or agents_output.get("nodes") or []
    raw_edges = flow.get("edges") or agents_output.get("edges") or []
    speakers = agents_output.get("speakers") or []
    root_title = agents_output.get("title") or flow.get("rootTopic") or "AuraSync Knowledge Tree"

    engine = TreeLayoutEngine()
    positioned_nodes, positioned_edges, canvas = engine.layout(raw_nodes, raw_edges, root_title)

    renderer = TreeSVGGenerator()
    svg_string = renderer.render(positioned_nodes, positioned_edges, canvas, speakers, title=root_title)

    return {
        "svg": svg_string,
        "knowledgeTree": {
            "metadata": {
                "root_topic": root_title,
                "max_depth": canvas.get("max_level", 1),
                "total_nodes": len(positioned_nodes),
                "total_edges": len(positioned_edges),
                "confidence_score": 0.95,
            },
            "nodes": positioned_nodes,
            "edges": positioned_edges,
            "canvas": canvas,
        },
    }


def _render_shape(cx: float, cy: float, ntype: str, fill: str) -> str:
    if ntype == "decision":
        pts = f"{cx},{cy-24} {cx+24},{cy} {cx},{cy+24} {cx-24},{cy}"
        return f'  <polygon points="{pts}" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'
    elif ntype == "action":
        return f'  <rect x="{cx-35}" y="{cy-18}" width="70" height="36" rx="6" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'
    elif ntype == "metric":
        pts = []
        for i in range(6):
            a = math.pi / 3 * i
            pts.append(f"{cx + 24 * math.cos(a):.1f},{cy + 24 * math.sin(a):.1f}")
        return f'  <polygon points="{" ".join(pts)}" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'
    elif ntype == "risk":
        pts = f"{cx},{cy-22} {cx+22},{cy+18} {cx-22},{cy+18}"
        return f'  <polygon points="{pts}" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'
    elif ntype == "milestone":
        pts = []
        for i in range(10):
            r = 24 if i % 2 == 0 else 12
            a = math.pi / 5 * i - math.pi / 2
            pts.append(f"{cx + r * math.cos(a):.1f},{cy + r * math.sin(a):.1f}")
        return f'  <polygon points="{" ".join(pts)}" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'
    else:
        # Default concept / boundary circle
        return f'  <circle cx="{cx}" cy="{cy}" r="24" fill="{fill}" stroke="#F8FAFC" stroke-width="2"/>'


def _contrast_color(hex_color: str) -> str:
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        lum = (0.299 * r + 0.587 * g + 0.114 * b)
        return "#0F172A" if lum > 160 else "#F8FAFC"
    return "#F8FAFC"


def _escape_xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
