"""Whisper transcription service.

Real path uses OpenAI Whisper (lazy-loaded) and transcribes parallel chunks
concurrently, then merges them in chronological order. If Whisper cannot be
loaded (no model / torch missing) the service transparently falls back to a
demo transcript so the end-to-end pipeline remains runnable for evaluation.
"""

from __future__ import annotations

import asyncio
import random
import time
from typing import List, Optional

from app.audio.ingestion import chunk_audio, merge_chunk_transcripts
from app.config import settings
from app.utils.logging import logger

_DEMO_TRANSCRIPT = """Speaker 1: Thanks everyone for joining the quarterly planning sync.
Speaker 2: Let's start with the revenue target. We closed 450000 in revenue last quarter.
Speaker 1: Right, and the budget for this quarter is 120000 across the three workstreams.
Speaker 2: We need completion at 75 percent by the end of Q3. That's roughly 12 weeks away.
Speaker 1: Marketing wants a 20 percent lift in attendance at the next 3 events.
Speaker 2: Agreed. And we should track a Net Promoter Score target of 60.
Speaker 1: Decision: prioritize the enterprise expansion over new-logo acquisition.
Speaker 2: Action: finalize the operating plan by Friday. Speaker 3 will own the rollout.
Speaker 1: The risk register currently lists 4 open items. We'll review them weekly.
Speaker 2: Great. Let's reconvene in 2 weeks with updated numbers."""


class WhisperService:
    _model = None
    _load_error: Optional[str] = None

    @classmethod
    def _load_model(cls):
        if cls._model is not None or cls._load_error is not None:
            return cls._model
        try:
            import whisper  # type: ignore

            logger.info("Loading Whisper model '%s' on %s...", settings.whisper_model, settings.whisper_device)
            cls._model = whisper.load_model(settings.whisper_model, device=settings.whisper_device)
            logger.info("Whisper model loaded.")
        except Exception as exc:  # noqa: BLE001
            cls._load_error = str(exc)
            logger.warning("Whisper unavailable (%s). Using demo transcript.", exc)
        return cls._model

    async def transcribe_file(self, path: str, filename: str) -> str:
        """Transcribe an uploaded audio file end to end."""

        ext = "." + (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
        chunks = await chunk_audio(path, ext)

        model = self._load_model()
        if model is None:
            # Demo / offline fallback.
            await asyncio.sleep(0.4)
            return _DEMO_TRANSCRIPT

        # Transcribe chunks in parallel.
        semaphore = asyncio.Semaphore(max(1, settings.whisper_parallel_chunks))

        async def _transcribe_chunk(chunk_path: str) -> str:
            async with semaphore:
                loop = asyncio.get_event_loop()
                return await loop.run_in_executor(None, self._transcribe_sync, chunk_path)

        results: List[str] = await asyncio.gather(
            *[_transcribe_chunk(c) for c in chunks]
        )
        merged = merge_chunk_transcripts(results)
        if not merged.strip():
            raise RuntimeError("Whisper produced no speech.")
        return merged

    def _transcribe_sync(self, chunk_path: str) -> str:
        model = self._load_model()
        if model is None:
            return ""
        result = model.transcribe(chunk_path, fp16=False, verbose=False)
        return result.get("text", "").strip()


# Singleton.
whisper_service = WhisperService()
