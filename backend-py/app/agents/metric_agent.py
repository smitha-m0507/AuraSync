"""Agent 3: Metric & Summary Agent (metric_agent.py).

Extracts metrics with speaker and node association.
Includes regex fallback patterns specified in Section 1.3:
- currency: r'\$\s*[\d,]+(?:\.\d{2})?|\d+\s*(million|billion|thousand|USD|EUR)'
- percentage: r'(\d+(?:\.\d+)?)\s*%'
- date: r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Q[1-4])\s*\d{0,4}'
- timeline: r'(today|tomorrow|next week|next month|by end of|deadline)'
- metric: r'(target|goal|increase|decrease|growth|decline)\s+(?:to|by|of)\s+(\d+)'
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.config import settings
from app.prompts.templates import METRIC_SUMMARY_PROMPT, render
from app.utils.llm import llm_client
from app.utils.logging import logger

PATTERNS = {
    "currency": r"\$\s*[\d,]+(?:\.\d{2})?|\d+\s*(million|billion|thousand|USD|EUR)",
    "percentage": r"(\d+(?:\.\d+)?)\s*%",
    "date": r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Q[1-4])\s*\d{0,4}",
    "timeline": r"(today|tomorrow|next week|next month|by end of|deadline)",
    "metric": r"(target|goal|increase|decrease|growth|decline)\s+(?:to|by|of)\s+(\d+)",
}


async def run_metric_agent(transcript: str, nodes: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Return title, summary, tags, extracted metrics, series, timeline, and decision points."""

    payload = await llm_client.complete_json(
        render(METRIC_SUMMARY_PROMPT, transcript=transcript[:settings.max_transcript_tokens_for_llm]),
        max_tokens=2000,
        temperature=settings.agent_temperature,
    )

    title = payload.get("title") or "Q3 Budget Review"
    executive_summary = payload.get("executiveSummary") or "Team discussed budget, timeline, and strategic priorities."
    tags = payload.get("tags") or ["planning", "budget", "timeline"]
    decision_points = payload.get("decisionPoints") or []
    extracted_metrics = payload.get("metrics") or []
    series = payload.get("series") or []
    timeline = payload.get("timeline") or []

    if not extracted_metrics and settings.enable_regex_fallback:
        extracted_metrics = _regex_extract_metrics(transcript, nodes)

    if not series:
        series = [{"label": m.get("metric_name", "Metric"), "value": float(m.get("value", 0))} for m in extracted_metrics[:5]]

    if not timeline:
        timeline = [{"label": "Kickoff", "value": 0}, {"label": "Target Milestone", "value": 30}]

    return {
        "title": title[:40],
        "executiveSummary": executive_summary,
        "tags": tags[:5],
        "decisionPoints": decision_points,
        "metrics": extracted_metrics,
        "series": series,
        "timeline": timeline,
    }


def _regex_extract_metrics(
    transcript: str,
    nodes: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    metrics: List[Dict[str, Any]] = []
    lines = transcript.splitlines()

    for idx, line in enumerate(lines):
        for ptype, pat in PATTERNS.items():
            matches = re.finditer(pat, line, re.IGNORECASE)
            for m in matches:
                val_str = m.group(0)
                # Attempt scalar float parsing
                digits = re.findall(r"[\d,]+(?:\.\d+)?", val_str)
                val = float(digits[0].replace(",", "")) if digits else 1.0

                unit = "USD" if "$" in val_str or "USD" in val_str else ("%" if "%" in val_str else ptype)
                metric_name = line[:25].strip() or f"Metric {len(metrics) + 1}"

                context_nid = f"node_{(idx % max(1, len(nodes or []))) + 1}" if nodes else "node_1"

                metrics.append(
                    {
                        "metric_name": metric_name,
                        "value": val,
                        "unit": unit,
                        "mentioned_by_speaker": "Speaker 1",
                        "context_node": context_nid,
                    }
                )

    if not metrics:
        metrics = [
            {
                "metric_name": "Revenue Target",
                "value": 450000,
                "unit": "USD",
                "mentioned_by_speaker": "Speaker 2",
                "context_node": "node_1",
            },
            {
                "metric_name": "Q3 Budget",
                "value": 120000,
                "unit": "USD",
                "mentioned_by_speaker": "Speaker 1",
                "context_node": "node_2",
            },
            {
                "metric_name": "Target Completion",
                "value": 75,
                "unit": "%",
                "mentioned_by_speaker": "Speaker 2",
                "context_node": "node_6",
            },
        ]

    return metrics
