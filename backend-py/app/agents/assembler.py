"""Knowledge Tree Assembler (assembler.py).

Implements Top-to-Bottom Hierarchical Tree Layout & Assembler Integration.
Uses tree_layout module to position nodes dynamically (Root at top, children below)
and generate clean SVG output without Mermaid.js dependencies.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.config import settings
from app.tree_layout import TreeLayoutEngine, integrate_with_assembler
from app.utils.logging import logger


def layout_knowledge_tree(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    speakers: List[Dict[str, Any]],
    root_topic: str = "Central Topic",
) -> Dict[str, Any]:
    """Dynamically layout nodes and edges into a Top-to-Bottom Hierarchical Knowledge Tree."""

    engine = TreeLayoutEngine()
    positioned_nodes, positioned_edges, canvas = engine.layout(
        nodes, edges, root_topic=root_topic
    )


    avg_conf = sum(n.get("confidence", 0.9) for n in positioned_nodes) / max(1, len(positioned_nodes)) if positioned_nodes else 1.0

    tree_data = {
        "metadata": {
            "root_topic": root_topic,
            "max_depth": canvas.get("max_level", 1),
            "total_nodes": len(positioned_nodes),
            "total_edges": len(positioned_edges),
            "confidence_score": round(avg_conf, 2),
        },
        "nodes": positioned_nodes,
        "edges": positioned_edges,
        "canvas": canvas,
    }

    logger.info(
        "Knowledge Tree assembled: %d nodes, %d edges, max depth %d",
        len(positioned_nodes),
        len(positioned_edges),
        canvas.get("max_level", 1),
    )
    return tree_data


__all__ = [
    "layout_knowledge_tree",
    "integrate_with_assembler",
]
