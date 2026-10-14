"""Auth routes: signup, login, refresh, logout, me.

Responses use the { success, data, error } envelope expected by the frontend.
Auth uses Bearer access tokens (Authorization header) and httpOnly refresh
tokens (cookie) exactly like the original Node backend.
"""

from __future__ import annotations

import datetime
from typing import Optional

from fastapi import APIRouter, Header
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.users import user_store
from app.models.schemas import SignupRequest, LoginRequest, ProfileUpdateRequest, UserPublic
from app.utils.jwt import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
)
from app.utils.logging import logger
from app.utils.responses import fail, ok
from app.validators.input_validators import (
    validate_email_format,
    validate_login,
    validate_signup,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _refresh_cookie(refresh_token: str) -> dict:
    return {
        "key": "refreshToken",
        "value": refresh_token,
        "httponly": True,
        "secure": False,
        "samesite": "strict",
        "max_age": settings.refresh_token_expire_days * 24 * 60 * 60,
    }


@router.post("/signup")
async def signup(payload: SignupRequest):
    error = validate_signup(payload.model_dump())
    if error:
        return fail(error, code="VALIDATION_ERROR")
    try:
        user = await user_store.create(
            payload.fullName.strip(),
            payload.email.strip().lower(),
            payload.password,
            payload.purpose,
        )
    except ValueError:
        return fail("Email already registered", code="EMAIL_EXISTS", status_code=409)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Signup failed")
        return fail(str(exc), status_code=500)

    access = create_access_token(user["id"], user["email"], user["isPro"])
    refresh = create_refresh_token(user["id"])
    resp = ok({
        "user": UserPublic(
            id=user["id"], fullName=user["fullName"], email=user["email"],
            purpose=user["purpose"], isPro=user["isPro"],
        ).model_dump(),
        "accessToken": access,
    })
    resp.set_cookie(**_refresh_cookie(refresh))
    return resp


@router.post("/login")
async def login(payload: LoginRequest):
    error = validate_login(payload.model_dump())
    if error:
        return fail(error, code="VALIDATION_ERROR")
    user = await user_store.find_by_email(payload.email.strip().lower())
    if not user or not await user_store.verify_password(user, payload.password):
        return fail("Invalid credentials", code="INVALID_CREDENTIALS", status_code=401)

    access = create_access_token(user["id"], user["email"], user["isPro"])
    refresh = create_refresh_token(user["id"])
    resp = ok({
        "user": UserPublic(
            id=user["id"], fullName=user["fullName"], email=user["email"],
            purpose=user["purpose"], isPro=user["isPro"],
        ).model_dump(),
        "accessToken": access,
    })
    resp.set_cookie(**_refresh_cookie(refresh))
    return resp


@router.post("/refresh")
async def refresh(cookie_refreshToken: Optional[str] = None):
    token = cookie_refreshToken
    if not token:
        return fail("Refresh token required", code="NO_REFRESH_TOKEN", status_code=401)
    payload = decode_refresh_token(token)
    if payload is None:
        return fail("Invalid refresh token", code="INVALID_REFRESH_TOKEN", status_code=401)
    user = await user_store.find_by_id(payload["sub"])
    if not user:
        return fail("User not found", code="USER_NOT_FOUND", status_code=401)
    access = create_access_token(user["id"], user["email"], user["isPro"])
    return ok({
        "accessToken": access,
        "user": UserPublic(
            id=user["id"], fullName=user["fullName"], email=user["email"],
            purpose=user["purpose"], isPro=user["isPro"],
        ).model_dump(),
    })


@router.post("/logout")
async def logout():
    resp = ok({"success": True})
    resp.delete_cookie("refreshToken")
    return resp


@router.get("/me")
async def me(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        return fail("Access token required", code="TOKEN_MISSING", status_code=401)
    from app.utils.jwt import decode_access_token

    payload = decode_access_token(authorization[7:].strip())
    if payload is None:
        return fail("Invalid token", code="TOKEN_INVALID", status_code=401)
    user = await user_store.find_by_id(payload["sub"])
    if not user:
        return fail("User not found", code="USER_NOT_FOUND", status_code=404)
    return ok({
        "user": UserPublic(
            id=user["id"], fullName=user["fullName"], email=user["email"],
            purpose=user["purpose"], isPro=user["isPro"],
        ).model_dump(),
        "accessToken": authorization[7:].strip(),
    })
