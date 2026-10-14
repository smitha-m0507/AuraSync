"""AuraSync FastAPI application entry point.

Wires CORS, routers, startup (DB + whisper warmup), health check, and a global
error handler that preserves the { success, data, error } envelope.
"""

from __future__ import annotations

import os
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.reports import report_store
from app.db.users import user_store
from app.routes import audio, auth, jobs, reports, users
from app.services.job_store import job_store as analysis_job_store
from app.utils.logging import logger
from app.utils.responses import fail

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(
    title="AuraSync API",
    description="Asynchronous Multi-Agent Audio-to-Visual Compiling Engine",
    version="1.0.0",
)

# CORS: allow the React dev server with credentials (cookies).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.temp_dir, exist_ok=True)
    os.makedirs(settings.export_storage_path, exist_ok=True)
    await user_store.connect()
    await report_store.connect()
    await analysis_job_store.connect()
    logger.info(
        "AuraSync API ready. LLM mode=%s, Whisper model=%s, demo_mode=%s",
        "openai" if _llm_enabled() else "fallback",
        settings.whisper_model,
        settings.demo_mode,
    )


def _llm_enabled() -> bool:
    from app.utils.llm import llm_client

    return llm_client.enabled


@app.get("/health")
async def health():
    return {"success": True, "data": {"message": "AuraSync API healthy"}}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s", request.url.path)
    return fail("Internal server error", code="INTERNAL_ERROR", status_code=500)


# Mount routers
app.include_router(audio.router, prefix="/api")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")



def run() -> None:
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    run()
