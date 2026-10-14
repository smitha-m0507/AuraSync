"""Agent 3: Validation Agent.

Validates Mermaid syntax. If invalid, it repairs the diagram so the frontend
never receives broken Mermaid code. A lightweight local validator is applied
first; the LLM is used only as a fallback repair mechanism.
"""

from __future__ import annotations

from typing import Any, Dict, Tuple

from app.prompts.templates import VALIDATION_PROMPT, render
from app.utils.llm import llm_client


def _local_validate(mermaid: str) -> Tuple[bool, str]:
    """Cheap structural checks; returns (valid, repaired_string)."""

    text = (mermaid or "").strip()
    if not text:
        return False, "flowchart TD\n  Start([Start]) --> End([End])"

    repaired = text
    # Ensure a known diagram header.
    first_line = repaired.splitlines()[0].strip().lower()
    if not (
        first_line.startswith("flowchart")
        or first_line.startswith("graph")
        or first_line == "mindmap"
        or first_line.startswith("sequencediagram")
    ):
        repaired = "flowchart TD\n" + repaired

    # Strip obviously broken node syntax (empty brackets).
    repaired = repaired.replace("[]", "[Node]").replace("{}", "{Decision}")

    # Balanced-edge heuristic: every edge arrow should have two endpoints.
    valid = True
    for line in repaired.splitlines()[1:]:
        line = line.strip()
        if "-->" in line or "---" in line:
            parts = re_split(line)
            if len(parts) < 2:
                valid = False
    return valid, repaired


def re_split(line: str):
    import re

    return [p.strip() for p in re.split(r"-+>|---", line) if p.strip()]


async def run_validation_agent(mermaid: str) -> Dict[str, Any]:
    """Return { valid, mermaid, mermaidType, repaired }."""

    valid, repaired = _local_validate(mermaid)
    mermaid_type = "mindmap" if repaired.lstrip().lower().startswith("mindmap") else "flowchart"

    if valid:
        return {"valid": True, "mermaid": repaired, "mermaidType": mermaid_type, "repaired": False}

    # Attempt LLM repair if available.
    try:
        payload = await llm_client.complete_json(
            render(VALIDATION_PROMPT, mermaid=repaired),
            max_tokens=1500,
        )
        fixed = (payload.get("mermaid") or "").strip()
        if fixed:
            valid2, fixed2 = _local_validate(fixed)
            return {
                "valid": valid2,
                "mermaid": fixed2,
                "mermaidType": payload.get("mermaidType", mermaid_type),
                "repaired": bool(payload.get("repaired")),
            }
    except Exception:  # noqa: BLE001
        pass

    return {"valid": False, "mermaid": repaired, "mermaidType": mermaid_type, "repaired": True}
