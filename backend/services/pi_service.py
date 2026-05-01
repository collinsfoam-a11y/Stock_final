"""Persistence helpers for PI assistant endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo.errors import PyMongoError

from backend.db.runtime import get_db


class PiService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_system_stats_context(self) -> str:
        total_items = await self._database.erp_items.count_documents({})
        verified_items = await self._database.erp_items.count_documents({"verified": True})
        active_sessions = await self._database.sessions.count_documents(
            {"status": {"$in": ["OPEN", "ACTIVE"]}}
        )
        total_scans = await self._database.count_lines.count_documents({})

        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "accurate": {"$sum": {"$cond": [{"$eq": ["$variance", 0]}, 1, 0]}},
                }
            }
        ]
        stats = await self._database.count_lines.aggregate(pipeline).to_list(1)
        accurate = stats[0]["accurate"] if stats else 0
        accuracy = (accurate / total_scans * 100) if total_scans > 0 else 100

        return (
            f"System Context (Live Stats):\n"
            f"- Total ERP Items: {total_items}\n"
            f"- Verified Items: {verified_items}\n"
            f"- Active Count Sessions: {active_sessions}\n"
            f"- Total Scans Performed: {total_scans}\n"
            f"- Overall Session Accuracy: {accuracy:.1f}%\n"
        )

    async def persist_chat_history(
        self,
        *,
        username: str,
        messages: list[dict[str, Any]],
        result: dict[str, Any],
    ) -> None:
        user_msg = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        assistant_completion = result["choices"][0]["message"] if result.get("choices") else None

        if user_msg and assistant_completion:
            await self._database.chat_history.insert_one(
                {
                    "username": username,
                    "timestamp": datetime.now(timezone.utc),
                    "user_message": user_msg.get("content"),
                    "assistant_response": assistant_completion.get("content"),
                    "model": result.get("model", "unknown"),
                }
            )

    async def get_chat_history(self, *, username: str, limit: int) -> list[dict[str, Any]]:
        cursor = (
            self._database.chat_history.find({"username": username}, {"_id": 0})
            .sort("timestamp", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)


def get_pi_service() -> PiService:
    return PiService(get_db())


PI_SERVICE_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)
