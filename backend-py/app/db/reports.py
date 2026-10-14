"""Report store (saved AuraSync outputs). Mongo with in-memory fallback."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from app.config import settings
from app.utils.logging import logger

try:
    from motor.motor_asyncio import AsyncIOMotorClient

    _MOTOR_OK = True
except Exception:  # noqa: BLE001
    _MOTOR_OK = False


class ReportStore:
    def __init__(self) -> None:
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._client = None
        self._db = None
        self.use_mongo = False

    async def connect(self) -> None:
        if not _MOTOR_OK:
            logger.warning("motor not available; using in-memory report store.")
            return
        try:
            self._client = AsyncIOMotorClient(
                settings.mongodb_uri, serverSelectionTimeoutMS=2500
            )
            self._db = self._client[settings.mongodb_db]
            await self._client.admin.command("ping")
            self.use_mongo = True
            logger.info("Connected to MongoDB report store.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("MongoDB unavailable (%s); using in-memory store.", exc)
            self.use_mongo = False

    async def create(self, user_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        report = {
            "id": uuid.uuid4().hex,
            "userId": user_id,
            "isStarred": False,
            **data,
        }
        if self.use_mongo:
            await self._db.reports.insert_one({**report, "_id": report["id"]})
        else:
            self._memory[report["id"]] = report
        return report

    async def list_for_user(self, user_id: str, *, page: int = 1, limit: int = 10, filter_: str = "all"):
        if self.use_mongo:
            query: Dict[str, Any] = {"userId": user_id}
            if filter_ == "starred":
                query["isStarred"] = True
            elif filter_ in ("mindmap", "flowchart", "dashboard"):
                query["outputType"] = filter_
            cursor = self._db.reports.find(query).sort("createdAt", -1)
            total = await self._db.reports.count_documents(query)
            docs = await cursor.skip((page - 1) * limit).limit(limit).to_list(length=limit)
            items = [_clean(d) for d in docs]
        else:
            items_all = [r for r in self._memory.values() if r["userId"] == user_id]
            if filter_ == "starred":
                items_all = [r for r in items_all if r.get("isStarred")]
            elif filter_ in ("mindmap", "flowchart", "dashboard"):
                items_all = [r for r in items_all if r.get("outputType") == filter_]
            total = len(items_all)
            items = items_all[(page - 1) * limit: (page - 1) * limit + limit]
            items = [_clean(r) for r in items]
        return {
            "reports": items,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": max(1, (total + limit - 1) // limit),
            },
        }

    async def get(self, user_id: str, report_id: str) -> Optional[Dict[str, Any]]:
        if self.use_mongo:
            doc = await self._db.reports.find_one({"_id": report_id, "userId": user_id})
            return _clean(doc) if doc else None
        r = self._memory.get(report_id)
        return r if r and r["userId"] == user_id else None

    async def delete(self, user_id: str, report_id: str) -> bool:
        if self.use_mongo:
            res = await self._db.reports.delete_one({"_id": report_id, "userId": user_id})
            return res.deleted_count > 0
        if report_id in self._memory and self._memory[report_id]["userId"] == user_id:
            self._memory.pop(report_id, None)
            return True
        return False

    async def toggle_star(self, user_id: str, report_id: str) -> Optional[bool]:
        report = await self.get(user_id, report_id)
        if not report:
            return None
        new_val = not report.get("isStarred", False)
        if self.use_mongo:
            await self._db.reports.update_one(
                {"_id": report_id, "userId": user_id}, {"$set": {"isStarred": new_val}}
            )
        else:
            self._memory[report_id]["isStarred"] = new_val
        return new_val


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.get("_id"))
    doc.pop("_id", None)
    return doc


# Singleton.
report_store = ReportStore()
