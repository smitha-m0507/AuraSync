"""Jobs routes: upload, status polling, result.

This is the primary integration surface for the React frontend:
  POST /jobs/upload        -> { jobId }
  GET  /jobs/:id/status     -> { jobId, status, completedStages, ... }
  GET  /jobs/:id/result     -> { jobId, transcript, visual, summary, ... }

Status stages match the UI's poll mapping:
  pending -> transcribing -> diarizing -> analyzing -> visualizing ->
  summarizing -> completed | failed
"""

from __future__ import annotations

import os
import tempfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import settings
from app.models.schemas import JobDocument
from app.routes.deps import get_current_user
from app.services.job_store import job_store
from app.services.orchestrator import process_job
from app.utils.logging import logger
from app.utils.responses import fail, ok
from app.validators.input_validators import allowed_audio_extension

router = APIRouter(prefix="/jobs", tags=["jobs"])

ALLOWED_OUTPUTS = {"mindmap", "flowchart", "dashboard"}


@router.post("/upload")
async def upload(
    audio: UploadFile = File(...),
    outputType: str = Form("flowchart"),
    speakerCount: int = Form(1),
    user: dict = Depends(get_current_user),
):
    if not audio.filename:
        return fail("Audio file required", code="NO_FILE", status_code=400)
    if outputType not in ALLOWED_OUTPUTS:
        return fail("Invalid output type", code="INVALID_OUTPUT_TYPE", status_code=400)
    if not allowed_audio_extension(audio.filename):
        return fail(
            "Unsupported audio format. Accepted: MP3, WAV, M4A, OGG, FLAC, AAC, MP4.",
            code="UNSUPPORTED_FORMAT",
            status_code=400,
        )

    speaker_count = max(1, min(10, int(speakerCount or 1)))

    # Persist upload to temp storage.
    os.makedirs(settings.upload_dir, exist_ok=True)
    suffix = os.path.splitext(audio.filename)[-1] or ".tmp"
    tmp_path = os.path.join(settings.upload_dir, f"{os.urandom(8).hex()}{suffix}")
    size = 0
    try:
        with open(tmp_path, "wb") as out:
            while chunk := await audio.read(1024 * 1024):
                out.write(chunk)
                size += len(chunk)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Upload write failed")
        return fail(f"Upload failed: {exc}", status_code=500)

    if size > settings.max_file_size_bytes:
        os.remove(tmp_path)
        return fail(
            f"File exceeds maximum size of {settings.max_file_size_mb} MB.",
            code="FILE_TOO_LARGE",
            status_code=400,
        )

    job = JobDocument(
        userId=user["sub"],
        outputType=outputType,
        speakerCount=speaker_count,
        fileName=audio.filename,
        fileSizeBytes=size,
        status="pending",
    )
    await job_store.create(job)

    # Launch the async pipeline (fire-and-forget; UI polls status).
    import asyncio

    asyncio.create_task(
        process_job(
            job.jobId,
            file_path=tmp_path,
            filename=audio.filename,
            size_bytes=size,
            output_type=outputType,
            speaker_count=speaker_count,
            is_pro=bool(user.get("isPro")),
        )
    )

    return ok({"jobId": job.jobId})


@router.get("/{job_id}/status")
async def status(job_id: str, user: dict = Depends(get_current_user)):
    job = await job_store.get(job_id)
    if job is None or job.userId != user["sub"]:
        return fail("Job not found", code="JOB_NOT_FOUND", status_code=404)
    return ok(job.to_status().model_dump())


@router.get("/{job_id}/result")
async def result(job_id: str, user: dict = Depends(get_current_user)):
    job = await job_store.get(job_id)
    if job is None or job.userId != user["sub"]:
        return fail("Job not found", code="JOB_NOT_FOUND", status_code=404)
    if job.status != "completed":
        return fail("Job not completed", code="NOT_COMPLETED", status_code=400)
    return ok(job.to_result().model_dump())
