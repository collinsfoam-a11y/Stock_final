from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.observability import metrics

logger = logging.getLogger(__name__)

FLAG_PROJECTION_DASHBOARD_READS = "V3_PROJECTION_DASHBOARD_READS"
FLAG_PROJECTION_REPORT_READS = "V3_PROJECTION_REPORT_READS"
PROJECTION_GAP_COUNTER = "projection_gap_count"
PROJECTION_DRIFT_COUNTER = "projection_drift_count"
PROJECTION_HIT_COUNTER = "projection_hit_count"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _coerce_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return None
    return None


def _sort_datetime_key(value: Any) -> datetime:
    return _coerce_datetime(value) or datetime.min


def _line_verified(document: dict[str, Any]) -> bool:
    if document.get("verified") is True:
        return True
    status = str(document.get("status") or "").strip().lower()
    approval_status = str(document.get("approval_status") or "").strip().upper()
    return status in {"locked", "approved"} or approval_status == "APPROVED"


def _line_active(document: dict[str, Any]) -> bool:
    if document.get("is_removed") is True:
        return False
    status = str(document.get("status") or "").strip().lower()
    return status not in {"superseded", "removed", "deleted"}


def _variance_pending(document: dict[str, Any]) -> bool:
    approval_status = str(document.get("approval_status") or "").strip().upper()
    status = str(document.get("status") or "").strip().upper()
    if approval_status in {"APPROVED", "RESOLVED"}:
        return False
    return status in {
        "PENDING",
        "PENDING_APPROVAL",
        "NEEDS_REVIEW",
        "RECOUNT_REQUESTED",
        "REJECTED",
        "RECOUNT",
    } or approval_status in {"", "PENDING", "NEEDS_REVIEW", "RECOUNT_REQUESTED", "REJECTED"}


@dataclass(frozen=True)
class ProjectionReadFlags:
    dashboard_reads: bool
    report_reads: bool


class ProjectionReadError(RuntimeError):
    def __init__(self, *, endpoint: str, reason: str, context: Optional[dict[str, Any]] = None):
        self.endpoint = endpoint
        self.reason = reason
        self.context = context or {}
        super().__init__(f"Projection read failed for {endpoint}: {reason}")


