"""Report generation read service."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.config import settings
from backend.db.runtime import get_db
from backend.services.projection_read_service import ProjectionReadService
from backend.services.projection_snapshot import (
    SOURCE_ITEM_TIMESTAMP_FIELDS,
    SOURCE_SESSION_TIMESTAMP_FIELDS,
    apply_snapshot_filter,
)
from backend.services.query_utils import build_mongo_date_filter
from backend.services.shadow_read_service import schedule_shadow_compare


class ReportGenerationService:
    def __init__(self, database: Any) -> None:
        self._database = database

    @staticmethod
    def _date_filter(filters: Any) -> dict[str, Any] | None:
        return build_mongo_date_filter(filters.date_from, filters.date_to, end_of_day=True)

    async def generate_stock_summary(self, filters: Any) -> list[dict[str, Any]]:
        if settings.V3_PROJECTION_REPORT_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).generate_stock_summary(filters)
            schedule_shadow_compare(
                endpoint="report.stock_summary",
                primary=result,
                baseline_factory=lambda: self._generate_stock_summary_baseline(filters),
                staff_user=getattr(filters, "user_id", None),
                params=filters,
            )
            return result

        return await self._generate_stock_summary_baseline(filters)

    async def _generate_stock_summary_baseline(
        self, filters: Any
    ) -> list[dict[str, Any]]:
        item_query: dict[str, Any] = {}
        if filters.warehouse:
            item_query["warehouse"] = filters.warehouse
        if filters.floor:
            item_query["floor"] = filters.floor
        if filters.category:
            item_query["category"] = filters.category

        items = [item async for item in self._database.erp_items.find(item_query)]
        item_codes = [item.get("item_code") for item in items if item.get("item_code")]
        if (filters.warehouse or filters.floor or filters.category) and not item_codes:
            return []

        line_query: dict[str, Any] = {}
        if item_codes:
            line_query["item_code"] = {"$in": item_codes}
        if filters.user_id:
            line_query["counted_by"] = filters.user_id
        if filters.status:
            line_query["status"] = filters.status.lower()
        date_filter = self._date_filter(filters)
        if date_filter:
            line_query["counted_at"] = date_filter
        line_query = apply_snapshot_filter(line_query, SOURCE_ITEM_TIMESTAMP_FIELDS)

        line_summary: dict[str, dict[str, Any]] = {}
        async for line in self._database.count_lines.find(line_query):
            item_code = line.get("item_code")
            if not item_code:
                continue
            summary = line_summary.setdefault(
                item_code,
                {
                    "verification_count": 0,
                    "finalized_count": 0,
                    "finalized_qty": 0.0,
                    "last_verified": None,
                },
            )
            summary["verification_count"] += 1
            if str(line.get("status", "")).lower() == "locked":
                summary["finalized_count"] += 1
                summary["finalized_qty"] += float(line.get("counted_qty") or 0.0)
                last_verified = line.get("finalized_at") or line.get("verified_at") or line.get("counted_at")
                if last_verified and (
                    summary["last_verified"] is None or last_verified > summary["last_verified"]
                ):
                    summary["last_verified"] = last_verified

        results: list[dict[str, Any]] = []
        for item in items:
            item_code = item.get("item_code")
            item_code_key = str(item_code) if item_code is not None else ""
            summary = line_summary.get(item_code_key, {})
            price = float(item.get("price") or 0.0)
            stock_qty = float(item.get("stock_qty") or 0.0)
            results.append(
                {
                    "item_code": item_code_key,
                    "item_name": item.get("item_name"),
                    "category": item.get("category"),
                    "warehouse": item.get("warehouse"),
                    "floor": item.get("floor"),
                    "stock_qty": stock_qty,
                    "price": price,
                    "stock_value": stock_qty * price,
                    "verification_count": int(summary.get("verification_count", 0) or 0),
                    "finalized_count": int(summary.get("finalized_count", 0) or 0),
                    "finalized_qty": float(summary.get("finalized_qty", 0.0) or 0.0),
                    "last_verified": summary.get("last_verified"),
                    "is_verified": bool(
                        summary.get("finalized_count", 0)
                        or summary.get("verification_count", 0)
                    ),
                }
            )
        results.sort(key=lambda row: str(row.get("item_code") or ""))
        return results[:10000]

    async def generate_variance_report(self, filters: Any) -> list[dict[str, Any]]:
        if settings.V3_PROJECTION_REPORT_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).generate_variance_report(filters)
            schedule_shadow_compare(
                endpoint="report.variance",
                primary=result,
                baseline_factory=lambda: self._generate_variance_report_baseline(filters),
                staff_user=getattr(filters, "user_id", None),
                params=filters,
            )
            return result

        return await self._generate_variance_report_baseline(filters)

    async def _generate_variance_report_baseline(
        self, filters: Any
    ) -> list[dict[str, Any]]:
        line_query: dict[str, Any] = {"variance": {"$ne": 0}}
        if filters.status:
            line_query["status"] = filters.status.lower()
        if filters.user_id:
            line_query["counted_by"] = filters.user_id
        date_filter = self._date_filter(filters)
        if date_filter:
            line_query["counted_at"] = date_filter
        line_query = apply_snapshot_filter(line_query, SOURCE_ITEM_TIMESTAMP_FIELDS)

        item_query: dict[str, Any] = {}
        if filters.warehouse:
            item_query["warehouse"] = filters.warehouse
        if filters.floor:
            item_query["floor"] = filters.floor
        if filters.category:
            item_query["category"] = filters.category

        item_docs = {
            item.get("item_code"): item
            async for item in self._database.erp_items.find(item_query)
            if item.get("item_code")
        }
        if (filters.warehouse or filters.floor or filters.category) and not item_docs:
            return []

        results: list[dict[str, Any]] = []
        async for line in self._database.count_lines.find(line_query):
            item_info = item_docs.get(line.get("item_code")) or {}
            if filters.warehouse and item_info.get("warehouse") != filters.warehouse:
                continue
            if filters.floor and item_info.get("floor") != filters.floor:
                continue
            if filters.category and item_info.get("category") != filters.category:
                continue
            expected_qty = float(line.get("erp_qty") or 0.0)
            variance = float(line.get("variance") or 0.0)
            variance_percentage = 100.0 if expected_qty == 0 else (variance / abs(expected_qty)) * 100
            results.append(
                {
                    "item_code": line.get("item_code"),
                    "item_name": line.get("item_name") or item_info.get("item_name") or "Unknown",
                    "expected_qty": expected_qty,
                    "counted_qty": float(line.get("counted_qty") or 0.0),
                    "variance": variance,
                    "variance_percentage": variance_percentage,
                    "status": line.get("status"),
                    "approval_status": line.get("approval_status"),
                    "counted_by": line.get("counted_by"),
                    "warehouse": item_info.get("warehouse"),
                    "location": "/".join(
                        part
                        for part in [line.get("floor_no"), line.get("rack_no")]
                        if isinstance(part, str) and part
                    ),
                    "counted_at": line.get("counted_at"),
                    "approved_by": line.get("approved_by"),
                    "approved_at": line.get("approved_at"),
                    "finalized_at": line.get("finalized_at"),
                    "finalized_by": line.get("finalized_by"),
                }
            )
        results.sort(key=lambda row: abs(float(row.get("variance_percentage") or 0.0)), reverse=True)
        return results[:10000]

    async def generate_user_activity_report(self, filters: Any) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if filters.user_id:
            query["user_id"] = filters.user_id
        date_filter = self._date_filter(filters)
        if date_filter:
            query["timestamp"] = date_filter
        pipeline = [
            {"$match": query},
            {
                "$group": {
                    "_id": "$user_id",
                    "total_actions": {"$sum": 1},
                    "scans": {"$sum": {"$cond": [{"$eq": ["$action", "scan"]}, 1, 0]}},
                    "verifications": {"$sum": {"$cond": [{"$eq": ["$action", "verify"]}, 1, 0]}},
                    "approvals": {"$sum": {"$cond": [{"$eq": ["$action", "approve"]}, 1, 0]}},
                    "first_action": {"$min": "$timestamp"},
                    "last_action": {"$max": "$timestamp"},
                }
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "user_info",
                }
            },
            {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 0,
                    "user_id": "$_id",
                    "username": {"$ifNull": ["$user_info.username", "Unknown"]},
                    "role": {"$ifNull": ["$user_info.role", "Unknown"]},
                    "total_actions": 1,
                    "scans": 1,
                    "verifications": 1,
                    "approvals": 1,
                    "first_action": 1,
                    "last_action": 1,
                }
            },
            {"$sort": {"total_actions": -1}},
            {"$limit": 1000},
        ]
        return await self._database.audit_logs.aggregate(pipeline).to_list(1000)

    async def generate_session_history_report(self, filters: Any) -> list[dict[str, Any]]:
        if settings.V3_PROJECTION_REPORT_READS:
            result = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).generate_session_history(filters)
            schedule_shadow_compare(
                endpoint="report.session_history",
                primary=result,
                baseline_factory=lambda: self._generate_session_history_baseline(filters),
                staff_user=getattr(filters, "user_id", None),
                params=filters,
            )
            return result

        return await self._generate_session_history_baseline(filters)

    async def _generate_session_history_baseline(
        self, filters: Any
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if filters.status:
            query["status"] = filters.status.upper()
        if filters.user_id:
            query["staff_user"] = filters.user_id
        date_filter = self._date_filter(filters)
        if date_filter:
            query["started_at"] = date_filter
        query = apply_snapshot_filter(query, SOURCE_SESSION_TIMESTAMP_FIELDS)

        sessions = [
            session
            async for session in self._database.sessions.find(query).sort("started_at", -1).limit(5000)
        ]
        session_ids = [
            str(session.get("id") or session.get("session_id"))
            for session in sessions
            if session.get("id") or session.get("session_id")
        ]
        lines_by_session: dict[str, list[dict[str, Any]]] = {
            session_id: [] for session_id in session_ids
        }
        if session_ids:
            async for line in self._database.count_lines.find(
                apply_snapshot_filter(
                    {"session_id": {"$in": session_ids}},
                    SOURCE_ITEM_TIMESTAMP_FIELDS,
                ),
                {"_id": 0, "session_id": 1, "verified": 1, "status": 1},
            ):
                session_id = str(line.get("session_id") or "")
                if session_id in lines_by_session:
                    lines_by_session[session_id].append(line)

        results: list[dict[str, Any]] = []
        for session in sessions:
            session_id = str(session.get("id") or session.get("session_id"))
            lines = lines_by_session.get(session_id, [])
            started_at = session.get("started_at")
            completed_at = session.get("finalized_at") or session.get("completed_at") or session.get("closed_at")
            duration_minutes = None
            if isinstance(started_at, datetime) and isinstance(completed_at, datetime):
                duration_minutes = (completed_at - started_at).total_seconds() / 60
            results.append(
                {
                    "session_id": session_id,
                    "username": session.get("staff_user"),
                    "staff_name": session.get("staff_name"),
                    "warehouse": session.get("warehouse"),
                    "rack_id": session.get("rack_no"),
                    "floor": session.get("location_name"),
                    "status": session.get("status"),
                    "finalization_status": session.get("finalization_status"),
                    "started_at": started_at,
                    "completed_at": completed_at,
                    "duration_minutes": duration_minutes,
                    "items_scanned": len(lines),
                    "items_verified": sum(
                        1
                        for line in lines
                        if bool(line.get("verified")) or str(line.get("status", "")).lower() == "locked"
                    ),
                    "total_variance": float(session.get("total_variance") or 0.0),
                    "finalized_by": session.get("finalized_by"),
                    "finalized_at": session.get("finalized_at"),
                }
            )
        return results

    async def generate_audit_trail_report(self, filters: Any) -> list[dict[str, Any]]:
        query: dict[str, Any] = {}
        if filters.user_id:
            query["user_id"] = filters.user_id
        date_filter = self._date_filter(filters)
        if date_filter:
            query["timestamp"] = date_filter
        pipeline = [
            {"$match": query},
            {
                "$lookup": {
                    "from": "users",
                    "localField": "user_id",
                    "foreignField": "_id",
                    "as": "user_info",
                }
            },
            {"$unwind": {"path": "$user_info", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "_id": 0,
                    "timestamp": 1,
                    "action": 1,
                    "user_id": 1,
                    "username": {"$ifNull": ["$user_info.username", "System"]},
                    "role": {"$ifNull": ["$user_info.role", "system"]},
                    "target_type": 1,
                    "target_id": 1,
                    "details": 1,
                    "ip_address": 1,
                }
            },
            {"$sort": {"timestamp": -1}},
            {"$limit": 10000},
        ]
        return await self._database.audit_logs.aggregate(pipeline).to_list(10000)

    async def get_filter_options(self, current_user: dict[str, Any]) -> dict[str, Any]:
        if settings.V3_PROJECTION_REPORT_READS:
            projection_options = await ProjectionReadService(
                self._database, enforce_readiness=True
            ).get_filter_options()
            options = projection_options["options"]
            result = {
                "warehouses": options["warehouses"],
                "floors": options["floors"],
                "categories": options["categories"],
                "statuses": options["statuses"],
                "users": [
                    {"id": str(user), "username": str(user), "role": "staff"}
                    for user in options["users"]
                ],
            }
            schedule_shadow_compare(
                endpoint="report.filter_options",
                primary=result,
                baseline_factory=lambda: self._get_filter_options_baseline(current_user),
                staff_user=str(current_user.get("username") or current_user.get("user_id") or ""),
                params={"role": current_user.get("role")},
            )
            return result

        return await self._get_filter_options_baseline(current_user)

    async def _get_filter_options_baseline(
        self, current_user: dict[str, Any]
    ) -> dict[str, Any]:
        warehouses = await self._database.erp_items.distinct("warehouse")
        floors = await self._database.erp_items.distinct("floor")
        categories = await self._database.erp_items.distinct("category")
        count_line_snapshot_query = apply_snapshot_filter(
            {},
            SOURCE_ITEM_TIMESTAMP_FIELDS,
        )
        session_snapshot_query = apply_snapshot_filter(
            {},
            SOURCE_SESSION_TIMESTAMP_FIELDS,
        )
        if count_line_snapshot_query:
            count_line_rows = await self._database.count_lines.find(
                count_line_snapshot_query,
                {"_id": 0, "status": 1},
            ).to_list(10000)
            count_line_statuses = [
                row.get("status") for row in count_line_rows if row.get("status")
            ]
        else:
            count_line_statuses = await self._database.count_lines.distinct("status")
        if session_snapshot_query:
            session_rows = await self._database.sessions.find(
                session_snapshot_query,
                {"_id": 0, "status": 1},
            ).to_list(10000)
            session_statuses = [
                row.get("status") for row in session_rows if row.get("status")
            ]
        else:
            session_statuses = await self._database.sessions.distinct("status")
        statuses = sorted(set(count_line_statuses) | set(session_statuses))
        users = []
        if current_user.get("role") in ["admin", "supervisor"]:
            user_cursor = self._database.users.find({}, {"_id": 1, "username": 1, "role": 1})
            users = [
                {
                    "id": str(u["_id"]),
                    "username": u["username"],
                    "role": u.get("role", "staff"),
                }
                async for u in user_cursor
            ]
        return {
            "warehouses": warehouses,
            "floors": floors,
            "categories": categories,
            "statuses": statuses,
            "users": users,
        }


def get_report_generation_service() -> ReportGenerationService:
    return ReportGenerationService(get_db())
