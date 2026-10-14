"""Audio Intelligence API Routes (audio.py).

Implements Section 5 prompt endpoints:
- POST /api/audio/analyze-and-generate-tree
- GET  /api/audio/analyses/{analysisId}
- GET  /api/audio/{analysisId}/export/{format}
- GET  /api/audio/export-file/{filename}
"""

from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response

from app.audio.ingestion import AudioIngestionError, ingest
from app.audio.transcription import whisper_service
from app.config import settings
from app.services.job_store import job_store
from app.services.pipeline import run_audio_intelligence_pipeline
from app.utils.logging import logger
from app.validators.input_validators import allowed_audio_extension

router = APIRouter(tags=["audio"])

MIME_TYPES = {
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "pdf": "application/pdf",
}


@router.post("/audio/analyze-and-generate-tree")
@router.post("/v1/audio/analyze-and-generate-tree")
async def analyze_and_generate_tree(
    audio_file: UploadFile = File(...),
    export_formats: Optional[str] = Form(None),
    speaker_labels: Optional[str] = Form(None),
    include_metrics: bool = Form(True),
    tree_depth_limit: int = Form(settings.max_tree_depth),
):
    """Primary endpoint to analyze audio and return Hierarchical Knowledge Tree + exports."""

    start_time = time.monotonic()
    if not audio_file.filename:
        raise HTTPException(status_code=400, detail="Audio file required")

    if not allowed_audio_extension(audio_file.filename):
        ext = os.path.splitext(audio_file.filename)[-1]
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "error": "Unsupported audio format",
                "details": f"Only MP3, WAV, M4A, OGG, FLAC, AAC supported. Received: {ext}",
            },
        )

    # Parse export_formats parameter
    parsed_formats: List[str] = settings.parsed_export_formats
    if export_formats:
        try:
            if export_formats.startswith("["):
                parsed_formats = json.loads(export_formats)
            else:
                parsed_formats = [f.strip() for f in export_formats.split(",") if f.strip()]
        except Exception:  # noqa: BLE001
            pass

    # Parse speaker_labels dictionary
    parsed_labels: Dict[str, str] = {}
    if speaker_labels:
        try:
            parsed_labels = json.loads(speaker_labels)
        except Exception:  # noqa: BLE001
            pass

    # Save audio file to temp directory
    os.makedirs(settings.upload_dir, exist_ok=True)
    suffix = os.path.splitext(audio_file.filename)[-1] or ".tmp"
    tmp_path = os.path.join(settings.upload_dir, f"{uuid.uuid4().hex}{suffix}")
    size = 0

    try:
        with open(tmp_path, "wb") as out:
            while chunk := await audio_file.read(1024 * 1024):
                out.write(chunk)
                size += len(chunk)
    except Exception as exc:  # noqa: BLE001
        logger.exception("File save failed")
        raise HTTPException(status_code=500, detail=f"Upload save failed: {exc}")

    # Validate audio format & duration
    try:
        t0_trans = time.monotonic()
        meta = await ingest(tmp_path, audio_file.filename, size)

        # Transcribe audio
        transcript = await whisper_service.transcribe_file(tmp_path, audio_file.filename)
        transcription_ms = round((time.monotonic() - t0_trans) * 1000, 1)

        word_count = len(transcript.split())

        # Run multi-agent pipeline
        result = await run_audio_intelligence_pipeline(
            transcript=transcript,
            output_type="knowledge_tree",
            speaker_labels=parsed_labels,
            export_formats=parsed_formats,
            duration_seconds=meta.duration_seconds,
            word_count=word_count,
        )

        total_ms = round((time.monotonic() - start_time) * 1000, 1)

        tree = result.get("knowledgeTree", {})
        nodes = tree.get("nodes", [])
        edges = tree.get("edges", [])
        tree_meta = tree.get("metadata", {})

        analysis_id = uuid.uuid4().hex
        response_payload = {
            "status": "success",
            "analysisId": analysis_id,
            "analysis": {
                "title": result.get("title", "Knowledge Tree Analysis"),
                "summary": result.get("summary", ""),
                "tags": result.get("tags", []),
                "speakerCount": result.get("speakerCount", 1),
                "speakers": result.get("speakers", []),
                "knowledgeTree": {
                    "nodeCount": len(nodes),
                    "edgeCount": len(edges),
                    "maxDepth": tree_meta.get("max_depth", 1),
                    "confidenceScore": tree_meta.get("confidence_score", 0.9),
                    "data": tree,
                },
            },
            "exports": result.get("exports", {}),
            "processingTime": {
                "total_ms": total_ms,
                "breakdown": {
                    "transcription_ms": transcription_ms,
                    "flow_agent_ms": result.get("processingTime", {}).get("flow_agent_ms", 0),
                    "speaker_agent_ms": result.get("processingTime", {}).get("speaker_agent_ms", 0),
                    "metric_agent_ms": result.get("processingTime", {}).get("metric_agent_ms", 0),
                    "tree_generation_ms": result.get("processingTime", {}).get("tree_generation_ms", 0),
                    "export_ms": result.get("processingTime", {}).get("export_ms", 0),
                },
            },
        }

        # Save analysis result to store
        doc = {
            "id": analysis_id,
            "userId": "anonymous",
            "originalFileName": audio_file.filename,
            "title": result.get("title", ""),
            "summary": result.get("summary", ""),
            "result": response_payload,
            "status": "completed",
            "createdAt": time.time(),
        }
        await job_store.save_analysis(doc)

        return JSONResponse(status_code=200, content=response_payload)

    except AudioIngestionError as exc:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "error": exc.message, "details": str(exc)},
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Audio tree analysis failed")
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": "Analysis failed", "details": str(exc)},
        )


