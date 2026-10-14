"""Auth dependency: extracts and verifies the JWT bearer token."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.models.schemas import ErrorDetail
from app.utils.jwt import decode_access_token


def _unauthorized(message: str = "Access token required") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=ErrorDetail(message=message, code="TOKEN_MISSING").model_dump(),
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(authorization: str = Header(default="")) -> dict:
    """Return the decoded JWT payload for the current user."""

    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized()
    token = authorization[7:].strip()
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=ErrorDetail(message="Invalid or expired token", code="TOKEN_INVALID").model_dump(),
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload
