"""Application configuration loaded from environment / .env file."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed application settings.

    Values are read from environment variables or a local `.env` file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Server
    port: int = 4000

    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017/aurasync"
    mongodb_db: str = "aurasync"

    # Auth
    jwt_secret: str = "change_me_access"
    jwt_refresh_secret: str = "change_me_refresh"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7

    # CORS
    frontend_url: str = "http://localhost:5173"

    # Subscription
    max_free_duration_minutes: int = 30
    max_file_size_mb: int = 100

    # LLM
    llm_provider: str = "openai"
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o-mini"
    llm_timeout_seconds: int = 60
    llm_max_retries: int = 2

    # Whisper & Audio Processing
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_chunk_seconds: int = 300
    whisper_parallel_chunks: int = 4
    supported_audio_formats: str = "mp3,wav,m4a,ogg,flac,aac,mp4"
    whisper_model_size: str = "base"

    # Speaker Detection
    speaker_detection_enabled: bool = True
    max_speakers: int = 10
    speaker_detection_confidence_threshold: float = 0.6
    speaker_colors: list[str] = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"
    ]

    # LLM & Agents
    max_transcript_tokens_for_llm: int = 8000
    agent_temperature: float = 0.2
    enable_regex_fallback: bool = True

    # Knowledge Tree
    max_tree_depth: int = 5
    min_node_priority_threshold: int = 3
    canvas_width_px: int = 1200
    canvas_height_calculation: str = "dynamic"
    node_spacing_px: int = 80
    level_height_px: int = 100
    min_node_gap_px: int = 60
    node_padding_px: int = 24
    default_export_format: str = "svg"


    # Export Formats
    export_formats: str = "png,pdf,svg,jpg"
    png_dpi: int = 300
    png_background: str = "white"
    png_compression: int = 9
    jpg_quality: int = 90
    jpg_background: str = "white"
    pdf_compression: bool = True
    pdf_page_size: str = "A4"
    pdf_margin_mm: int = 20
    svg_embed_fonts: bool = True
    svg_optimize: bool = True

    # Caching & Performance
    analysis_cache_ttl_seconds: int = 3600
    enable_async_export: bool = True
    enable_result_caching: bool = True
    export_storage_path: str = "./uploads/exports"
    max_export_file_size_mb: int = 50

    # Timeouts & Limits
    transcription_timeout_seconds: int = 600
    agent_timeout_seconds: int = 120
    export_timeout_seconds: int = 60
    max_audio_duration_minutes: int = 120

    # Paths
    upload_dir: str = "./uploads"
    temp_dir: str = "./tmp"

    # Demo mode (no real whisper/LLM)
    demo_mode: bool = False

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def max_free_duration_seconds(self) -> int:
        return self.max_free_duration_minutes * 60

    @property
    def parsed_supported_audio_formats(self) -> list[str]:
        return [fmt.strip().lower().lstrip(".") for fmt in self.supported_audio_formats.split(",") if fmt.strip()]

    @property
    def parsed_export_formats(self) -> list[str]:
        return [fmt.strip().lower() for fmt in self.export_formats.split(",") if fmt.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""

    # Ensure .env from the project root is picked up regardless of cwd.
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        os.environ.setdefault("ENV_FILE", str(env_path))
    return Settings()


settings = get_settings()
