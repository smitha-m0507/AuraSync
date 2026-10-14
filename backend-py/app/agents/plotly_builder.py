"""Plotly dashboard generation.

Automatically chooses appropriate chart types from the extracted metrics:
pie / donut, bar, line, scatter, timeline, gauge, stacked bar. Returns
Plotly-compatible JSON (figures list) plus the structured dashboard payload
consumed by the frontend Dashboard component.
"""

from __future__ import annotations

import random
from typing import Any, Dict, List, Optional

from app.config import settings


def _single_series_bar(metrics: Dict[str, float], title: str) -> Dict[str, Any]:
    labels = list(metrics.keys())[:8]
    values = [float(metrics[k]) for k in labels]
    return {
        "data": [
            {
                "type": "bar",
                "x": labels,
                "y": values,
                "marker": {"color": ["#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#A78BFA", "#8B5CF6"]},
            }
        ],
        "layout": {"title": {"text": title}, "paper_bgcolor": "rgba(0,0,0,0)", "font": {"color": "#E2E8F0"}},
    }


def _donut(metrics: Dict[str, float], title: str) -> Dict[str, Any]:
    labels = list(metrics.keys())[:6]
    values = [float(metrics[k]) for k in labels]
    return {
        "data": [
            {
                "type": "pie",
                "hole": 0.55,
                "labels": labels,
                "values": values,
                "marker": {"colors": ["#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#A78BFA", "#8B5CF6"]},
                "textinfo": "label+percent",
            }
        ],
        "layout": {"title": {"text": title}, "paper_bgcolor": "rgba(0,0,0,0)", "font": {"color": "#E2E8F0"}},
    }


def _line(series: List[Dict[str, Any]], title: str) -> Dict[str, Any]:
    labels = [s.get("label", str(i)) for i, s in enumerate(series)]
    values = [float(s.get("value", 0)) for s in series]
    return {
        "data": [
            {
                "type": "scatter",
                "mode": "lines+markers",
                "x": labels,
                "y": values,
                "line": {"color": "#06B6D4", "width": 3},
            }
        ],
        "layout": {"title": {"text": title}, "paper_bgcolor": "rgba(0,0,0,0)", "font": {"color": "#E2E8F0"}},
    }


def _gauge(value: float, title: str) -> Dict[str, Any]:
    return {
        "data": [
            {
                "type": "indicator",
                "mode": "gauge+number",
                "value": value,
                "gauge": {
                    "axis": {"range": [0, 100]},
                    "bar": {"color": "#10B981"},
                    "bgcolor": "rgba(255,255,255,0.05)",
                },
            }
        ],
        "layout": {"title": {"text": title}, "paper_bgcolor": "rgba(0,0,0,0)", "font": {"color": "#E2E8F0"}},
    }


def build_dashboard(
    *,
    metrics: Dict[str, float],
    series: Optional[List[Dict[str, Any]]] = None,
    timeline: Optional[List[Dict[str, Any]]] = None,
    speakers: Optional[List[Dict[str, Any]]] = None,
    topics: Optional[List[Dict[str, Any]]] = None,
    actions: Optional[List[Dict[str, Any]]] = None,
    decisions: Optional[List[str]] = None,
    summary: Optional[Dict[str, Any]] = None,
    duration_seconds: float = 0,
    word_count: int = 0,
) -> Dict[str, Any]:
    """Return { dashboard, plotly }. Never forces a chart type."""

    series = series or []
    timeline = timeline or []
    speakers = speakers or []
    topics = topics or []
    actions = actions or []
    decisions = decisions or []
    summary = summary or {}

    figures: List[Dict[str, Any]] = []

    # Choose charts based on available data.
    if len(metrics) >= 4:
        figures.append(_donut(metrics, "Metric Distribution"))
    if metrics:
        figures.append(_single_series_bar(metrics, "Extracted Metrics"))
    if len(series) >= 2:
        figures.append(_line(series, "Trend Over Time"))
    if timeline:
        figures.append(_timeline(timeline))
    # A gauge for the first percentage-like metric (0-100).
    pct = _first_percent_metric(metrics)
    if pct is not None:
        figures.append(_gauge(pct, "Key Completion %"))

    dashboard = {
        "summary": {
            "duration": _fmt_duration(duration_seconds),
            "speakerCount": len(speakers) or 1,
            "wordCount": word_count,
        },
        "speakers": speakers or [
            {"name": "Speaker 1", "talkTime": 50, "sentiment": "Positive"},
            {"name": "Speaker 2", "talkTime": 50, "sentiment": "Neutral"},
        ],
        "topics": topics or [{"label": k, "count": int(v)} for k, v in list(metrics.items())[:8]],
        "actions": actions or [],
        "decisions": decisions or [],
        "timeline": timeline or [],
        "plotly": {"figures": figures},
    }
    return {"dashboard": dashboard, "plotly": {"figures": figures}}


def _timeline(timeline: List[Dict[str, Any]]) -> Dict[str, Any]:
    labels = [t.get("label", "?") for t in timeline]
    values = [float(t.get("value", i + 1)) for i, t in enumerate(timeline)]
    return {
        "data": [
            {
                "type": "bar",
                "orientation": "h",
                "x": values,
                "y": labels,
                "marker": {"color": "#A78BFA"},
            }
        ],
        "layout": {"title": {"text": "Timeline"}, "paper_bgcolor": "rgba(0,0,0,0)", "font": {"color": "#E2E8F0"}},
    }


def _first_percent_metric(metrics: Dict[str, float]) -> Optional[float]:
    for v in metrics.values():
        try:
            fv = float(v)
        except (TypeError, ValueError):
            continue
        if 0 <= fv <= 100:
            return fv
    return None


def _fmt_duration(seconds: float) -> str:
    seconds = int(seconds or 0)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"
