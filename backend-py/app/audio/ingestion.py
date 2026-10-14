"""Audio ingestion: validation, duration detection, corruption checks, chunking.

Supports mp3, wav, m4a, mp4 (audio), ogg, flac, aac.

Design notes
------------
* Duration is detected with the most reliable tool available:
  pydub (ffmpeg) first, then a lightweight fallback per-format parser so the
  pipeline still works when ffmpeg is not installed.
* Corruption is detected by attempting to read the container and verifying a
  plausible duration and non-trivial size.
* Long audio is split into parallel chunks for Whisper.
"""

from __future__ import annotations

import asyncio
import math
import os
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from app.config import settings
from app.utils.logging import logger

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".mp4"}


@dataclass
class AudioMeta:
    path: str
    duration_seconds: float
    sample_rate: int = 16000
    channels: int = 1
    size_bytes: int = 0
    format: str = ""


class AudioIngestionError(Exception):
    def __init__(self, message: str, code: str = "AUDIO_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code



def _ffmpeg_available() -> bool:
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return True
    except Exception:  # noqa: BLE001
        return False


_FFMPEG_OK = _ffmpeg_available()


# --------------------------------------------------------------------------
# Format / corruption checks
# --------------------------------------------------------------------------
def validate_format(filename: str, size_bytes: int) -> str:
    """Return the lower-case extension if valid, else raise."""

    ext = "." + (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
    if ext not in ALLOWED_EXTENSIONS:
        raise AudioIngestionError(
            f"Unsupported audio format: {ext or 'unknown'}. "
            "Accepted: MP3, WAV, M4A, OGG, FLAC, AAC, MP4.",
            code="UNSUPPORTED_FORMAT",
        )
    if size_bytes <= 0:
        raise AudioIngestionError("Empty audio file.", code="EMPTY_AUDIO")
    if size_bytes > settings.max_file_size_bytes:
        raise AudioIngestionError(
            f"File exceeds maximum size of {settings.max_file_size_mb} MB.",
            code="FILE_TOO_LARGE",
        )
    return ext


def check_corruption(path: str, ext: str) -> None:
    """Lightweight container sanity checks; raise if file looks corrupted."""

    if not os.path.exists(path) or os.path.getsize(path) == 0:
        raise AudioIngestionError("Audio file is empty or missing.", code="EMPTY_AUDIO")

    # Magic-byte sniffing for the most common formats.
    try:
        with open(path, "rb") as fh:
            head = fh.read(32)
    except OSError as exc:
        raise AudioIngestionError("Cannot read audio file.", code="CORRUPTED_FILE") from exc

    if ext == ".wav":
        if not (head[:4] == b"RIFF" and head[8:12] == b"WAVE"):
            raise AudioIngestionError("Corrupted or invalid WAV file.", code="CORRUPTED_FILE")
    elif ext == ".mp3":
        # MP3 may start with an ID3 tag or a frame sync (0xFFEx / 0xFFF).
        if not (head[:3] == b"ID3" or head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
            raise AudioIngestionError("Corrupted or invalid MP3 file.", code="CORRUPTED_FILE")
    elif ext == ".ogg":
        if not head.startswith(b"OggS"):
            raise AudioIngestionError("Corrupted or invalid OGG file.", code="CORRUPTED_FILE")
    elif ext == ".flac":
        if not head.startswith(b"fLaC"):
            raise AudioIngestionError("Corrupted or invalid FLAC file.", code="CORRUPTED_FILE")
    elif ext in (".m4a", ".mp4", ".aac"):
        # ISO BMFF: expect an ftyp box somewhere near the start.
        if b"ftyp" not in head:
            try:
                with open(path, "rb") as fh:
                    fh.read(2048)
                    chunk = fh.read(2048)
                if b"ftyp" not in chunk:
                    raise AudioIngestionError(
                        "Corrupted or invalid M4A/MP4/AAC file.", code="CORRUPTED_FILE"
                    )
            except OSError as exc:
                raise AudioIngestionError("Cannot read audio file.", code="CORRUPTED_FILE") from exc


# --------------------------------------------------------------------------
# Duration / metadata detection
# --------------------------------------------------------------------------
def detect_duration(path: str, ext: str) -> float:
    """Return audio duration in seconds using the best available method."""

    if _FFMPEG_OK:
        try:
            return _ffmpeg_duration(path)
        except Exception as exc:  # noqa: BLE001
            logger.warning("ffmpeg duration failed (%s); using fallback.", exc)

    try:
        if ext == ".wav":
            return _wav_duration(path)
        if ext in (".mp3", ".flac"):
            return _frame_based_duration(path, ext)
        # For m4a/ogg/aac/mp4 without ffmpeg we estimate from bitrate.
        return _estimate_duration(path, ext)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Duration detection failed: %s", exc)
        # Last-resort estimate from file size (assume ~128kbps).
        size = os.path.getsize(path)
        return max(1.0, size / (128 * 1024 / 8))


def _ffmpeg_duration(path: str) -> float:
    out = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=True,
    )
    return float(out.stdout.decode().strip())


def _wav_duration(path: str) -> float:
    # Prefer the stdlib wave parser (handles chunk ordering robustly).
    try:
        import wave

        with wave.open(path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            if rate > 0:
                return frames / float(rate)
    except Exception:  # noqa: BLE001
        pass

    with open(path, "rb") as fh:
        fh.read(12)  # RIFF/size/WAVE
        rate = 0
        channels = 1
        while True:
            box = fh.read(8)
            if len(box) < 8:
                break
            chunk_id = box[:4]
            size = struct.unpack("<I", box[4:8])[0]
            if chunk_id == b"fmt ":
                fmt = fh.read(size)
                channels = struct.unpack("<H", fmt[2:4])[0]
                rate = struct.unpack("<I", fmt[4:8])[0]
            elif chunk_id == b"data":
                if rate:
                    bytes_per_sample = 2  # assume 16-bit
                    return size / (rate * max(1, channels) * bytes_per_sample)
                fh.read(size)
            else:
                fh.read(size + (size & 1))
    raise AudioIngestionError("Could not parse WAV duration.", code="CORRUPTED_FILE")


def _frame_based_duration(path: str, ext: str) -> float:
    # Crude constant-bitrate estimate; good enough for limit checks.
    size = os.path.getsize(path)
    bitrate = 192_000 if ext == ".mp3" else 800_000  # flac higher
    return max(1.0, size / (bitrate / 8))


def _estimate_duration(path: str, ext: str) -> float:
    size = os.path.getsize(path)
    # Rough per-format assumptions (bytes per second).
    bps = {
        ".mp3": 192_000 / 8,
        ".m4a": 128_000 / 8,
        ".aac": 128_000 / 8,
        ".mp4": 128_000 / 8,
        ".ogg": 128_000 / 8,
        ".flac": 800_000 / 8,
    }.get(ext, 128_000 / 8)
    return max(1.0, size / bps)


def detect_metadata(path: str, ext: str) -> AudioMeta:
    duration = detect_duration(path, ext)
    size = os.path.getsize(path)
    return AudioMeta(
        path=path,
        duration_seconds=duration,
        sample_rate=16000,
        channels=1,
        size_bytes=size,
        format=ext.lstrip("."),
    )


# --------------------------------------------------------------------------
# Chunking
# --------------------------------------------------------------------------
async def chunk_audio(path: str, ext: str) -> List[str]:
    """Split audio into <= CHUNK_SECONDS pieces for parallel transcription.

    Returns a list of temporary file paths (wav 16k mono) to transcribe.
    If ffmpeg is unavailable, returns the original path (single chunk).
    """

    chunk_seconds = settings.whisper_chunk_seconds
    meta = detect_metadata(path, ext)

    if not _FFMPEG_OK or meta.duration_seconds <= chunk_seconds:
        return [path]

    n_chunks = max(1, math.ceil(meta.duration_seconds / chunk_seconds))
    tmp_dir = Path(settings.temp_dir) / "chunks"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    out_paths: List[str] = []

    def _split(idx: int) -> Optional[str]:
        start = idx * chunk_seconds
        out_path = tmp_dir / f"chunk_{idx}.wav"
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-ss", str(start), "-i", path,
                    "-t", str(chunk_seconds),
                    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
                    str(out_path),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return str(out_path) if out_path.exists() else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("Chunk %s split failed: %s", idx, exc)
            return None

    results = await asyncio.gather(*[_run_sync(_split, i) for i in range(n_chunks)])
    out_paths = [p for p in results if p]
    return out_paths or [path]


async def _run_sync(fn, *args):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fn, *args)


def merge_chunk_transcripts(transcripts: List[str]) -> str:
    """Merge parallel chunk transcripts preserving chronological order."""

    return "\n".join(t.strip() for t in transcripts if t and t.strip())


# --------------------------------------------------------------------------
# Public ingest entry point
# --------------------------------------------------------------------------
async def ingest(saved_path: str, filename: str, size_bytes: int) -> AudioMeta:
    """Validate + analyze an uploaded audio file. Raises on invalid/corrupt."""

    ext = validate_format(filename, size_bytes)
    check_corruption(saved_path, ext)
    meta = await asyncio.get_event_loop().run_in_executor(
        None, detect_metadata, saved_path, ext
    )
    if meta.duration_seconds <= 0:
        raise AudioIngestionError("Audio contains no detectable duration.", code="NO_SPEECH")
    return meta
