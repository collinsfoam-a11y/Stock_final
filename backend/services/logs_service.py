"""Service layer for error and activity log reads."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from backend.auth.dependencies import auth_deps


class LogsService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def list_error_logs(
        self,
        *,
        query: dict[str, Any],
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        total = await self._database.error_logs.count_documents(query)
        cursor = (
            self._database.error_logs.find(query)
            .sort("timestamp", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        return [self._with_id(doc) async for doc in cursor], total

    async def delete_error_logs(self) -> None:
        await self._database.error_logs.delete_many({})

    async def get_error_stats(self, query: dict[str, Any]) -> dict[str, Any]:
        total = await self._database.error_logs.count_documents(query)
        unresolved = await self._database.error_logs.count_documents({**query, "resolved": False})
        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
        ]
        severity_counts: dict[str, int] = {}
        async for doc in self._database.error_logs.aggregate(pipeline):
            severity_counts[doc["_id"]] = doc["count"]
        return {
            "total": total,
            "unresolved": unresolved,
            "by_severity": severity_counts,
            "trend": [],
        }

    async def get_error_detail(self, log_id: ObjectId) -> dict[str, Any] | None:
        doc = await self._database.error_logs.find_one({"_id": log_id})
        return self._with_id(doc) if doc else None

    async def resolve_error(
        self,
        *,
        log_id: ObjectId,
        resolution_note: str,
        resolved_by: str | None,
    ) -> int:
        result = await self._database.error_logs.update_one(
            {"_id": log_id},
            {
                "$set": {
                    "resolved": True,
                    "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "resolved_by": resolved_by,
                    "resolution_note": resolution_note,
                }
            },
        )
        return int(result.modified_count)

    async def list_activity_logs(
        self,
        *,
        query: dict[str, Any],
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        total = await self._database.activity_logs.count_documents(query)
        cursor = (
            self._database.activity_logs.find(query)
            .sort("timestamp", -1)
            .skip((page - 1) * page_size)
            .limit(page_size)
        )
        return [self._with_id(doc) async for doc in cursor], total

    async def get_activity_stats(self, query: dict[str, Any]) -> dict[str, Any]:
        total = await self._database.activity_logs.count_documents(query)
        pipeline: list[dict[str, Any]] = [
            {"$match": query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        status_counts: dict[str, int] = {}
        async for doc in self._database.activity_logs.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        return {"total": total, "by_status": status_counts, "trend": []}

    @staticmethod
    def _with_id(doc: dict[str, Any]) -> dict[str, Any]:
        item = dict(doc)
        item["id"] = str(item.pop("_id"))
        return item


def get_logs_service() -> LogsService:
    return LogsService(auth_deps.db)
