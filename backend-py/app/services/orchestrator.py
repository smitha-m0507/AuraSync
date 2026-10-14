"""Pipeline orchestrator.

Ties together:
  subscription validation -> audio ingestion -> Whisper transcription ->
  LangGraph parallel analysis -> persistence, advancing job stages so the
  React UI polling sees pending -> transcribing -> diarizing -> analyzing ->
  visualizing -> summarizing -> completed (or failed).
"""

from __future__ import annotations

import asyncio
import time
from typing import Optional

from app.audio.ingestion import AudioIngestionError, ingest
from app.audio.transcription import whisper_service
from app.config import settings
from app.models.schemas import JobDocument
from app.services.job_store import job_store
from app.services.pipeline import run_analysis
from app.subscription.limiter import SubscriptionDecision, evaluate_upload
from app.utils.logging import logger


async def process_job(
    job_id: str,
    *,
    file_path: str,
    filename: str,
    size_bytes: int,
    output_type: str,
    speaker_count: int,
    is_pro: bool,
) -> None:
    """Run the full async pipeline for a job. Updates store stages."""

    start = time.monotonic()
    try:
        # 1. Ingest + subscription check.
        meta = await ingest(file_path, filename, size_bytes)

        decision = evaluate_upload(
            is_pro=is_pro,
            max_free_duration_seconds=settings.max_free_duration_seconds,
            duration_seconds=meta.duration_seconds,
        )
        if not decision.allowed:
            # Stop immediately; do not transcribe.
            await job_store.set_status(job_id, "failed", error=decision.reason)
            return

        await job_store.update(job_id, durationSeconds=meta.duration_seconds)

        # 2. Transcribe.
        await job_store.set_status(job_id, "transcribing")
        transcript = await whisper_service.transcribe_file(file_path, filename)
        if not transcript.strip():
            await job_store.set_status(job_id, "failed", error="No speech detected in audio.")
            return
        await job_store.update(job_id, agentTranscript=transcript)

        # 3. Diarize (speaker attribution summary).
        await job_store.set_status(job_id, "diarizing")
        diarization = _diarize(transcript, speaker_count)
        await job_store.update(job_id, agentDiarization=diarization)

        # 4. Analyze (parallel LangGraph agents).
        await job_store.set_status(job_id, "analyzing")
        word_count = len(transcript.split())
        result = await run_analysis(
            transcript=transcript,
            output_type=output_type,
            speaker_count=speaker_count,
            duration_seconds=meta.duration_seconds,
            word_count=word_count,
        )
        await job_store.update(job_id, agentAnalysis=result.get("metrics"))

        # 5. Visualize.
        await job_store.set_status(job_id, "visualizing")
        if output_type == "dashboard":
            await job_store.update(
                job_id,
                agentVisual=result.get("dashboard"),
                agentSummary=_merge_summary(result),
            )
        else:
            await job_store.update(
                job_id,
                agentVisual=result.get("visual"),
                agentSummary=_merge_summary(result),
            )

        # 6. Summarize.
        await job_store.set_status(job_id, "summarizing")
        await asyncio.sleep(0)  # yield

        # Complete.
        await job_store.set_status(job_id, "completed")

        elapsed = round(time.monotonic() - start, 1)
        logger.info("Job %s completed in %ss", job_id, elapsed)
    except AudioIngestionError as exc:
        logger.warning("Job %s ingestion error: %s", job_id, exc)
        await job_store.set_status(job_id, "failed", error=exc.message)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Job %s failed", job_id)
        await job_store.set_status(job_id, "failed", error=str(exc)[:300])


def _diarize(transcript: str, speaker_count: int) -> dict:
    lines = [l for l in transcript.splitlines() if l.strip()]
    per = max(1, len(lines) // max(1, speaker_count))
    segments = []
    for i, line in enumerate(lines):
        speaker = f"Speaker {(i // per) % max(1, speaker_count) + 1}"
        segments.append({"speaker": speaker, "text": line})
    return {"segments": segments, "speakerCount": speaker_count}


def _merge_summary(result: dict) -> dict:
    summary = result.get("summary") or {}
    if isinstance(summary, dict) and summary.get("executiveSummary"):
        return summary
    # Build a minimal summary from dashboard/visual context.
    return {
        "title": "AuraSync Analysis",
        "executiveSummary": "Analysis complete. Review the generated visual and dashboard.",
        "tags": [],
    }
