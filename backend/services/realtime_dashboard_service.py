"""Service facade for real-time dashboard reads and exports."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.config import settings
from backend.db.runtime import get_db
from backend.services.advanced_report_service import (
    AdvancedReportService,
    ColumnConfig,
    ReportConfig,
)
from backend.services.projection_read_service import ProjectionReadService
from backend.services.shadow_read_service import schedule_shadow_compare
from backend.utils.tracing import trace_span


class RealtimeDashboardService:
    def __init__(self, database: Any) -> None:
        self._database = database
        self.advanced = AdvancedReportService(database)

    def get_column_config(self, report_type: str) -> list[Any]:
        return self.advanced.get_column_config(report_type)

    async def generate_verified_items_report(self, report_config: ReportConfig) -> dict[str, Any]:
        return await self.advanced.generate_verified_items_report(report_config)

    async def get_item_details(self, item_id: str) -> dict[str, Any] | None:
        if settings.V3_PROJECTION_DASHBOARD_READS:
            return await ProjectionReadService(
                self._database, enforce_readiness=True
            ).get_item_details(item_id)

        with trace_span("mongodb.count_lines.find_one", {"item_id": item_id}):
            item = await self._database.count_lines.find_one({"id": item_id})
        if not item:
            return None

        with trace_span("mongodb.audit_logs.find", {"entity_id": item_id}):
            audit_trail = await (
                self._database.audit_logs.find({"entity_id": item_id, "entity_type": "count_line"})
                .sort("timestamp", -1)
                .limit(50)
                .to_list(50)
            )

        item.pop("_id", None)
        for log in audit_trail:
            log.pop("_id", None)
            if "timestamp" in log and isinstance(log["timestamp"], datetime):
                log["timestamp"] = log["timestamp"].isoformat()
        return {"success": True, "item": item, "audit_trail": audit_trail}

    async def get_dashboard_stats(self) -> dict[str, Any]:
        if settings.V3_PROJECTION_DASHBOARD_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).get_dashboard_stats()
            schedule_shadow_compare(
                endpoint="dashboard.stats",
                primary=result,
                baseline_factory=self._get_dashboard_stats_baseline,
                params={},
            )
            return result

        return await self._get_dashboard_stats_baseline()

    async def _get_dashboard_stats_baseline(self) -> dict[str, Any]:
        with trace_span("calculate_dashboard_stats"):
            stats_pipeline = [
                {
                    "$facet": {
                        "total": [{"$count": "count"}],
                        "verified": [{"$match": {"verified": True}}, {"$count": "count"}],
                        "pending": [{"$match": {"verified": False}}, {"$count": "count"}],
                        "variance_stats": [
                            {
                                "$group": {
                                    "_id": None,
                                    "total_variance": {"$sum": "$variance"},
                                    "positive": {
                                        "$sum": {
                                            "$cond": [{"$gt": ["$variance", 0]}, "$variance", 0]
                                        }
                                    },
                                    "negative": {
                                        "$sum": {
                                            "$cond": [{"$lt": ["$variance", 0]}, "$variance", 0]
                                        }
                                    },
                                    "avg_variance": {"$avg": "$variance"},
                                }
                            }
                        ],
                        "today_activity": [
                            {
                                "$match": {
                                    "counted_at": {
                                        "$gte": datetime.now(timezone.utc)
                                        .replace(tzinfo=None)
                                        .replace(hour=0, minute=0, second=0)
                                    }
                                }
                            },
                            {"$count": "count"},
                        ],
                        "by_warehouse": [
                            {"$group": {"_id": "$warehouse", "count": {"$sum": 1}}},
                            {"$sort": {"count": -1}},
                            {"$limit": 10},
                        ],
                        "by_status": [
                            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
                        ],
                    }
                }
            ]
            result = await self._database.count_lines.aggregate(stats_pipeline).to_list(1)

        stats = result[0] if result else {}

        def get_count(key: str) -> int:
            data = stats.get(key, [])
            return data[0]["count"] if data else 0

        variance_stats = stats.get("variance_stats", [{}])[0] if stats.get("variance_stats") else {}
        return {
            "success": True,
            "stats": {
                "total_items": get_count("total"),
                "verified_items": get_count("verified"),
                "pending_items": get_count("pending"),
                "today_activity": get_count("today_activity"),
                "total_variance": variance_stats.get("total_variance", 0),
                "positive_variance": variance_stats.get("positive", 0),
                "negative_variance": variance_stats.get("negative", 0),
                "avg_variance": variance_stats.get("avg_variance", 0),
                "verification_rate": (
                    (get_count("verified") / get_count("total") * 100)
                    if get_count("total") > 0
                    else 0
                ),
            },
            "by_warehouse": [
                {"warehouse": item["_id"] or "Unknown", "count": item["count"]}
                for item in stats.get("by_warehouse", [])
            ],
            "by_status": [
                {"status": item["_id"] or "Unknown", "count": item["count"]}
                for item in stats.get("by_status", [])
            ],
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }

    async def get_filter_options(self) -> dict[str, Any]:
        if settings.V3_PROJECTION_DASHBOARD_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).get_filter_options()
            schedule_shadow_compare(
                endpoint="dashboard.filter_options",
                primary=result,
                baseline_factory=self._get_filter_options_baseline,
                params={},
            )
            return result

        return await self._get_filter_options_baseline()

    async def _get_filter_options_baseline(self) -> dict[str, Any]:
        with trace_span("fetch_filter_options"):
            warehouses = await self._database.count_lines.distinct("warehouse")
            floors = await self._database.count_lines.distinct("floor")
            categories = await self._database.count_lines.distinct("category")
            statuses = await self._database.count_lines.distinct("status")
            users = await self._database.count_lines.distinct("counted_by")
        return {
            "success": True,
            "options": {
                "warehouses": [w for w in warehouses if w],
                "floors": [f for f in floors if f],
                "categories": [c for c in categories if c],
                "statuses": [s for s in statuses if s],
                "users": [u for u in users if u],
                "verified": [True, False],
            },
        }

    async def get_ws_item_details(self, item_id: str) -> dict[str, Any] | None:
        if settings.V3_PROJECTION_DASHBOARD_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).get_item_details(item_id)
            return result["item"]
        item = await self._database.count_lines.find_one({"id": item_id})
        if item:
            item.pop("_id", None)
        return item

    async def export_to_csv(self, rows: list[dict[str, Any]], columns: list[ColumnConfig]) -> str:
        return await self.advanced.export_to_csv(rows, columns, erpnext_import=True)

    async def export_to_xlsx(self, rows: list[dict[str, Any]], columns: list[ColumnConfig]) -> bytes:
        return await self.advanced.export_to_xlsx(rows, columns, erpnext_import=True)


def get_realtime_dashboard_service() -> RealtimeDashboardService:
    return RealtimeDashboardService(get_db())
