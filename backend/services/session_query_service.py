"""Session read/query service boundary."""

from __future__ import annotations

import inspect
from datetime import datetime, timedelta, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends
from fastapi.params import Depends as DependsParam

from backend.db.runtime import get_db
from backend.services.session_lifecycle_service import SessionLifecycleService


class SessionQueryService:
    def __init__(self, database: Any) -> None:
        self._database = database

    @property
    def database(self) -> Any:
        return self._database

    def lifecycle_service(self) -> SessionLifecycleService:
        return SessionLifecycleService(self._database)

    async def list_erp_items(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        cursor = self._database.erp_items.find(query)
        items: list[dict[str, Any]] = []
        try:
            async for item in cursor:
                items.append(item)
            if items:
                return items
        except TypeError:
            pass

        to_list = cursor.to_list(length=None)
        return await to_list if inspect.isawaitable(to_list) else to_list

    async def aggregate_sessions(
        self, pipeline: list[dict[str, Any]], *, length: int | None
    ) -> list[dict[str, Any]]:
        return await self._database.sessions.aggregate(pipeline).to_list(length)

    async def find_session(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return await self._database.sessions.find_one(query)

    async def get_latest_config_version_id(self) -> str:
        latest_config = await self._database.config_versions.find_one(sort=[("created_at", -1)])
        return latest_config["id"] if latest_config else "LEGACY_NO_VERSION"

    async def list_active_workflow_sessions(
        self, query: dict[str, Any]
    ) -> list[dict[str, Any]]:
        cursor = self._database.sessions.find(query).sort("last_heartbeat", -1)
        return await cursor.to_list(length=200)

    async def aggregate_count_lines(
        self, pipeline: list[dict[str, Any]], *, length: int
    ) -> list[dict[str, Any]]:
        return await self._database.count_lines.aggregate(pipeline).to_list(length=length)

    async def find_users_by_username(
        self, candidate_usernames: set[str]
    ) -> dict[str, dict[str, Any]]:
        if not candidate_usernames:
            return {}
        user_docs = await self._database.users.find(
            {"username": {"$in": sorted(candidate_usernames)}}
        ).to_list(length=len(candidate_usernames))
        return {
            user.get("username"): user
            for user in user_docs
            if isinstance(user.get("username"), str) and user.get("username")
        }

    async def list_sessions(
        self,
        query: dict[str, Any],
        *,
        sort_field: str,
        limit: int,
        skip: int = 0,
    ) -> list[dict[str, Any]]:
        return await self._database.sessions.find(query).sort(sort_field, -1).skip(skip).limit(
            limit
        ).to_list(length=limit)

    async def mark_rack_completed(self, rack_id: str) -> None:
        await self._database.rack_registry.update_one(
            {"rack_id": rack_id},
            {"$set": {"status": "completed", "updated_at": datetime.now().timestamp()}},
        )

    async def count_erp_items(self, query: dict[str, Any]) -> int:
        return await self._database.erp_items.count_documents(query)

    async def get_sync_metadata(self, key: str) -> dict[str, Any] | None:
        return await self._database.sync_metadata.find_one({"_id": key})

    async def count_sessions(self, query: dict[str, Any]) -> int:
        return await self._database.sessions.count_documents(query)

    async def list_sessions_page(
        self, query: dict[str, Any], *, page: int, page_size: int, sort_field: str = "created_at"
    ) -> tuple[list[dict[str, Any]], int]:
        total = await self._database.sessions.count_documents(query)
        skip = (page - 1) * page_size
        sessions = await self._database.sessions.find(query).sort(sort_field, -1).skip(skip).limit(
            page_size
        ).to_list(length=page_size)
        return sessions, total

    async def find_session_by_id_or_session_id(self, session_id: str) -> dict[str, Any] | None:
        try:
            session = await self._database.sessions.find_one({"_id": ObjectId(session_id)})
        except (InvalidId, TypeError):
            session = None
        if session:
            return session
        return await self._database.sessions.find_one({"session_id": session_id})

    async def get_rack_progress(self, *, warehouse: str, session_id: str) -> list[dict[str, Any]]:
        total_pipeline = [
            {"$match": {"warehouse": warehouse, "rack": {"$exists": True, "$ne": ""}}},
            {"$group": {"_id": "$rack", "total_items": {"$sum": 1}}},
        ]
        total_counts = await self._database.erp_items.aggregate(total_pipeline).to_list(length=1000)
        totals_map = {item["_id"]: item["total_items"] for item in total_counts}

        count_pipeline = [
            {"$match": {"session_id": session_id}},
            {"$group": {"_id": "$item_code"}},
        ]
        counted_items = await self._database.count_lines.aggregate(count_pipeline).to_list(
            length=10000
        )
        counted_item_codes = [item["_id"] for item in counted_items]

        progress_map = {}
        if counted_item_codes:
            progress_pipeline = [
                {
                    "$match": {
                        "warehouse": warehouse,
                        "item_code": {"$in": counted_item_codes},
                        "rack": {"$exists": True, "$ne": ""},
                    }
                },
                {"$group": {"_id": "$rack", "counted_items": {"$sum": 1}}},
            ]
            progress_counts = await self._database.erp_items.aggregate(progress_pipeline).to_list(
                length=1000
            )
            progress_map = {item["_id"]: item["counted_items"] for item in progress_counts}

        rack_progress = []
        for rack in sorted(set(totals_map.keys()) | set(progress_map.keys())):
            total = totals_map.get(rack, 0)
            counted = progress_map.get(rack, 0)
            percentage = min(round((counted / total * 100), 1), 100) if total > 0 else 0
            rack_progress.append(
                {"rack": rack, "total": total, "counted": counted, "percentage": percentage}
            )
        return rack_progress

    async def get_watchtower_stats(self, *, add_fields_stage: dict[str, Any], risk_service: Any) -> dict[str, Any]:
        active_sessions_count = await self._database.sessions.count_documents({"status": "OPEN"})
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        total_scans_today_result = await self._database.count_lines.aggregate(
            [
                add_fields_stage,
                {"$match": {"counted_at_normalized": {"$gte": today_start}}},
                {"$count": "count"},
            ]
        ).to_list(length=1)
        total_scans_today = total_scans_today_result[0]["count"] if total_scans_today_result else 0

        fifteen_mins_ago = now - timedelta(minutes=15)
        active_users_result = await self._database.count_lines.aggregate(
            [
                add_fields_stage,
                {"$match": {"counted_at_normalized": {"$gte": fifteen_mins_ago}}},
                {"$group": {"_id": "$counted_by"}},
                {"$count": "count"},
            ]
        ).to_list(length=1)
        active_users_count = active_users_result[0]["count"] if active_users_result else 0

        throughput_data = await self._database.count_lines.aggregate(
            [
                add_fields_stage,
                {"$match": {"counted_at_normalized": {"$gte": today_start}}},
                {"$group": {"_id": {"$hour": "$counted_at_normalized"}, "count": {"$sum": 1}}},
                {"$sort": {"_id": 1}},
            ]
        ).to_list(length=24)
        hourly_throughput = [0] * 24
        for item in throughput_data:
            hour = item["_id"]
            if 0 <= hour < 24:
                hourly_throughput[hour] = item["count"]

        recent_activity = await self._database.count_lines.aggregate(
            [
                add_fields_stage,
                {"$match": {"counted_at_normalized": {"$gte": today_start}}},
                {"$sort": {"counted_at_normalized": -1}},
                {"$limit": 5},
            ]
        ).to_list(length=5)

        active_sessions = await self._database.sessions.find({"status": "OPEN"}).to_list(length=10)
        risk_predictions = []
        total_high_risk = 0
        for session in active_sessions:
            predictions = await risk_service.predict_session_risks(
                self._database, str(session["_id"]), limit=3
            )
            risk_predictions.extend(predictions)
            total_high_risk += len(predictions)
            if len(risk_predictions) >= 5:
                break

        return {
            "active_sessions": active_sessions_count,
            "total_scans_today": total_scans_today,
            "active_users": active_users_count,
            "hourly_throughput": hourly_throughput,
            "predicted_risk_count": total_high_risk,
            "high_risk_items": risk_predictions[:5],
            "recent_activity": recent_activity,
        }

    async def predict_session_risks(
        self, *, risk_service: Any, session_id: str, limit: int
    ) -> list[dict[str, Any]]:
        return await risk_service.predict_session_risks(self._database, session_id, limit)


def get_session_query_service(database: Any = Depends(get_db)) -> SessionQueryService:
    if isinstance(database, DependsParam):
        database = get_db()
    return SessionQueryService(database)
