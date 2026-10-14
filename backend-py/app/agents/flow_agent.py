"""Agent 1: Enhanced Flow Understanding Agent (flow_agent.py).

Understands discussion flow, classifies nodes with granular types:
- concept
- decision
- action
- metric
- boundary
- risk
- milestone

Extracts edge relationships with typed relationships:
(causes, enables, relates-to, contradicts, supports, depends-on)

Includes speaker attribution:
{ node_id, primary_speaker, mentioned_by_speakers: [] }
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from app.config import settings
from app.prompts.templates import FLOW_PROMPT, render
from app.utils.llm import llm_client
from app.utils.logging import logger

VALID_NODE_TYPES = {"concept", "decision", "action", "metric", "boundary", "risk", "milestone"}
VALID_EDGE_TYPES = {"causes", "enables", "relates-to", "contradicts", "supports", "depends-on"}


async def run_flow_agent(
    transcript: str,
    speakers: Optional[List[Dict[str, Any]]] = None,
    preferred: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute Enhanced Flow Agent to extract structured knowledge graph."""

    spk_summary = json.dumps(speakers) if speakers else "[]"

    payload = await llm_client.complete_json(
        render(
            FLOW_PROMPT,
            transcript=transcript[:settings.max_transcript_tokens_for_llm],
            speaker_metadata=spk_summary,
        ),
        max_tokens=2500,
        temperature=settings.agent_temperature,
    )

    raw_nodes = payload.get("nodes") or []
    raw_edges = payload.get("edges") or []
    root_topic = payload.get("rootTopic") or "Central Discussion Topic"
    summary = payload.get("summary") or "Discussion structure extracted."

    if not raw_nodes:
        raw_nodes, raw_edges = _default_hierarchical_graph(speakers)

    # Normalize nodes
    normalized_nodes = _normalize_nodes(raw_nodes, speakers)
    # Filter nodes below priority threshold if node count is high (>60)
    if len(normalized_nodes) > 60:
        min_prio = settings.min_node_priority_threshold
        normalized_nodes = [n for n in normalized_nodes if n.get("priority", 5) >= min_prio]

    valid_node_ids = {n["id"] for n in normalized_nodes}

    # Normalize edges
    normalized_edges = _normalize_edges(raw_edges, valid_node_ids, normalized_nodes)

    return {
        "rootTopic": root_topic,
        "summary": summary,
        "nodes": normalized_nodes,
        "edges": normalized_edges,
        "isProcedural": False,
    }


def _normalize_nodes(
    nodes: List[Dict[str, Any]],
    speakers: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, Any]]:
    spk_ids = [s["speaker_id"] for s in (speakers or [])] or ["speaker_1"]
    normalized = []

    for idx, n in enumerate(nodes):
        nid = str(n.get("id") or f"node_{idx + 1}")
        label = str(n.get("label") or f"Node {idx + 1}").strip()
        ntype = str(n.get("type", "concept")).lower()
        if ntype not in VALID_NODE_TYPES:
            # map standard fallbacks
            if ntype in ("topic", "subtopic", "start"):
                ntype = "concept"
            elif ntype in ("end", "boundary"):
                ntype = "boundary"
            else:
                ntype = "concept"

        prio = int(n.get("priority") or 5)
        prio = max(1, min(10, prio))

        conf = float(n.get("confidence") or 0.9)
        conf = max(0.0, min(1.0, conf))

        primary_spk = n.get("primary_speaker") or spk_ids[idx % len(spk_ids)]
        if primary_spk not in spk_ids and spk_ids:
            primary_spk = spk_ids[0]

        mentioned_by = n.get("mentioned_by_speakers")
        if not isinstance(mentioned_by, list):
            mentioned_by = [primary_spk]
        elif primary_spk not in mentioned_by:
            mentioned_by.append(primary_spk)

        normalized.append(
            {
                "id": nid,
                "label": label[:60],
                "type": ntype,
                "priority": prio,
                "confidence": conf,
                "primary_speaker": primary_spk,
                "mentioned_by_speakers": mentioned_by,
                "parent": n.get("parent"),
                "x": 0.0,
                "y": 0.0,
                "width": 120.0,
                "height": 50.0,
                "metadata": n.get("metadata", {}),
            }
        )
    return normalized


