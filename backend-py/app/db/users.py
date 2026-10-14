"""User store backed by MongoDB (Motor) with an in-memory fallback.

Mirrors the Node User model: fullName, email (unique), passwordHash, purpose,
isPro. Supports signup, login, profile update, and Pro upgrade.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Any, Dict, Optional

import bcrypt

from app.config import settings
from app.utils.logging import logger

try:
    from motor.motor_asyncio import AsyncIOMotorClient

    _MOTOR_OK = True
except Exception:  # noqa: BLE001
    _MOTOR_OK = False


class UserStore:
    def __init__(self) -> None:
        self._memory: Dict[str, Dict[str, Any]] = {}
        self._client = None
        self._db = None
        self.use_mongo = False

    async def connect(self) -> None:
        if not _MOTOR_OK:
            logger.warning("motor not available; using in-memory user store.")
            return
        try:
            self._client = AsyncIOMotorClient(
                settings.mongodb_uri, serverSelectionTimeoutMS=2500
            )
            self._db = self._client[settings.mongodb_db]
            await self._client.admin.command("ping")
            self.use_mongo = True
            logger.info("Connected to MongoDB user store.")
        except Exception as exc:  # noqa: BLE001
            logger.warning("MongoDB unavailable (%s); using in-memory store.", exc)
            self.use_mongo = False

    async def _exists(self, email: str) -> bool:
        if self.use_mongo:
            return await self._db.users.find_one({"email": email.lower()}) is not None
        return any(u["email"] == email.lower() for u in self._memory.values())

    async def create(self, full_name: str, email: str, password: str, purpose: str) -> Dict[str, Any]:
        if await self._exists(email):
            raise ValueError("EMAIL_EXISTS")
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode()
        user = {
            "id": uuid.uuid4().hex,
            "fullName": full_name,
            "email": email.lower(),
            "passwordHash": password_hash,
            "purpose": purpose,
            "isPro": False,
        }
        if self.use_mongo:
            res = await self._db.users.insert_one({**user, "_id": user["id"]})
        else:
            self._memory[user["id"]] = user
        return user

    async def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        if self.use_mongo:
            doc = await self._db.users.find_one({"email": email.lower()})
            return _clean(doc) if doc else None
        for u in self._memory.values():
            if u["email"] == email.lower():
                return u
        return None

    async def find_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        if self.use_mongo:
            doc = await self._db.users.find_one({"_id": user_id})
            return _clean(doc) if doc else None
        return self._memory.get(user_id)

    async def update(self, user_id: str, **fields) -> Optional[Dict[str, Any]]:
        if self.use_mongo:
            await self._db.users.update_one({"_id": user_id}, {"$set": fields})
            return await self.find_by_id(user_id)
        if user_id in self._memory:
            self._memory[user_id].update(fields)
            return self._memory[user_id]
        return None

    async def verify_password(self, user: Dict[str, Any], password: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode(), user["passwordHash"].encode())
        except Exception:  # noqa: BLE001
            return False


def _clean(doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = dict(doc)
    doc["id"] = str(doc.get("_id"))
    doc.pop("_id", None)
    doc.pop("passwordHash", None)
    return doc


# Singleton.
user_store = UserStore()
