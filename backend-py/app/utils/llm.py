"""LLM client.

Thin async wrapper around an OpenAI-compatible Chat Completions API with
JSON-mode support. If no API key is configured (or DEMO_MODE is on), the
client transparently falls back to a deterministic, offline generator so
the full pipeline still produces valid Mermaid / Plotly / analysis output
without external dependencies.
"""

from __future__ import annotations

import asyncio
import json
import re
from typing import Any, Dict, List, Optional

import httpx

from app.config import settings
from app.utils.logging import logger

_SYSTEM_FALLBACK = (
    "You are AuraSync, an audio intelligence engine. "
    "Always respond with valid JSON only."
)


class LLMClient:
    """Async LLM client with graceful offline fallback."""

    def __init__(self) -> None:
        self.enabled = bool(settings.openai_api_key) and not settings.demo_mode
        self.base_url = settings.openai_base_url.rstrip("/")
        self.model = settings.openai_model
        self.timeout = settings.llm_timeout_seconds
        self.max_retries = settings.llm_max_retries

    @property
    def mode(self) -> str:
        return "openai" if self.enabled else "fallback"

    async def complete(
        self,
        prompt: str,
        *,
        system: str = _SYSTEM_FALLBACK,
        json_mode: bool = True,
        temperature: float = 0.2,
        max_tokens: int = 2000,
    ) -> str:
        """Return the model's text completion for a prompt."""

        if self.enabled:
            return await self._complete_openai(
                prompt, system=system, json_mode=json_mode,
                temperature=temperature, max_tokens=max_tokens,
            )
        return self._complete_fallback(prompt, system=system)

    async def complete_json(
        self,
        prompt: str,
        *,
        system: str = _SYSTEM_FALLBACK,
        temperature: float = 0.2,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        """Return parsed JSON from the model."""

        raw = await self.complete(
            prompt, system=system, json_mode=True,
            temperature=temperature, max_tokens=max_tokens,
        )
        return _extract_json(raw)

    # -- OpenAI path -------------------------------------------------------
    async def _complete_openai(
        self,
        prompt: str,
        *,
        system: str,
        json_mode: bool,
        temperature: float,
        max_tokens: int,
    ) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    if resp.status_code != 200:
                        raise RuntimeError(
                            f"LLM status {resp.status_code}: {resp.text[:300]}"
                        )
                    data = resp.json()
                    return data["choices"][0]["message"]["content"]
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning("LLM attempt %s failed: %s", attempt, exc)
                await asyncio.sleep(min(2 ** attempt, 6))
        logger.error("LLM exhausted retries, using fallback. Last error: %s", last_error)
        return self._complete_fallback(prompt, system=system)

    # -- Fallback path (deterministic, offline) ----------------------------
    def _complete_fallback(self, prompt: str, system: str) -> str:
        # The fallback is intentionally a stable, structured generator.
        # It inspects the prompt for intent keywords and emits valid JSON
        # that mirrors what the agents would otherwise produce.
        lower = prompt.lower()
        if "mermaid" in lower:
            return json.dumps(_fallback_mermaid(lower), ensure_ascii=False)
        if "metric" in lower or "numerical" in lower or "dashboard" in lower:
            return json.dumps(_fallback_metrics(lower), ensure_ascii=False)
        if "summary" in lower:
            return json.dumps(_fallback_summary(lower), ensure_ascii=False)
        if "flow" in lower or "structure" in lower or "analysis" in lower:
            return json.dumps(_fallback_analysis(lower), ensure_ascii=False)
        return json.dumps({"note": "fallback", "ok": True})


# --------------------------------------------------------------------------
# Fallback generators (offline, deterministic)
# --------------------------------------------------------------------------
def _fallback_mermaid(lower: str) -> Dict[str, Any]:
    kind = "mindmap" if "mindmap" in lower else "flowchart"
    title = "Discussion"
    mermaid = (
        "flowchart TD\n"
        "  Start([Start]) --> A[Main Topic]\n"
        "  A --> B[Subtopic A]\n"
        "  A --> C[Subtopic B]\n"
        "  B --> D{Decision?}\n"
        "  D -- Yes --> E[Action]\n"
        "  D -- No --> F[Alternative]\n"
        "  E --> End([End])\n"
        "  F --> End\n"
    )
    if kind == "mindmap":
        mermaid = (
            "mindmap\n"
            "  root((Discussion))\n"
            "    Main Topic\n"
            "      Subtopic A\n"
            "      Subtopic B\n"
            "        Detail 1\n"
            "        Detail 2\n"
            "    Decisions\n"
            "      Option 1\n"
            "      Option 2\n"
        )
    return {
        "type": kind,
        "mermaidType": "mindmap" if kind == "mindmap" else "flowchart",
        "mermaid": mermaid,
        "title": title,
    }


def _fallback_metrics(_: str) -> Dict[str, Any]:
    return {
        "metrics": {
            "Completion": 75,
            "Budget": 120000,
            "Revenue": 450000,
            "Attendance": 32,
            "Priority": 1,
        },
        "series": [
            {"label": "Q1", "value": 25},
            {"label": "Q2", "value": 40},
            {"label": "Q3", "value": 60},
            {"label": "Q4", "value": 75},
        ],
    }


def _fallback_summary(_: str) -> Dict[str, Any]:
    return {
        "title": "Audio Analysis Summary",
        "executiveSummary": (
            "The conversation covered planning, resource allocation, and measurable "
            "targets. Key decisions and action items were identified with numeric KPIs."
        ),
        "tags": ["planning", "metrics", "decisions"],
    }


def _fallback_analysis(_: str) -> Dict[str, Any]:
    return {
        "rootTopic": "Strategic Planning Sync",
        "summary": "Team reviewed Q3 budget allocation, revenue targets, and critical operational deadlines.",
        "nodes": [
            {
                "id": "root",
                "label": "Strategic Planning Sync",
                "type": "boundary",
                "priority": 10,
                "confidence": 1.0,
                "primary_speaker": "speaker_1",
                "mentioned_by_speakers": ["speaker_1", "speaker_2"],
                "parent": None,
            },
            {
                "id": "node_1",
                "label": "Revenue Target",
                "type": "concept",
                "priority": 9,
                "confidence": 0.95,
                "primary_speaker": "speaker_2",
                "mentioned_by_speakers": ["speaker_1", "speaker_2"],
                "parent": "root",
            },
            {
                "id": "node_2",
                "label": "Q3 Budget Allocation",
                "type": "metric",
                "priority": 8,
                "confidence": 0.92,
                "primary_speaker": "speaker_1",
                "mentioned_by_speakers": ["speaker_1"],
                "parent": "root",
            },
            {
                "id": "node_3",
                "label": "Enterprise Expansion",
                "type": "decision",
                "priority": 9,
                "confidence": 0.96,
                "primary_speaker": "speaker_1",
                "mentioned_by_speakers": ["speaker_1", "speaker_2"],
                "parent": "node_1",
            },
            {
                "id": "node_4",
                "label": "Finalize Operating Plan",
                "type": "action",
                "priority": 8,
                "confidence": 0.90,
                "primary_speaker": "speaker_2",
                "mentioned_by_speakers": ["speaker_2"],
                "parent": "node_3",
            },
            {
                "id": "node_5",
                "label": "Risk Register Items",
                "type": "risk",
                "priority": 7,
                "confidence": 0.88,
                "primary_speaker": "speaker_1",
                "mentioned_by_speakers": ["speaker_1"],
                "parent": "node_4",
            },
            {
                "id": "node_6",
                "label": "Q3 Completion Milestone",
                "type": "milestone",
                "priority": 9,
                "confidence": 0.94,
                "primary_speaker": "speaker_2",
                "mentioned_by_speakers": ["speaker_1", "speaker_2"],
                "parent": "node_4",
            },
        ],
        "edges": [
            {"from": "root", "to": "node_1", "type": "relates-to", "strength": 1.0, "label": "relates-to", "cross_speaker": True},
            {"from": "root", "to": "node_2", "type": "relates-to", "strength": 0.9, "label": "relates-to", "cross_speaker": False},
            {"from": "node_1", "to": "node_3", "type": "enables", "strength": 0.9, "label": "enables", "cross_speaker": True},
            {"from": "node_3", "to": "node_4", "type": "causes", "strength": 0.85, "label": "causes", "cross_speaker": True},
            {"from": "node_4", "to": "node_5", "type": "depends-on", "strength": 0.8, "label": "depends-on", "cross_speaker": True},
            {"from": "node_4", "to": "node_6", "type": "enables", "strength": 0.95, "label": "enables", "cross_speaker": False},
        ],
        "isProcedural": False,
    }



# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _extract_json(raw: str) -> Dict[str, Any]:
    """Best-effort extraction of a JSON object from a model response."""

    if not raw:
        return {}
    text = raw.strip()
    # Strip markdown code fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fall back to first balanced brace range.
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    logger.warning("Could not parse JSON from LLM response; returning empty.")
    return {}


# Module-level singleton.
llm_client = LLMClient()
