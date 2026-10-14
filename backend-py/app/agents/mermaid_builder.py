"""Mermaid generation and layout.

Converts the Flow Agent's structured graph into:
  1. A valid Mermaid string (flowchart or mindmap) chosen automatically.
  2. Positioned nodes/edges (x, y) consumed by the frontend SVG components.

The Validation Agent guarantees the Mermaid string is syntactically valid.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


_FLOW_COLORS = ["#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#A78BFA", "#8B5CF6"]

_TYPE_COLOR = {
    "start": "#10B981",
    "end": "#EF4444",
    "decision": "#F59E0B",
    "topic": "#06B6D4",
    "subtopic": "#A78BFA",
    "process": "#8B5CF6",
}


def _sanitize(label: str) -> str:
    return re.sub(r"[^\w\s\-]", "", label or "Node").strip() or "Node"


def build_mermaid(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    *,
    is_procedural: bool,
    preferred: Optional[str] = None,
) -> str:
    """Build a Mermaid string, auto-choosing flowchart vs mindmap.

    `preferred` may force "flowchart" or "mindmap" (from the UI outputType).
    """

    use_mindmap = (preferred == "mindmap") or (preferred is None and not is_procedural)
    if preferred == "flowchart":
        use_mindmap = False

    if use_mindmap:
        return _build_mindmap(nodes, edges)
    return _build_flowchart(nodes, edges)


def _build_flowchart(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> str:
    lines = ["flowchart TD"]
    node_ids = {n.get("id") for n in nodes}
    for node in nodes:
        nid = node.get("id", "n")
        label = _sanitize(node.get("label", nid))
        ntype = (node.get("type") or "topic").lower()
        if ntype in ("start",):
            shape = f"([{label}])"
        elif ntype in ("end",):
            shape = f"([{label}])"
        elif ntype in ("decision",):
            shape = f"{{{label}}}"
        else:
            shape = f"[{label}]"
        lines.append(f"  {nid}{shape}")
    for edge in edges:
        frm = edge.get("from") or edge.get("from_")
        to = edge.get("to")
        if frm in node_ids and to in node_ids:
            label = edge.get("label")
            sep = " --> " if not label else f" -->|{_sanitize(label)}| "
            lines.append(f"  {frm}{sep}{to}")
    return "\n".join(lines)


def _build_mindmap(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> str:
    # Mermaid mindmap uses indentation; we build a root + children tree.
    lines = ["mindmap"]
    root = next((n for n in nodes if n.get("type") == "start" or n.get("id") == "root"), nodes[0] if nodes else None)
    if not root:
        lines.append("  root((Discussion))")
        return "\n".join(lines)

    children = _build_tree(nodes, edges)
    root_label = _sanitize(root.get("label", "Discussion"))
    lines.append(f"  root(({root_label}))")
    for child_id in children.get(root.get("id"), []):
        lines.append(f"    {_sanitize(_label_of(nodes, child_id))}")
    return "\n".join(lines)


def _build_tree(nodes, edges) -> Dict[str, List[str]]:
    tree: Dict[str, List[str]] = {}
    for edge in edges:
        frm = edge.get("from") or edge.get("from_")
        to = edge.get("to")
        if frm and to:
            tree.setdefault(frm, []).append(to)
    return tree


def _label_of(nodes, nid) -> str:
    for n in nodes:
        if n.get("id") == nid:
            return n.get("label", nid)
    return nid


def layout_nodes(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Compute x/y positions for SVG rendering (1120x680 canvas).

    Uses a simple layered (level-by-level) layout based on parent edges.
    """

    tree = _build_tree(nodes, edges)
    levels: Dict[str, int] = {}

    def assign(nid: str, depth: int):
        levels[nid] = max(levels.get(nid, 0), depth)
        for child in tree.get(nid, []):
            assign(child, depth + 1)

    roots = [n.get("id") for n in nodes if not any(
        e.get("to") == n.get("id") for e in edges
    )] or [nodes[0].get("id")] if nodes else []

    for r in roots:
        assign(r, 0)

    # Group by level.
    by_level: Dict[int, List[str]] = {}
    for nid, lvl in levels.items():
        by_level.setdefault(lvl, []).append(nid)

    width, height = 1120, 680
    positioned: List[Dict[str, Any]] = []
    out_edges: List[Dict[str, Any]] = []

    node_index = {n.get("id"): n for n in nodes}
    for lvl, ids in by_level.items():
        count = len(ids)
        for i, nid in enumerate(ids):
            x = width / (count + 1) * (i + 1)
            y = height / (len(by_level) + 1) * (lvl + 1) + 30
            node = node_index.get(nid, {"id": nid, "label": nid})
            ntype = (node.get("type") or "topic").lower()
            color = _TYPE_COLOR.get(ntype, _FLOW_COLORS[len(positioned) % len(_FLOW_COLORS)])
            positioned.append({
                "id": nid,
                "label": node.get("label", nid),
                "x": round(x, 1),
                "y": round(y, 1),
                "color": color,
                "speaker": node.get("speaker"),
            })

    for edge in edges:
        frm = edge.get("from") or edge.get("from_")
        to = edge.get("to")
        if frm and to:
            out_edges.append({"from": frm, "to": to, "color": edge.get("color")})

    return positioned, out_edges
