"""JWT helpers (access + refresh tokens) compatible with the frontend."""

from __future__ import annotations

import datetime
from typing import Optional

from jose import JWTError, jwt

from app.config import settings


def _create_token(
    subject: str,
    secret: str,
    expires_delta: datetime.timedelta,
    token_type: str,
    extra: Optional[dict] = None,
) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    payload: dict = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, secret, algorithm="HS256")


def create_access_token(user_id: str, email: str, is_pro: bool = False) -> str:
    return _create_token(
        subject=user_id,
        secret=settings.jwt_secret,
        expires_delta=datetime.timedelta(minutes=settings.access_token_expire_minutes),
        token_type="access",
        extra={"email": email, "isPro": is_pro},
    )


def create_refresh_token(user_id: str) -> str:
    return _create_token(
        subject=user_id,
        secret=settings.jwt_refresh_secret,
        expires_delta=datetime.timedelta(days=settings.refresh_token_expire_days),
        token_type="refresh",
    )


def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
