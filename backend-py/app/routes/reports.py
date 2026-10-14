"""Reports routes: list, get, save, delete, star."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.db.reports import report_store
from app.models.schemas import ReportCreate
from app.routes.deps import get_current_user
from app.utils.responses import fail, ok

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def list_reports(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=50),
    filter: str = Query("all"),
    user: dict = Depends(get_current_user),
):
    try:
        data = await report_store.list_for_user(
            user["sub"], page=page, limit=limit, filter_=filter
        )
        return ok(data)
    except Exception as exc:  # noqa: BLE001
        return fail(str(exc), status_code=500)


@router.get("/{report_id}")
async def get_report(report_id: str, user: dict = Depends(get_current_user)):
    report = await report_store.get(user["sub"], report_id)
    if not report:
        return fail("Report not found", code="REPORT_NOT_FOUND", status_code=404)
    return ok(report)


@router.post("")
async def create_report(payload: ReportCreate, user: dict = Depends(get_current_user)):
    title = payload.title
    output_type = payload.outputType
    visual_data = payload.visualData
    if not title or not output_type or not visual_data:
        return fail("Missing required fields", code="MISSING_FIELDS", status_code=400)
    try:
        report = await report_store.create(
            user["sub"],
            {
                "title": title,
                "outputType": output_type,
                "speakerCount": int(payload.speakerCount or 1),
                "executiveSummary": payload.executiveSummary,
                "tags": payload.tags or [],
                "visualData": visual_data,
                "dashboardData": payload.dashboardData,
                "jobId": payload.jobId,
            },
        )
        return ok({
            "id": report["id"],
            "title": report["title"],
            "outputType": report["outputType"],
            "speakerCount": report["speakerCount"],
            "createdAt": report.get("createdAt"),
        })
    except Exception as exc:  # noqa: BLE001
        return fail(str(exc), status_code=500)


@router.delete("/{report_id}")
async def delete_report(report_id: str, user: dict = Depends(get_current_user)):
    deleted = await report_store.delete(user["sub"], report_id)
    if not deleted:
        return fail("Report not found", code="REPORT_NOT_FOUND", status_code=404)
    return ok({"success": True})


@router.patch("/{report_id}/star")
async def toggle_star(report_id: str, user: dict = Depends(get_current_user)):
    is_starred = await report_store.toggle_star(user["sub"], report_id)
    if is_starred is None:
        return fail("Report not found", code="REPORT_NOT_FOUND", status_code=404)
    return ok({"isStarred": is_starred})
