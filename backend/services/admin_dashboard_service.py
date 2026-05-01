"""Read-side service for admin dashboard data."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from pymongo.errors import PyMongoError

from backend.db.runtime import get_db
from backend.services.projection_read_service import ProjectionReadService
from backend.services.shadow_read_service import schedule_shadow_compare
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
DASHBOARD_ERROR_TYPES = (
    PyMongoError,
    RuntimeError,
    TypeError,
    ValueError,
    KeyError,
    AttributeError,
    OSError,
)


class AdminDashboardService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_projection_admin_kpis(self, *, active_users: int) -> dict[str, Any]:
        result = await ProjectionReadService(
            self._database, enforce_readiness=True
        ).get_admin_kpis(active_users=active_users)
        schedule_shadow_compare(
            endpoint="admin_dashboard.kpis",
            primary=result,
            baseline_factory=lambda: self.get_admin_kpis_baseline(
                active_users=active_users
            ),
            params={"active_users": active_users},
        )
        return result

    async def get_admin_kpis_baseline(self, *, active_users: int) -> dict[str, Any]:
        return {
            "total_stock_value": await self.calculate_total_stock_value(),
            "verified_stock_value": await self.calculate_verified_value(),
            "verification_percentage": await self.calculate_completion_percentage(),
            "active_sessions": await self.count_active_sessions(),
            "active_users": active_users,
            "pending_variances": await self.count_pending_variances(),
            "items_verified_today": await self.count_items_verified_today(),
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }

    async def calculate_total_stock_value(self) -> float:
        try:
            pipeline = [
                {"$match": {"stock_qty": {"$exists": True}}},
                {
                    "$group": {
                        "_id": None,
                        "total_value": {
                            "$sum": {
                                "$multiply": ["$stock_qty", {"$ifNull": ["$price", 0]}]
                            }
                        },
                    }
                },
            ]
            result = await self._database.erp_items.aggregate(pipeline).to_list(1)
            return result[0]["total_value"] if result else 0.0
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error(
                "Error calculating total stock value: %s",
                sanitize_for_logging(str(exc)),
            )
            return 0.0

    async def calculate_verified_value(self) -> float:
        try:
            total_value = 0.0
            cursor = self._database.count_lines.find({"status": "locked"})
            async for line in cursor:
                qty = float(line.get("counted_qty") or 0.0)
                unit_value = float(line.get("mrp_counted") or line.get("mrp_erp") or 0.0)
                total_value += qty * unit_value
            return total_value
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error(
                "Error calculating verified value: %s",
                sanitize_for_logging(str(exc)),
            )
            return 0.0

    async def calculate_completion_percentage(self) -> float:
        try:
            total_items = await self._database.erp_items.count_documents({})
            if total_items == 0:
                return 0.0

            verified_items_result = await self._database.count_lines.aggregate(
                [
                    {
                        "$match": {
                            "status": "locked",
                            "item_code": {"$exists": True, "$ne": ""},
                        }
                    },
                    {"$group": {"_id": "$item_code"}},
                    {"$count": "count"},
                ]
            ).to_list(1)
            verified_items = (
                verified_items_result[0]["count"] if verified_items_result else 0
            )
            return round((verified_items / total_items) * 100, 2)
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error calculating completion: %s", sanitize_for_logging(str(exc)))
            return 0.0

    async def count_active_sessions(self) -> int:
        try:
            return await self._database.sessions.count_documents(
                {
                    "status": {"$in": ["OPEN", "ACTIVE", "PAUSED", "RECONCILE"]},
                    "$and": [
                        {
                            "$or": [
                                {"closed_at": {"$exists": False}},
                                {"closed_at": {"$in": [None, ""]}},
                            ]
                        },
                        {
                            "$or": [
                                {"finalized_at": {"$exists": False}},
                                {"finalized_at": {"$in": [None, ""]}},
                            ]
                        },
                    ],
                }
            )
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error counting sessions: %s", sanitize_for_logging(str(exc)))
            return 0

    async def count_active_users(self) -> int:
        try:
            cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=30)
            return await self._database.user_presence.count_documents({"last_seen": {"$gte": cutoff}})
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error counting active users: %s", sanitize_for_logging(str(exc)))
            return 0

    async def count_pending_variances(self) -> int:
        try:
            return await self._database.count_lines.count_documents(
                {
                    "variance": {"$exists": True, "$ne": 0},
                    "$or": [
                        {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}},
                        {"approval_status": "NEEDS_REVIEW"},
                    ],
                }
            )
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error counting variances: %s", sanitize_for_logging(str(exc)))
            return 0

    async def count_items_verified_today(self) -> int:
        try:
            today_start = (
                datetime.now(timezone.utc)
                .replace(tzinfo=None)
                .replace(hour=0, minute=0, second=0, microsecond=0)
            )
            return await self._database.count_lines.count_documents(
                {
                    "finalized_at": {"$gte": today_start},
                    "status": "locked",
                }
            )
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error(
                "Error counting today's verifications: %s",
                sanitize_for_logging(str(exc)),
            )
            return 0

    async def check_mongodb_connection(self) -> str:
        try:
            await self._database.command("ping")
            return "connected"
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("MongoDB connection error: %s", sanitize_for_logging(str(exc)))
            return "disconnected"

    async def get_api_metrics_summary(self) -> tuple[float, float]:
        avg_response_time = 0.0
        error_rate = 0.0
        try:
            pipeline: list[dict[str, Any]] = [
                {"$sort": {"timestamp": -1}},
                {"$limit": 100},
                {
                    "$group": {
                        "_id": None,
                        "avg_latency": {"$avg": "$latency_ms"},
                        "total_requests": {"$sum": 1},
                        "error_count": {
                            "$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}
                        },
                    }
                },
            ]
            result = await self._database.api_metrics.aggregate(pipeline).to_list(1)
            if result:
                avg_response_time = round(result[0].get("avg_latency", 0), 2)
                total = result[0].get("total_requests", 1)
                errors = result[0].get("error_count", 0)
                error_rate = round((errors / total) * 100, 2) if total > 0 else 0.0
        except DASHBOARD_ERROR_TYPES as exc:
            logger.warning("Could not fetch API metrics: %s", sanitize_for_logging(str(exc)))
        return avg_response_time, error_rate

    async def get_active_users(self) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=30)
        try:
            cursor = self._database.user_presence.find({"last_seen": {"$gte": cutoff}}).sort(
                "last_seen", -1
            )
            presence_records = await cursor.to_list(100)
            user_ids = [
                record.get("user_id")
                for record in presence_records
                if record.get("user_id")
            ]

            users_cursor = self._database.users.find({"_id": {"$in": user_ids}})
            users_list = await users_cursor.to_list(len(user_ids))
            users_dict = {user["_id"]: user for user in users_list}

            string_user_ids = [str(uid) for uid in user_ids]
            sessions_cursor = self._database.verification_sessions.find(
                {
                    "user_id": {"$in": string_user_ids},
                    "status": {
                        "$in": ["OPEN", "ACTIVE", "RECONCILE", "active", "in_progress"]
                    },
                }
            )
            sessions_list = await sessions_cursor.to_list(100)
            sessions_dict = {session["user_id"]: session for session in sessions_list}

            active_users = []
            for record in presence_records:
                user_id = record.get("user_id")
                if not user_id:
                    continue
                user = users_dict.get(user_id)
                if not user:
                    continue

                session = sessions_dict.get(str(user["_id"]))
                last_seen = record.get(
                    "last_seen", datetime.now(timezone.utc).replace(tzinfo=None)
                )
                minutes_ago = (
                    datetime.now(timezone.utc).replace(tzinfo=None) - last_seen
                ).total_seconds() / 60
                active_users.append(
                    {
                        "user_id": str(user["_id"]),
                        "username": user.get("username", "Unknown"),
                        "role": user.get("role", "staff"),
                        "last_activity": last_seen.isoformat(),
                        "current_session": session.get("id") if session else None,
                        "status": "online" if minutes_ago < 5 else "idle",
                    }
                )
            return active_users
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error fetching active users: %s", sanitize_for_logging(str(exc)))
            raise

    async def get_error_logs(
        self,
        *,
        level: Optional[str],
        hours: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        query: dict[str, Any] = {"timestamp": {"$gte": cutoff}}
        if level:
            query["level"] = level.upper()

        try:
            cursor = self._database.error_logs.find(query).sort("timestamp", -1).limit(limit)
            return await cursor.to_list(limit)
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error("Error fetching error logs: %s", sanitize_for_logging(str(exc)))
            raise

    async def get_performance_metrics(
        self,
        *,
        hours: int,
        interval_minutes: int,
    ) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        try:
            pipeline: list[dict[str, Any]] = [
                {"$match": {"timestamp": {"$gte": cutoff}}},
                {
                    "$group": {
                        "_id": {
                            "$dateTrunc": {
                                "date": "$timestamp",
                                "unit": "minute",
                                "binSize": interval_minutes,
                            }
                        },
                        "avg_latency": {"$avg": "$latency_ms"},
                        "request_count": {"$sum": 1},
                        "error_count": {
                            "$sum": {"$cond": [{"$gte": ["$status_code", 400]}, 1, 0]}
                        },
                    }
                },
                {"$sort": {"_id": 1}},
            ]
            return await self._database.api_metrics.aggregate(pipeline).to_list(1000)
        except DASHBOARD_ERROR_TYPES as exc:
            logger.error(
                "Error fetching performance metrics: %s",
                sanitize_for_logging(str(exc)),
            )
            return []

    async def count_recent_errors(self, *, hours: int) -> int:
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        return await self._database.error_logs.count_documents(
            {"timestamp": {"$gte": cutoff}, "level": {"$in": ["ERROR", "CRITICAL"]}}
        )


def get_admin_dashboard_service(database: Any | None = None) -> AdminDashboardService:
    return AdminDashboardService(database or get_db())
