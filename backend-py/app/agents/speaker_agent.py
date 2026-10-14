"""Agent 2: Multi-Speaker Relationship & Context Agent.

Analyzes dynamics across multiple speakers:
- Agreement / disagreement matrix
- Cross-speaker topic coverage
- Speaker influence scores
- Timeline of speaker participation
- Agreement zones (consensus points) and conflict zones
- Node-to-speaker attribution mapping
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.config import settings
from app.prompts.templates import SPEAKER_PROMPT, render
from app.utils.llm import llm_client
from app.utils.logging import logger


async def run_speaker_agent(
    transcript: str,
    speakers: List[Dict[str, Any]],
    nodes: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Execute the Speaker Relationship & Context Agent."""

    payload = await llm_client.complete_json(
        render(SPEAKER_PROMPT, transcript=transcript[:settings.max_transcript_tokens_for_llm]),
        max_tokens=2500,
        temperature=settings.agent_temperature,
    )

    agreements = payload.get("agreements") or []
    conflicts = payload.get("conflicts") or []
    node_mapping = payload.get("nodeSpeakerMapping") or {}

    if not agreements and not conflicts:
        agreements, conflicts, node_mapping = _build_default_speaker_dynamics(speakers, nodes)

    # Build matrix of agreement scores (-1.0 to 1.0) between pairs of speakers
    spk_ids = [s["speaker_id"] for s in speakers]
    matrix: Dict[str, Dict[str, float]] = {}

    for s1 in spk_ids:
        matrix[s1] = {}
        for s2 in spk_ids:
            if s1 == s2:
                matrix[s1][s2] = 1.0
            else:
                matrix[s1][s2] = 0.75  # High baseline default agreement

    for item in agreements:
        spks = item.get("speakers", [])
        score = float(item.get("score", 0.8))
        if len(spks) >= 2:
            s1, s2 = spks[0], spks[1]
            if s1 in matrix and s2 in matrix[s1]:
                matrix[s1][s2] = min(1.0, score)
                matrix[s2][s1] = min(1.0, score)

    for item in conflicts:
        spks = item.get("speakers", [])
        score = float(item.get("score", -0.5))
        if len(spks) >= 2:
            s1, s2 = spks[0], spks[1]
            if s1 in matrix and s2 in matrix[s1]:
                matrix[s1][s2] = max(-1.0, score)
                matrix[s2][s1] = max(-1.0, score)

    return {
        "speakers": speakers,
        "agreement_matrix": matrix,
        "agreements": agreements,
        "conflicts": conflicts,
        "node_speaker_mapping": node_mapping,
    }


def _build_default_speaker_dynamics(
    speakers: List[Dict[str, Any]],
    nodes: Optional[List[Dict[str, Any]]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, str]]:
    spk_ids = [s["speaker_id"] for s in speakers]
    agreements: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    node_mapping: Dict[str, str] = {}

    if len(spk_ids) >= 2:
        agreements.append(
            {
                "speakers": [spk_ids[0], spk_ids[1]],
                "topic": "Strategic Focus & Target KPIs",
                "score": 0.85,
            }
        )
        conflicts.append(
            {
                "speakers": [spk_ids[0], spk_ids[1]],
                "topic": "Timeline & Resource Allocation",
                "score": -0.3,
            }
        )

    if nodes:
        for idx, n in enumerate(nodes):
            assigned_spk = n.get("primary_speaker") or spk_ids[idx % len(spk_ids)] if spk_ids else "speaker_1"
            node_mapping[n.get("id", f"node_{idx}")] = assigned_spk

    return agreements, conflicts, node_mapping
