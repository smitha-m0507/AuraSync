"""Job store backed by MongoDB (Motor) with an in-memory fallback.

The fallback lets the API run end-to-end without a live MongoDB instance,
which is useful for local evaluation. When MONGODB_URI is reachable, jobs,
users, and reports are persisted there instead.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from app.config import settings
from app.models.schemas import JobDocument
from app.utils.logging import logger

try:
    from motor.motor_asyncio import AsyncIOMotorClient

    _MOTOR_OK = True
except Exception:  # noqa: BLE001
    _MOTOR_OK = False


class JobStore:
    def __init__(self) -> None:
        self._memory: Dict[str, JobDocument] = {}
        self._client = None
        self._db = None
        self.use_mongo = False

    async def connect(self) -> None:
        if not _MOTOR_OK:
            logger.warning("motor not available; using in-memory job store.")
            return
        try:
            self._client = AsyncIOMotorClient(
                settings.mongodb_uri, serverSelectionTimeoutMS=2500
            )
            self._db = self._client[settings.mongodb_db]
            await self._client.admin.command("ping")
            self.use_mongo = True
            logger.info("Connected to MongoDB job store.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("MongoDB unavailable (%s); using in-memory store.", exc)
            self.use_mongo = False

    async def create(self, job: JobDocument) -> None:
        if self.use_mongo:
            await self._db.jobs.insert_one(_to_doc(job))
        else:
            self._memory[job.jobId] = job

    async def get(self, job_id: str) -> Optional[JobDocument]:
        if self.use_mongo:
            doc = await self._db.jobs.find_one({"jobId": job_id})
            return _from_doc(doc) if doc else None
        return self._memory.get(job_id)

    async def update(self, job_id: str, **fields) -> None:
        from datetime import datetime, timezone

        fields["updatedAt"] = datetime.now(timezone.utc)
        if self.use_mongo:
            await self._db.jobs.update_one({"jobId": job_id}, {"$set": fields})
        elif job_id in self._memory:
            for k, v in fields.items():
                setattr(self._memory[job_id], k, v)

    async def set_status(self, job_id: str, status: str, error: Optional[str] = None) -> None:
        from datetime import datetime, timezone

        fields: Dict[str, Any] = {"status": status, "updatedAt": datetime.now(timezone.utc)}
        if error is not None:
            fields["errorMessage"] = error
        if status == "completed":
            fields["completedAt"] = datetime.now(timezone.utc)
        await self.update(job_id, **fields)

    async def save_analysis(self, analysis_doc: Dict[str, Any]) -> None:
        aid = analysis_doc["id"]
        if self.use_mongo:
            doc = dict(analysis_doc)
            doc["_id"] = aid
            await self._db.audio_analyses.replace_one({"_id": aid}, doc, upsert=True)
        else:
            self._memory[f"analysis_{aid}"] = analysis_doc

    async def get_analysis(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        if self.use_mongo:
            doc = await self._db.audio_analyses.find_one({"_id": analysis_id})
            if doc:
                doc.pop("_id", None)
                return doc
            return None
        return self._memory.get(f"analysis_{analysis_id}")


def _to_doc(job: JobDocument) -> Dict[str, Any]:
    d = job.model_dump()
    d["_id"] = job.jobId
    return d


def _from_doc(doc: Dict[str, Any]) -> JobDocument:
    doc = {k: v for k, v in doc.items() if k != "_id"}
    return JobDocument(**doc)


# Singleton.
job_store = JobStore()