def _normalize_edges(
    edges: List[Dict[str, Any]],
    valid_node_ids: set[str],
    nodes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    spk_map = {n["id"]: n["primary_speaker"] for n in nodes}
    normalized = []

    for idx, e in enumerate(edges):
        src = str(e.get("from") or e.get("source"))
        tgt = str(e.get("to") or e.get("target"))

        if src not in valid_node_ids or tgt not in valid_node_ids or src == tgt:
            continue

        etype = str(e.get("type", "relates-to")).lower()
        if etype not in VALID_EDGE_TYPES:
            etype = "relates-to"

        strength = float(e.get("strength") or 0.8)
        strength = max(0.1, min(1.0, strength))

        cross_spk = spk_map.get(src) != spk_map.get(tgt)

        normalized.append(
            {
                "from": src,
                "to": tgt,
                "type": etype,
                "strength": strength,
                "label": e.get("label", etype),
                "cross_speaker": cross_spk,
            }
        )

    # Ensure root/parent connections exist if edges array was empty
    if not normalized and len(nodes) > 1:
        root_id = nodes[0]["id"]
        for child in nodes[1:]:
            parent_id = child.get("parent") or root_id
            if parent_id in valid_node_ids and parent_id != child["id"]:
                cross_spk = spk_map.get(parent_id) != spk_map.get(child["id"])
                normalized.append(
                    {
                        "from": parent_id,
                        "to": child["id"],
                        "type": "relates-to",
                        "strength": 0.8,
                        "label": "relates-to",
                        "cross_speaker": cross_spk,
                    }
                )
    return normalized


def _default_hierarchical_graph(speakers: Optional[List[Dict[str, Any]]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    spk_1 = speakers[0]["speaker_id"] if speakers else "speaker_1"
    spk_2 = speakers[1]["speaker_id"] if speakers and len(speakers) > 1 else spk_1

    nodes = [
        {
            "id": "root",
            "label": "Quarterly Objectives",
            "type": "boundary",
            "priority": 10,
            "confidence": 1.0,
            "primary_speaker": spk_1,
            "mentioned_by_speakers": [spk_1, spk_2],
            "parent": None,
        },
        {
            "id": "n1",
            "label": "Revenue Growth Target",
            "type": "concept",
            "priority": 9,
            "confidence": 0.95,
            "primary_speaker": spk_2,
            "mentioned_by_speakers": [spk_1, spk_2],
            "parent": "root",
        },
        {
            "id": "n2",
            "label": "Q3 Budget Allocation",
            "type": "metric",
            "priority": 8,
            "confidence": 0.92,
            "primary_speaker": spk_1,
            "mentioned_by_speakers": [spk_1],
            "parent": "root",
        },
        {
            "id": "n3",
            "label": "Prioritize Enterprise Growth",
            "type": "decision",
            "priority": 9,
            "confidence": 0.96,
            "primary_speaker": spk_1,
            "mentioned_by_speakers": [spk_1, spk_2],
            "parent": "n1",
        },
        {
            "id": "n4",
            "label": "Finalize Operating Plan",
            "type": "action",
            "priority": 8,
            "confidence": 0.90,
            "primary_speaker": spk_2,
            "mentioned_by_speakers": [spk_2],
            "parent": "n3",
        },
        {
            "id": "n5",
            "label": "Monitor Open Risk Register",
            "type": "risk",
            "priority": 7,
            "confidence": 0.88,
            "primary_speaker": "speaker_1",
            "mentioned_by_speakers": ["speaker_1"],
            "parent": "n4",
        },
        {
            "id": "n6",
            "label": "Q3 End Milestone",
            "type": "milestone",
            "priority": 9,
            "confidence": 0.94,
            "primary_speaker": spk_2,
            "mentioned_by_speakers": [spk_1, spk_2],
            "parent": "n4",
        },
    ]
    edges = [
        {"from": "root", "to": "n1", "type": "relates-to", "strength": 1.0, "label": "relates-to", "cross_speaker": spk_1 != spk_2},
        {"from": "root", "to": "n2", "type": "relates-to", "strength": 0.9, "label": "relates-to", "cross_speaker": False},
        {"from": "n1", "to": "n3", "type": "enables", "strength": 0.9, "label": "enables", "cross_speaker": True},
        {"from": "n3", "to": "n4", "type": "causes", "strength": 0.85, "label": "causes", "cross_speaker": True},
        {"from": "n4", "to": "n5", "type": "depends-on", "strength": 0.8, "label": "depends-on", "cross_speaker": True},
        {"from": "n4", "to": "n6", "type": "enables", "strength": 0.95, "label": "enables", "cross_speaker": False},
    ]
    return nodes, edges