@router.get("/audio/analyses/{analysis_id}")
@router.get("/v1/audio/analyses/{analysis_id}")
async def get_analysis_status(analysis_id: str):
    """Poll analysis status endpoint."""
    analysis = await job_store.get_analysis(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return JSONResponse(
        status_code=200,
        content={
            "status": analysis.get("status", "completed"),
            "progress_percent": 100 if analysis.get("status") == "completed" else 50,
            "result": analysis.get("result"),
        },
    )


@router.get("/audio/{analysis_id}/export/{format}")
@router.get("/v1/audio/{analysis_id}/export/{format}")
async def download_export_by_analysis(
    analysis_id: str,
    format: str,
    dpi: Optional[int] = Query(300),
    quality: Optional[int] = Query(90),
):
    """Download export file by format (svg, png, jpg, pdf)."""
    fmt = format.lower().strip()
    if fmt not in MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

    analysis = await job_store.get_analysis(analysis_id)
    if not analysis or "result" not in analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    exports = analysis["result"].get("exports", {})
    if fmt not in exports:
        raise HTTPException(status_code=404, detail=f"Export format '{fmt}' not available for this analysis")

    item = exports[fmt]
    url = item.get("downloadUrl", "")
    filename = url.rsplit("/", 1)[-1] if "/" in url else f"export.{fmt}"
    file_path = Path(settings.export_storage_path) / filename

    if file_path.exists():
        mime = MIME_TYPES.get(fmt, "application/octet-stream")
        return FileResponse(
            path=str(file_path),
            media_type=mime,
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if fmt == "svg" and "content" in item:
        return Response(
            content=item["content"],
            media_type="image/svg+xml",
            headers={"Content-Disposition": f'attachment; filename="knowledge_tree.svg"'},
        )

    raise HTTPException(status_code=440, detail="Export file missing")


@router.get("/audio/export-file/{filename}")
@router.get("/v1/audio/export-file/{filename}")
async def download_export_file(filename: str):
    """Direct binary download endpoint for generated export files."""
    file_path = Path(settings.export_storage_path) / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Export file not found")

    ext = filename.rsplit(".", 1)[-1].lower()
    mime = MIME_TYPES.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(file_path),
        media_type=mime,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
