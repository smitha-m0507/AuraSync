"""Shared utilities: API envelope builders and serialization helpers."""

from __future__ import annotations

import datetime
import json
from typing import Any, Dict, Optional

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from app.models.schemas import APIResponse, ErrorDetail


def ok(data: Any = None, status_code: int = 200) -> JSONResponse:
    """Build a successful { success: true, data } JSONResponse."""

    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(APIResponse(success=True, data=data)),
    )


def fail(message: str, code: Optional[str] = None, status_code: int = 400) -> JSONResponse:
    """Build a failed { success: false, error } JSONResponse."""

    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(
            APIResponse(success=False, error=ErrorDetail(message=message, code=code))
        ),
    )


def to_jsonable(value: Any) -> Any:
    """Recursively convert datetimes / non-JSON types into JSON-safe values."""

    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if isinstance(value, (set, frozenset)):
        return list(value)
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(v) for v in value]
    return value


def clean_mongo(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a Motor document into a JSON-safe dict (ObjectId -> str)."""

    out: Dict[str, Any] = {}
    for key, value in doc.items():
        if key == "_id":
            out["id"] = str(value)
            continue
        if key == "userId":
            out["userId"] = str(value)
            continue
        out[key] = to_jsonable(value)
    return out
