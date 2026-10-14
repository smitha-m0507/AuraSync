"""LangGraph orchestration for the parallel multi-agent pipeline.

Executes analysis agents concurrently:
  Flow Agent        ┐
  Speaker Agent     ├─ (parallel execution branch)
  Metric/Summary    ┘
       │
  Knowledge Tree Assembler (dynamic formula-based node layout)
       │
  Multi-Format Export Engine (SVG, PNG, PDF, JPG)
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.assembler import layout_knowledge_tree
from app.agents.flow_agent import run_flow_agent
from app.agents.metric_agent import run_metric_agent
from app.agents.speaker_agent import run_speaker_agent
from app.audio.diarization import analyze_speakers
from app.services.export_service import export_service
from app.utils.logging import logger


class PipelineState(TypedDict, total=False):
    transcript: str
    output_type: str
    speaker_count: int
    speaker_labels: Optional[Dict[str, str]]
    export_formats: Optional[List[str]]
    duration_seconds: float
    word_count: int
    speakers: List[Dict[str, Any]]
    flow: Optional[Dict[str, Any]]
    speaker_analysis: Optional[Dict[str, Any]]
    metrics: Optional[Dict[str, Any]]
    knowledge_tree: Optional[Dict[str, Any]]
    exports: Optional[Dict[str, Any]]
    processing_time: Dict[str, float]
    result: Optional[Dict[str, Any]]
    error: Optional[str]


async def _parallel_multi_agent_analysis(state: PipelineState) -> PipelineState:
    t_start = time.monotonic()
    transcript = state["transcript"]
    duration = state.get("duration_seconds", 0.0)
    spk_labels = state.get("speaker_labels")
    requested_spk_count = state.get("speaker_count")

    # Step 1: Speaker Diarization
    t0 = time.monotonic()
    speakers = analyze_speakers(
        transcript,
        speaker_count=requested_spk_count,
        speaker_labels=spk_labels,
        total_duration_seconds=duration,
    )
    state["speakers"] = speakers
    state.setdefault("processing_time", {})["diarization_ms"] = round((time.monotonic() - t0) * 1000, 1)

    # Step 2: Parallel Agents Execution (Flow + Speaker + Metric/Summary)
    t1 = time.monotonic()
    flow_task = run_flow_agent(transcript, speakers=speakers)
    speaker_task = run_speaker_agent(transcript, speakers=speakers)
    metric_task = run_metric_agent(transcript)

    flow, spk_analysis, metrics = await asyncio.gather(flow_task, speaker_task, metric_task)

    t_agents = round((time.monotonic() - t1) * 1000, 1)
    state["processing_time"]["flow_agent_ms"] = t_agents
    state["processing_time"]["speaker_agent_ms"] = t_agents
    state["processing_time"]["metric_agent_ms"] = t_agents

    state["flow"] = flow
    state["speaker_analysis"] = spk_analysis
    state["metrics"] = metrics
    return state


async def _assemble_tree_and_exports(state: PipelineState) -> PipelineState:
    t0 = time.monotonic()
    flow = state.get("flow") or {}
    speakers = state.get("speakers") or []
    metrics = state.get("metrics") or {}
    export_fmts = state.get("export_formats")

    root_topic = flow.get("rootTopic") or metrics.get("title") or "Audio Intelligence Knowledge Tree"
    nodes = flow.get("nodes") or []
    edges = flow.get("edges") or []

    # Tree Layout Assembly
    tree_data = layout_knowledge_tree(nodes, edges, speakers, root_topic=root_topic)
    t_tree = round((time.monotonic() - t0) * 1000, 1)
    state["processing_time"]["tree_generation_ms"] = t_tree
    state["knowledge_tree"] = tree_data

    # Multi-Format Export Engine
    t_exp = time.monotonic()
    exports_payload = export_service.export_all_formats(
        tree=tree_data,
        speakers=speakers,
        title=root_topic,
        requested_formats=export_fmts,
    )
    state["processing_time"]["export_ms"] = round((time.monotonic() - t_exp) * 1000, 1)
    state["exports"] = exports_payload

    # Final Assembled Result
    title = metrics.get("title") or root_topic
    exec_summary = metrics.get("executiveSummary") or flow.get("summary") or "Analysis completed successfully."
    tags = metrics.get("tags") or ["audio", "intelligence", "tree"]

    state["result"] = {
        "title": title,
        "summary": exec_summary,
        "tags": tags,
        "speakerCount": len(speakers),
        "speakers": speakers,
        "knowledgeTree": tree_data,
        "exports": exports_payload,
        "processingTime": state["processing_time"],
    }
    return state


def build_pipeline_graph():
    graph = StateGraph(PipelineState)
    graph.add_node("parallel_analysis", _parallel_multi_agent_analysis)
    graph.add_node("assemble_and_export", _assemble_tree_and_exports)

    graph.add_edge(START, "parallel_analysis")
    graph.add_edge("parallel_analysis", "assemble_and_export")
    graph.add_edge("assemble_and_export", END)
    return graph.compile()


analysis_graph = build_pipeline_graph()


async def run_audio_intelligence_pipeline(
    *,
    transcript: str,
    output_type: str = "knowledge_tree",
    speaker_count: Optional[int] = None,
    speaker_labels: Optional[Dict[str, str]] = None,
    export_formats: Optional[List[str]] = None,
    duration_seconds: float = 0.0,
    word_count: int = 0,
) -> Dict[str, Any]:
    """Execute full parallel multi-agent audio intelligence pipeline."""

    t_start = time.monotonic()
    logger.info("Executing Audio Intelligence Pipeline (speakers=%s, formats=%s)", speaker_count, export_formats)

    initial_state: PipelineState = {
        "transcript": transcript,
        "output_type": output_type,
        "speaker_count": speaker_count or 1,
        "speaker_labels": speaker_labels,
        "export_formats": export_formats,
        "duration_seconds": duration_seconds,
        "word_count": word_count,
        "processing_time": {},
    }

    final_state = await analysis_graph.ainvoke(initial_state)

    total_ms = round((time.monotonic() - t_start) * 1000, 1)
    if "processingTime" in final_state.get("result", {}):
        final_state["result"]["processingTime"]["total_ms"] = total_ms

    return final_state["result"]


async def run_analysis(*args, **kwargs) -> Dict[str, Any]:
    """Backward compatibility wrapper for job pipeline."""
    return await run_audio_intelligence_pipeline(*args, **kwargs)
