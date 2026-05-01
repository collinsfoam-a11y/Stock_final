"""Database-backed metrics query helpers."""

from __future__ import annotations

import time
from typing import Any

import psutil
from pymongo.errors import PyMongoError

from backend.db.runtime import get_db


class MetricsQueryService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_system_stats(self, monitoring_service: Any | None) -> dict[str, Any]:
        stats: dict[str, Any] = {
            "timestamp": time.time(),
            "system": {
                "cpu_percent": psutil.cpu_percent(interval=1),
                "memory_percent": psutil.virtual_memory().percent,
                "disk_percent": psutil.disk_usage("/").percent,
            },
            "mongodb": {"status": "unknown"},
            "sql_server": {"status": "disabled"},
            "services": {},
        }

        try:
            await self._database.command("ping")
            stats["mongodb"] = {"status": "connected", "database": self._database.name}
        except (PyMongoError, RuntimeError, TypeError, ValueError) as exc:
            stats["mongodb"] = {"status": "disconnected", "error": str(exc)}

        if monitoring_service is not None:
            try:
                stats["services"] = await monitoring_service.get_metrics()
            except (RuntimeError, TypeError, ValueError) as exc:
                stats["services"] = {"error": str(exc)}

        return stats

    async def get_staff_performance(self) -> list[dict[str, Any]]:
        items_pipeline = [
            {
                "$group": {
                    "_id": "$scanned_by",
                    "items_scanned": {"$sum": 1},
                    "last_scan": {"$max": "$timestamp"},
                }
            },
            {"$sort": {"items_scanned": -1}},
        ]
        items_stats = await self._database.erp_items.aggregate(items_pipeline).to_list(length=100)

        variance_pipeline = [
            {"$match": {"variance": {"$nin": [0, None]}}},
            {"$group": {"_id": "$counted_by", "variances_found": {"$sum": 1}}},
        ]
        variance_stats = await self._database.count_lines.aggregate(variance_pipeline).to_list(
            length=100
        )
        variance_map = {v["_id"]: v["variances_found"] for v in variance_stats}

        performance_data = []
        for stat in items_stats:
            user_id = stat["_id"]
            if not user_id:
                continue
            performance_data.append(
                {
                    "user": user_id,
                    "items_scanned": stat["items_scanned"],
                    "variances_found": variance_map.get(user_id, 0),
                    "last_active": stat["last_scan"],
                }
            )
        return performance_data


def get_metrics_query_service() -> MetricsQueryService:
    return MetricsQueryService(get_db())