class ProjectionReadService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def _feature_flag_enabled(self, flag_name: str) -> bool:
        env_value = os.getenv(flag_name)
        if env_value is not None:
            return _as_bool(env_value, default=False)

        try:
            collection = getattr(self.db, "feature_flags", None) or self.db["feature_flags"]
            doc = await collection.find_one({"key": flag_name})
        except Exception:
            return False

        if not isinstance(doc, dict):
            return False
        if "enabled" in doc:
            return _as_bool(doc.get("enabled"), default=False)
        return _as_bool(doc.get("state"), default=False)

    async def get_flags(self) -> ProjectionReadFlags:
        return ProjectionReadFlags(
            dashboard_reads=await self._feature_flag_enabled(FLAG_PROJECTION_DASHBOARD_READS),
            report_reads=await self._feature_flag_enabled(FLAG_PROJECTION_REPORT_READS),
        )

    async def dashboard_reads_enabled(self) -> bool:
        return (await self.get_flags()).dashboard_reads

    async def report_reads_enabled(self) -> bool:
        return (await self.get_flags()).report_reads

    async def _record_hit(self, endpoint: str) -> None:
        try:
            await metrics.increment(PROJECTION_HIT_COUNTER, labels={"endpoint": endpoint})
        except Exception:
            logger.debug("Failed to record projection hit", exc_info=True)

    async def _record_gap(
        self,
        *,
        endpoint: str,
        reason: str,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        try:
            await metrics.increment(
                PROJECTION_GAP_COUNTER,
                labels={"endpoint": endpoint, "reason": reason},
            )
        except Exception:
            logger.debug("Failed to record projection gap", exc_info=True)
        logger.error("PROJECTION_GAP endpoint=%s reason=%s context=%s", endpoint, reason, context)

    async def record_drift(self, *, scope: str, detail: str) -> None:
        try:
            await metrics.increment(PROJECTION_DRIFT_COUNTER, labels={"scope": scope})
        except Exception:
            logger.debug("Failed to record projection drift", exc_info=True)
        logger.error("PROJECTION_DRIFT scope=%s detail=%s", scope, detail)

    async def _raise_gap(
        self,
        *,
        endpoint: str,
        reason: str,
        context: Optional[dict[str, Any]] = None,
    ) -> None:
        await self._record_gap(endpoint=endpoint, reason=reason, context=context)
        raise ProjectionReadError(endpoint=endpoint, reason=reason, context=context)

    async def _list_documents(self, collection_name: str, query: Optional[dict[str, Any]] = None):
        cursor = self.db[collection_name].find(query or {})
        return [document async for document in cursor]

    async def _get_session_projection_docs(
        self,
        *,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
        current_user: Optional[dict[str, Any]] = None,
    ) -> list[dict[str, Any]]:
        rows = await self._list_documents("session_dashboard_projection")
        has_viewer_context = isinstance(current_user, dict)
        viewer_role = str((current_user or {}).get("role") or "").strip().lower()
        viewer_username = _normalize_string((current_user or {}).get("username"))

        filtered: list[dict[str, Any]] = []
        for row in rows:
            row_status = str(row.get("status") or "").strip().upper()
            row_user = _normalize_string(row.get("staff_user"))
            if status and row_status != str(status).strip().upper():
                continue
            if user_id and row_user != _normalize_string(user_id):
                continue
            if (
                not user_id
                and has_viewer_context
                and viewer_role not in {"supervisor", "admin"}
                and row_user != viewer_username
            ):
                continue
            filtered.append(row)
        filtered.sort(
            key=lambda row: (
                _sort_datetime_key(row.get("started_at")),
                str(row.get("session_id") or ""),
            ),
            reverse=True,
        )
        return filtered

    def _session_projection_to_response(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row.get("session_id") or row.get("id") or ""),
            "warehouse": row.get("warehouse") or "",
            "location_id": row.get("location_id"),
            "location_key": row.get("location_key"),
            "location_type": row.get("location_type"),
            "location_name": row.get("location_name"),
            "rack_no": row.get("rack_no"),
            "staff_user": row.get("staff_user") or "",
            "staff_name": row.get("staff_name") or "",
            "status": row.get("status") or "OPEN",
            "type": row.get("type") or "STANDARD",
            "started_at": row.get("started_at") or _utc_now(),
            "last_heartbeat": row.get("last_heartbeat"),
            "closed_at": row.get("closed_at"),
            "completed_at": row.get("completed_at"),
            "reconciled_at": row.get("reconciled_at"),
            "finalized_at": row.get("finalized_at"),
            "finalized_by": row.get("finalized_by"),
            "finalization_status": row.get("finalization_status"),
            "total_items": int(row.get("total_items") or 0),
            "total_variance": _as_float(row.get("total_variance")),
            "verified_items": int(row.get("verified_items") or 0),
            "pending_items": int(row.get("pending_items") or 0),
            "damage_items": int(row.get("damage_items") or 0),
            "notes": row.get("notes"),
            "barcode": row.get("barcode"),
        }

    async def get_sessions_page(
        self,
        *,
        page: int,
        page_size: int,
        status: Optional[str],
        user_id: Optional[str],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        rows = await self._get_session_projection_docs(
            status=status,
            user_id=user_id,
            current_user=current_user,
        )
        await self._record_hit("sessions/list")
        total = len(rows)
        skip = max((page - 1) * page_size, 0)
        paged = rows[skip : skip + page_size]
        return {
            "items": [self._session_projection_to_response(row) for row in paged],
            "total": total,
        }

    async def get_session_stats(self, session_id: str) -> Optional[dict[str, Any]]:
        row = await self.db.session_dashboard_projection.find_one({"session_id": session_id})
        if not isinstance(row, dict):
            return None
        await self._record_hit("sessions/stats")
        started_at = _coerce_datetime(row.get("started_at"))
        last_point = (
            _coerce_datetime(row.get("finalized_at"))
            or _coerce_datetime(row.get("completed_at"))
            or _coerce_datetime(row.get("closed_at"))
            or _coerce_datetime(row.get("last_heartbeat"))
        )
        duration_seconds = 0.0
        if started_at and last_point:
            duration_seconds = max((last_point - started_at).total_seconds(), 0.0)
        verified_items = int(row.get("verified_items") or 0)
        pending_items = int(row.get("pending_items") or 0)
        scanned_items = int(row.get("scanned_items") or row.get("total_items") or 0)
        return {
            "id": session_id,
            "total_items": int(row.get("total_items") or scanned_items),
            "verified_items": verified_items,
            "damage_items": int(row.get("damage_items") or 0),
            "pending_items": pending_items,
            "duration_seconds": duration_seconds,
            "items_per_minute": (
                (scanned_items / (duration_seconds / 60.0)) if duration_seconds > 0 else 0
            ),
            "scanned_items": scanned_items,
            "remaining_items": max(int(row.get("total_items") or 0) - scanned_items, 0),
            "completion_percent": _as_float(row.get("completion_percent")),
            "estimated_time_remaining": 0.0,
        }

    async def get_sessions_analytics(self) -> dict[str, Any]:
        rows = await self._get_session_projection_docs()
        if rows:
            await self._record_hit("sessions/analytics")

        total_sessions = len(rows)
        total_items = sum(int(row.get("total_items") or 0) for row in rows)
        total_variance = sum(_as_float(row.get("total_variance")) for row in rows)
        avg_variance = (total_variance / total_sessions) if total_sessions else 0.0
        positive_variance = 0.0
        negative_variance = 0.0
        high_risk_sessions = 0

        sessions_by_date: dict[str, int] = {}
        sessions_by_status: dict[str, int] = {}
        variance_by_warehouse: dict[str, float] = {}
        items_by_staff: dict[str, int] = {}

        for row in rows:
            started_at = _coerce_datetime(row.get("started_at"))
            if started_at:
                date_key = started_at.date().isoformat()
                sessions_by_date[date_key] = sessions_by_date.get(date_key, 0) + 1
            status_key = str(row.get("status") or "").strip().upper() or "UNKNOWN"
            sessions_by_status[status_key] = sessions_by_status.get(status_key, 0) + 1
            session_variance = _as_float(row.get("total_variance"))
            positive_variance += max(session_variance, 0.0)
            negative_variance += min(session_variance, 0.0)
            if abs(session_variance) > 1000:
                high_risk_sessions += 1
            warehouse = _normalize_string(row.get("warehouse")) or "Unknown"
            variance_by_warehouse[warehouse] = variance_by_warehouse.get(warehouse, 0.0) + abs(
                session_variance
            )
            staff_name = _normalize_string(row.get("staff_name")) or "Unknown"
            items_by_staff[staff_name] = items_by_staff.get(staff_name, 0) + int(
                row.get("total_items") or 0
            )

        return {
            "overall": {
                "_id": None,
                "total_sessions": total_sessions,
                "total_items": total_items,
                "total_variance": total_variance,
                "avg_variance": avg_variance,
                "positive_variance": positive_variance,
                "negative_variance": negative_variance,
                "high_risk_sessions": high_risk_sessions,
                "sessions_by_status": [
                    {"status": status, "count": count}
                    for status, count in sorted(sessions_by_status.items())
                ],
            },
            "sessions_by_date": dict(sorted(sessions_by_date.items())),
            "variance_by_warehouse": dict(sorted(variance_by_warehouse.items())),
            "items_by_staff": dict(sorted(items_by_staff.items())),
            "total_sessions": total_sessions,
        }

    async def _filtered_verified_items(self, filters: Any) -> list[dict[str, Any]]:
        rows = await self._list_documents("verified_items_projection")
        filtered: list[dict[str, Any]] = []
        for row in rows:
            if not _line_active(row):
                continue
            if filters:
                warehouse = getattr(filters, "warehouse", None)
                floor = getattr(filters, "floor", None)
                rack_id = getattr(filters, "rack_id", None)
                category = getattr(filters, "category", None)
                verified = getattr(filters, "verified", None)
                session_id = getattr(filters, "session_id", None)
                user_id = getattr(filters, "user_id", None)
                search_query = _normalize_string(getattr(filters, "search_query", None))
                variance_min = getattr(filters, "variance_min", None)
                variance_max = getattr(filters, "variance_max", None)
                date_from = getattr(filters, "date_from", None)
                date_to = getattr(filters, "date_to", None)

                if warehouse and row.get("warehouse") != warehouse:
                    continue
                if floor and row.get("floor") != floor:
                    continue
                if rack_id and row.get("rack_id") != rack_id:
                    continue
                if category and row.get("category") != category:
                    continue
                if verified is not None and bool(row.get("verified")) != bool(verified):
                    continue
                if session_id and row.get("session_id") != session_id:
                    continue
                if user_id and row.get("counted_by") != user_id:
                    continue
                variance_value = _as_float(row.get("variance"))
                if variance_min is not None and variance_value < _as_float(variance_min):
                    continue
                if variance_max is not None and variance_value > _as_float(variance_max):
                    continue
                counted_at = _coerce_datetime(row.get("counted_at"))
                if date_from and counted_at and counted_at.date() < date_from:
                    continue
                if date_to and counted_at and counted_at.date() > date_to:
                    continue
                if search_query:
                    haystack = " ".join(
                        [
                            str(row.get("item_code") or ""),
                            str(row.get("item_name") or ""),
                            str(row.get("barcode") or ""),
                            str(row.get("counted_by") or ""),
                        ]
                    ).lower()
                    if search_query.lower() not in haystack:
                        continue

            filtered.append(row)
        return filtered

    @staticmethod
    def _sort_verified_items(
        rows: list[dict[str, Any]],
        *,
        sort_by: Optional[str],
        sort_order: Any,
    ) -> list[dict[str, Any]]:
        key_name = _normalize_string(sort_by) or "counted_at"
        normalized_sort_order = getattr(sort_order, "value", sort_order)
        reverse = str(normalized_sort_order or "desc").lower() != "asc"

        def sort_key(row: dict[str, Any]) -> Any:
            value = row.get(key_name)
            if key_name in {"counted_at", "verified_at", "approved_at", "updated_at"}:
                return _sort_datetime_key(value)
            if isinstance(value, (int, float)):
                return value
            return str(value or "")

        return sorted(rows, key=sort_key, reverse=reverse)

    async def generate_verified_items_report(
        self,
        config: Any,
        *,
        columns: list[Any],
    ) -> dict[str, Any]:
        rows = await self._filtered_verified_items(config.filters)
        rows = self._sort_verified_items(rows, sort_by=config.sort_by, sort_order=config.sort_order)
        total_records = len(await self._list_documents("verified_items_projection"))
        filtered_records = len(rows)
        skip = max((int(config.page) - 1) * int(config.page_size), 0)
        paged_rows = rows[skip : skip + int(config.page_size)]

        total_variance = sum(_as_float(row.get("variance")) for row in rows)
        positive_variance = sum(max(_as_float(row.get("variance")), 0.0) for row in rows)
        negative_variance = sum(min(_as_float(row.get("variance")), 0.0) for row in rows)
        verified_count = sum(1 for row in rows if _line_verified(row))
        total_value = sum(
            _as_float(row.get("counted_qty")) * _as_float(row.get("mrp")) for row in rows
        )
        variance_value = sum(
            _as_float(row.get("variance")) * _as_float(row.get("mrp")) for row in rows
        )

        await self._record_hit("dashboard/data")
        now_iso = _utc_now().isoformat()
        data = []
        for row in paged_rows:
            data.append(
                {
                    "id": row.get("count_line_id"),
                    "item_code": row.get("item_code"),
                    "item_name": row.get("item_name"),
                    "barcode": row.get("barcode"),
                    "category": row.get("category"),
                    "warehouse": row.get("warehouse"),
                    "floor": row.get("floor"),
                    "rack_id": row.get("rack_id"),
                    "stock_qty": _as_float(row.get("stock_qty")),
                    "counted_qty": _as_float(row.get("counted_qty")),
                    "variance": _as_float(row.get("variance")),
                    "variance_percentage": _as_float(row.get("variance_percentage")),
                    "mrp": _as_float(row.get("mrp")),
                    "verified": bool(row.get("verified")),
                    "verified_by": row.get("verified_by"),
                    "verified_at": row.get("verified_at"),
                    "counted_by": row.get("counted_by"),
                    "counted_at": row.get("counted_at"),
                    "session_id": row.get("session_id"),
                    "notes": row.get("notes"),
                    "status": row.get("status"),
                    "approval_status": row.get("approval_status"),
                }
            )

        return {
            "success": True,
            "data": data,
            "columns": [col.model_dump() if hasattr(col, "model_dump") else col for col in columns],
            "summary": {
                "total_records": total_records,
                "filtered_records": filtered_records,
                "aggregations": {
                    "total_items": filtered_records,
                    "total_variance": total_variance,
                    "avg_variance": (
                        (total_variance / filtered_records) if filtered_records else 0.0
                    ),
                    "total_value": total_value,
                    "variance_value": variance_value,
                    "verified_count": verified_count,
                    "positive_variance": positive_variance,
                    "negative_variance": negative_variance,
                },
                "generated_at": now_iso,
                "generation_time_ms": 0.0,
                "filters_applied": (
                    config.filters.model_dump(exclude_none=True)
                    if getattr(config, "filters", None) is not None
                    else {}
                ),
                "report_type": "verified_items",
                "report_name": "Verified Items Report",
            },
            "pagination": {
                "page": int(config.page),
                "page_size": int(config.page_size),
                "total_pages": (
                    (filtered_records + int(config.page_size) - 1) // int(config.page_size)
                    if int(config.page_size) > 0
                    else 1
                ),
                "has_next": skip + int(config.page_size) < filtered_records,
                "has_prev": int(config.page) > 1,
            },
        }

    async def get_dashboard_stats(self) -> dict[str, Any]:
        rows = await self._filtered_verified_items(None)
        await self._record_hit("dashboard/stats")
        today_start = _utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
        by_warehouse: dict[str, int] = {}
        by_status: dict[str, int] = {}
        today_activity = 0
        verified_count = 0
        total_variance = 0.0
        positive_variance = 0.0
        negative_variance = 0.0

        for row in rows:
            warehouse = _normalize_string(row.get("warehouse")) or "Unknown"
            by_warehouse[warehouse] = by_warehouse.get(warehouse, 0) + 1
            status = _normalize_string(row.get("status")) or "Unknown"
            by_status[status] = by_status.get(status, 0) + 1

            counted_at = _coerce_datetime(row.get("counted_at"))
            if counted_at and counted_at >= today_start:
                today_activity += 1
            variance = _as_float(row.get("variance"))
            total_variance += variance
            positive_variance += max(variance, 0.0)
            negative_variance += min(variance, 0.0)
            if _line_verified(row):
                verified_count += 1

        total_items = len(rows)
        return {
            "success": True,
            "stats": {
                "total_items": total_items,
                "verified_items": verified_count,
                "pending_items": max(total_items - verified_count, 0),
                "today_activity": today_activity,
                "total_variance": total_variance,
                "positive_variance": positive_variance,
                "negative_variance": negative_variance,
                "avg_variance": (total_variance / total_items) if total_items else 0.0,
                "verification_rate": (verified_count / total_items * 100) if total_items else 0.0,
            },
            "by_warehouse": [
                {"warehouse": warehouse, "count": count}
                for warehouse, count in sorted(by_warehouse.items())
            ],
            "by_status": [
                {"status": status, "count": count} for status, count in sorted(by_status.items())
            ],
            "timestamp": _utc_now().isoformat(),
        }

    async def get_dashboard_filter_options(self) -> dict[str, Any]:
        rows = await self._filtered_verified_items(None)
        await self._record_hit("dashboard/filter-options")
        options = {
            "warehouses": sorted({row.get("warehouse") for row in rows if row.get("warehouse")}),
            "floors": sorted({row.get("floor") for row in rows if row.get("floor")}),
            "categories": sorted({row.get("category") for row in rows if row.get("category")}),
            "statuses": sorted({row.get("status") for row in rows if row.get("status")}),
            "users": sorted({row.get("counted_by") for row in rows if row.get("counted_by")}),
            "verified": [True, False],
        }
        return {"success": True, "options": options}

    async def get_report_filter_options(self) -> dict[str, Any]:
        dashboard_options = await self.get_dashboard_filter_options()
        session_rows = await self._get_session_projection_docs(current_user={"role": "admin"})
        users = sorted(
            {
                _normalize_string(row.get("staff_user"))
                for row in session_rows
                if _normalize_string(row.get("staff_user"))
            }
        )
        statuses = sorted(
            {
                str(row.get("status") or "").strip()
                for row in session_rows
                if str(row.get("status") or "").strip()
            }
            | set(dashboard_options["options"].get("statuses", []))
        )
        await self._record_hit("reports/filter-options")
        return {
            "warehouses": dashboard_options["options"].get("warehouses", []),
            "floors": dashboard_options["options"].get("floors", []),
            "categories": dashboard_options["options"].get("categories", []),
            "statuses": statuses,
            "users": users,
        }

    async def get_dashboard_item_details(self, item_id: str) -> Optional[dict[str, Any]]:
        row = await self.db.verified_items_projection.find_one({"count_line_id": item_id})
        if not isinstance(row, dict):
            row = await self.db.verified_items_projection.find_one({"id": item_id})
        if not isinstance(row, dict):
            return None
        await self._record_hit("dashboard/item-details")
        audit_trail = []
        cursor = self.db.audit_logs.find({"entity_id": item_id, "entity_type": "count_line"}).sort(
            "timestamp", -1
        )
        async for log in cursor.limit(50):
            record = dict(log)
            record.pop("_id", None)
            timestamp = record.get("timestamp")
            if isinstance(timestamp, datetime):
                record["timestamp"] = timestamp.isoformat()
            audit_trail.append(record)
        return {
            "success": True,
            "item": {
                "id": row.get("count_line_id"),
                "item_code": row.get("item_code"),
                "item_name": row.get("item_name"),
                "barcode": row.get("barcode"),
                "category": row.get("category"),
                "warehouse": row.get("warehouse"),
                "floor": row.get("floor"),
                "rack_id": row.get("rack_id"),
                "stock_qty": _as_float(row.get("stock_qty")),
                "counted_qty": _as_float(row.get("counted_qty")),
                "variance": _as_float(row.get("variance")),
                "variance_percentage": _as_float(row.get("variance_percentage")),
                "mrp": _as_float(row.get("mrp")),
                "verified": bool(row.get("verified")),
                "verified_by": row.get("verified_by"),
                "verified_at": row.get("verified_at"),
                "counted_by": row.get("counted_by"),
                "counted_at": row.get("counted_at"),
                "session_id": row.get("session_id"),
                "notes": row.get("notes"),
                "status": row.get("status"),
                "approval_status": row.get("approval_status"),
            },
            "audit_trail": audit_trail,
        }

    async def get_system_stats_business(self) -> dict[str, Any]:
        rows = await self._get_session_projection_docs()
        await self._record_hit("admin/system-stats")
        total_sessions = len(rows)
        active_sessions = sum(
            1
            for row in rows
            if str(row.get("status") or "").strip().upper()
            in {"OPEN", "ACTIVE", "PAUSED", "RECONCILE"}
        )
        return {
            "total_sessions": total_sessions,
            "active_sessions": active_sessions,
        }

    async def generate_stock_summary(self, filters: Any) -> list[dict[str, Any]]:
        rows = await self._filtered_verified_items(filters)
        await self._record_hit("reports/stock-summary")
        by_item: dict[tuple[str, str, str], dict[str, Any]] = {}
        for row in rows:
            item_code = str(row.get("item_code") or "")
            key = (item_code, str(row.get("warehouse") or ""), str(row.get("floor") or ""))
            summary = by_item.setdefault(
                key,
                {
                    "item_code": item_code,
                    "item_name": row.get("item_name"),
                    "category": row.get("category"),
                    "warehouse": row.get("warehouse"),
                    "floor": row.get("floor"),
                    "stock_qty": _as_float(row.get("stock_qty")),
                    "price": _as_float(row.get("mrp")),
                    "stock_value": _as_float(row.get("stock_qty")) * _as_float(row.get("mrp")),
                    "verification_count": 0,
                    "finalized_count": 0,
                    "finalized_qty": 0.0,
                    "last_verified": None,
                },
            )
            summary["verification_count"] += 1
            if _line_verified(row):
                summary["finalized_count"] += 1
                summary["finalized_qty"] += _as_float(row.get("counted_qty"))
                last_verified = row.get("verified_at") or row.get("counted_at")
                if last_verified and (
                    summary["last_verified"] is None
                    or _sort_datetime_key(last_verified)
                    > _sort_datetime_key(summary["last_verified"])
                ):
                    summary["last_verified"] = last_verified

        results = []
        for value in by_item.values():
            results.append(
                {
                    **value,
                    "is_verified": bool(value["finalized_count"] or value["verification_count"]),
                }
            )
        results.sort(key=lambda row: str(row.get("item_code") or ""))
        return results[:10000]

    async def generate_variance_report(self, filters: Any) -> list[dict[str, Any]]:
        rows = await self._list_documents("variance_summary_projection")
        await self._record_hit("reports/variance-report")
        results: list[dict[str, Any]] = []
        for row in rows:
            variance = _as_float(row.get("variance"))
            if abs(variance) <= 1e-9:
                continue
            if (
                getattr(filters, "status", None)
                and str(row.get("status") or "").lower() != str(filters.status).lower()
            ):
                continue
            if getattr(filters, "user_id", None) and row.get("counted_by") != filters.user_id:
                continue
            if getattr(filters, "warehouse", None) and row.get("warehouse") != filters.warehouse:
                continue
            if getattr(filters, "floor", None) and row.get("floor") != filters.floor:
                continue
            if getattr(filters, "category", None) and row.get("category") != filters.category:
                continue

            counted_at = _coerce_datetime(row.get("counted_at"))
            date_from = getattr(filters, "date_from", None)
            date_to = getattr(filters, "date_to", None)
            if (date_from or date_to) and counted_at is None:
                continue
            if date_from and counted_at and counted_at.date() < date_from:
                continue
            if date_to and counted_at and counted_at.date() > date_to:
                continue

            results.append(
                {
                    "item_code": row.get("item_code"),
                    "item_name": row.get("item_name") or "Unknown",
                    "expected_qty": _as_float(row.get("stock_qty")),
                    "counted_qty": _as_float(row.get("counted_qty")),
                    "variance": variance,
                    "variance_percentage": _as_float(row.get("variance_percentage")),
                    "status": row.get("status"),
                    "approval_status": row.get("approval_status"),
                    "counted_by": row.get("counted_by"),
                    "warehouse": row.get("warehouse"),
                    "location": "/".join(
                        part
                        for part in [row.get("floor"), row.get("rack_id")]
                        if isinstance(part, str) and part
                    ),
                    "counted_at": row.get("counted_at"),
                    "approved_by": row.get("approved_by"),
                    "approved_at": row.get("approved_at"),
                    "finalized_at": row.get("verified_at"),
                    "finalized_by": row.get("verified_by"),
                }
            )

        results.sort(key=lambda row: abs(_as_float(row.get("variance_percentage"))), reverse=True)
        return results[:10000]

    async def generate_session_history_report(self, filters: Any) -> list[dict[str, Any]]:
        rows = await self._get_session_projection_docs(
            status=getattr(filters, "status", None),
            user_id=getattr(filters, "user_id", None),
            current_user={"role": "admin"},
        )
        await self._record_hit("reports/session-history")
        results: list[dict[str, Any]] = []
        for row in rows:
            started_at = _coerce_datetime(row.get("started_at"))
            date_from = getattr(filters, "date_from", None)
            date_to = getattr(filters, "date_to", None)
            if (date_from or date_to) and started_at is None:
                continue
            if date_from and started_at and started_at.date() < date_from:
                continue
            if date_to and started_at and started_at.date() > date_to:
                continue
            completed_at = (
                _coerce_datetime(row.get("finalized_at"))
                or _coerce_datetime(row.get("completed_at"))
                or _coerce_datetime(row.get("closed_at"))
            )
            duration_minutes = None
            if started_at and completed_at:
                duration_minutes = (completed_at - started_at).total_seconds() / 60.0

            results.append(
                {
                    "session_id": row.get("session_id"),
                    "username": row.get("staff_user"),
                    "staff_name": row.get("staff_name"),
                    "warehouse": row.get("warehouse"),
                    "rack_id": row.get("rack_no"),
                    "floor": row.get("location_name"),
                    "status": row.get("status"),
                    "finalization_status": row.get("finalization_status"),
                    "started_at": row.get("started_at"),
                    "completed_at": completed_at,
                    "duration_minutes": duration_minutes,
                    "items_scanned": int(row.get("scanned_items") or row.get("total_items") or 0),
                    "items_verified": int(row.get("verified_items") or 0),
                    "total_variance": _as_float(row.get("total_variance")),
                    "finalized_by": row.get("finalized_by"),
                    "finalized_at": row.get("finalized_at"),
                }
            )
        return results

    async def build_projection_validation_report(self) -> dict[str, Any]:
        legacy_sessions = await self._list_documents("sessions")
        legacy_lines = await self._list_documents("count_lines")
        projection_sessions = await self._list_documents("session_dashboard_projection")
        projection_items = await self._list_documents("verified_items_projection")
        financial_rows = await self._list_documents("financial_projection")
        variance_rows = await self._list_documents("variance_summary_projection")

        legacy_total_sessions = len(legacy_sessions)
        projection_total_sessions = len(projection_sessions)
        legacy_verified_items = sum(
            1
            for row in legacy_lines
            if str(row.get("status") or "").strip().lower() not in {"superseded", "removed"}
        )
        projection_verified_items = sum(1 for row in projection_items if _line_active(row))
        legacy_variance_total = sum(_as_float(row.get("variance")) for row in legacy_lines)
        projection_variance_total = sum(_as_float(row.get("variance")) for row in variance_rows)
        legacy_financial_total = sum(
            _as_float(row.get("counted_qty"))
            * _as_float(row.get("mrp_counted") or row.get("mrp_erp"))
            for row in legacy_lines
        )
        projection_financial_total = sum(
            _as_float(row.get("total_counted_value")) for row in financial_rows
        )

        mismatches: list[dict[str, Any]] = []
        tolerance = 1e-6

        if legacy_total_sessions != projection_total_sessions:
            mismatches.append(
                {
                    "scope": "session_totals",
                    "legacy": legacy_total_sessions,
                    "projection": projection_total_sessions,
                }
            )
        if legacy_verified_items != projection_verified_items:
            mismatches.append(
                {
                    "scope": "verified_items",
                    "legacy": legacy_verified_items,
                    "projection": projection_verified_items,
                }
            )
        if abs(legacy_variance_total - projection_variance_total) > tolerance:
            mismatches.append(
                {
                    "scope": "variance_totals",
                    "legacy": legacy_variance_total,
                    "projection": projection_variance_total,
                }
            )
        if abs(legacy_financial_total - projection_financial_total) > tolerance:
            mismatches.append(
                {
                    "scope": "financial_totals",
                    "legacy": legacy_financial_total,
                    "projection": projection_financial_total,
                }
            )

        for mismatch in mismatches:
            await self.record_drift(scope=mismatch["scope"], detail=str(mismatch))

        return {
            "summary": {
                "drift_count": len(mismatches),
                "gap_count": 0,
                "is_consistent": len(mismatches) == 0,
                "validated_at": _utc_now().isoformat(),
            },
            "mismatches": mismatches,
        }
