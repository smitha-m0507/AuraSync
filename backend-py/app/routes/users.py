"""Users routes: profile get/update, Pro upgrade."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.db.users import user_store
from app.models.schemas import ProfileUpdateRequest, UserPublic
from app.routes.deps import get_current_user
from app.utils.responses import fail, ok
from app.validators.input_validators import validate_profile_update

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    db_user = await user_store.find_by_id(user["sub"])
    if not db_user:
        return fail("User not found", code="USER_NOT_FOUND", status_code=404)
    return ok(UserPublic(
        id=db_user["id"], fullName=db_user["fullName"], email=db_user["email"],
        purpose=db_user["purpose"], isPro=db_user["isPro"],
    ).model_dump())


@router.patch("/profile")
async def update_profile(payload: ProfileUpdateRequest, user: dict = Depends(get_current_user)):
    error = validate_profile_update(payload.model_dump())
    if error:
        return fail(error, code="VALIDATION_ERROR")
    update_fields = {}
    if payload.fullName:
        update_fields["fullName"] = payload.fullName.strip()
    db_user = await user_store.update(user["sub"], **update_fields)
    if not db_user:
        return fail("User not found", code="USER_NOT_FOUND", status_code=404)
    return ok(UserPublic(
        id=db_user["id"], fullName=db_user["fullName"], email=db_user["email"],
        purpose=db_user["purpose"], isPro=db_user["isPro"],
    ).model_dump())


@router.patch("/upgrade")
async def upgrade(user: dict = Depends(get_current_user)):
    db_user = await user_store.update(user["sub"], isPro=True)
    if not db_user:
        return fail("User not found", code="USER_NOT_FOUND", status_code=404)
    return ok(UserPublic(
        id=db_user["id"], fullName=db_user["fullName"], email=db_user["email"],
        purpose=db_user["purpose"], isPro=db_user["isPro"],
    ).model_dump())
