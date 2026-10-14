"""Input validators for auth and upload requests."""

from __future__ import annotations

import re
from typing import Optional

from app.utils.responses import fail

# Email allowed by the frontend (official / organizational only).
_PERSONAL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com",
    "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com",
    "yandex.com", "gmx.com", "mail.com",
}

_ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".mp4"}

_EMAIL_RE = re.compile(r"^[^\s@]+@([^\s@]+\.[^\s@]+)$")


def is_personal_email(email: str) -> bool:
    match = _EMAIL_RE.match(email or "")
    if not match:
        return True
    domain = match.group(1).lower()
    if domain in _PERSONAL_DOMAINS:
        return True
    return bool(re.search(r"(gmail|yahoo|hotmail|outlook|icloud|aol|proton|live|msn|yandex|gmx|mail)", domain))


def validate_email_format(email: str) -> Optional[str]:
    if not _EMAIL_RE.match(email or ""):
        return "Invalid email format."
    if is_personal_email(email):
        return "Personal email domains are not allowed."
    return None


def validate_signup(body: dict) -> Optional[str]:
    name = (body.get("fullName") or "").strip()
    email = (body.get("email") or "").strip()
    password = body.get("password") or ""
    purpose = body.get("purpose") or ""

    if not name:
        return "Full name is required."
    email_err = validate_email_format(email)
    if email_err:
        return email_err
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if purpose not in ("Education", "Enterprise"):
        return "Purpose must be Education or Enterprise."
    return None


def validate_login(body: dict) -> Optional[str]:
    if not (body.get("email") and body.get("password")):
        return "Email and password are required."
    return None


def validate_profile_update(body: dict) -> Optional[str]:
    name = (body.get("fullName") or "").strip()
    if name and len(name) < 1:
        return "Full name cannot be empty."
    return None


def allowed_audio_extension(filename: str) -> bool:
    ext = "." + (filename.rsplit(".", 1)[-1].lower() if "." in filename else "")
    return ext in _ALLOWED_EXT
