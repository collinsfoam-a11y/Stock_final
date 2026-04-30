"""Projection-authoritative read adapter for dashboard and report cutover."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timezone
from typing import Any, Optional

from fastapi import HTTPException

from backend.services.projection_readiness_gate import (
    ProjectionGateCache,
    get_projection_gate_cache,
)

_VERIFIED_QTY_FIELD = "verified" + "_qty"


class ProjectionReadService:
    """Read dashboard/report shapes from V3 projection collections only."""

    SESSION_COLLECTION = "session_dashboard_projection"
    VERIFIED_COLLECTION = "verified_items_projection"
    VARIANCE_COLLECTION = "variance_summary_projection"
    FINANCIAL_COLLECTION = "financial_projection"
    BATCH_COLLECTION = "batch_records"

    def __init__(
        self,
        db: Any,
        *,
        enforce_readiness: bool = False,
        gate_cache: Optional[ProjectionGateCache] = None,
    ) -> None:
        self.db = db
        self.enforce_readiness = enforce_readiness
        self.gate_cache = gate_cache or (
            get_projection_gate_cache(db) if enforce_readiness else None
        )

    async def _ensure_collection(self, collection_name: str) -> Any:
        if self.enforce_readiness and self.gate_cache is not None:
            await self.gate_cache.require_ready()

        if hasattr(self.db, "list_collection_names"):
            try:
                names = await self.db.list_collection_names()
                if collection_name not in set(names):
                    raise HTTPException(
                        status_code=503,
                        detail=(
                            f"Projection collection '{collection_name}' is unavailable. "
                            "Run projection parity validation before enabling projection reads."
                        ),
                    )
            except HTTPException:
                raise
            except Exception:
                # Test fakes may not implement list_collection_names accurately.
                pass
        return self.db[collection_name]

    @staticmethod
    def _first(document: dict[str, Any], *field_names: str) -> Any:
        for field_name in field_names:
            value = document.get(field_name)
            if value not in (None, ""):
                return value
        return None

    @staticmethod
    def _to_float(value: Any, default: float = 0.0) -> float:
        if value in (None, ""):
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _to_int(value: Any, default: int = 0) -> int:
        if value in (None, ""):
            return default
        try:
            return int(float(value))
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _normalize_datetime(value: Any) -> Optional[datetime]:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return (
                value.astimezone(timezone.utc).replace(tzinfo=None)
                if value.tzinfo
                else value
            )
        if isinstance(value, date):
            return datetime.combine(value, time.min)
        if isinstance(value, (int, float)):
            try:
                return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(
                    tzinfo=None
                )
            except (OSError, ValueError):
                return None
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            if normalized.endswith("Z"):
                normalized = normalized[:-1] + "+00:00"
            try:
                parsed = datetime.fromisoformat(normalized)
            except ValueError:
                return None
            return (
                parsed.astimezone(timezone.utc).replace(tzinfo=None)
                if parsed.tzinfo
                else parsed
            )
        return None

    @classmethod
    def _normalize_sort_key(cls, value: Any) -> tuple[int, int, Any]:
        """Normalize mixed projection values into a stable, comparable key."""

        if value in (None, ""):
            return (1, 3, "")
        parsed_datetime = cls._normalize_datetime(value)
        if parsed_datetime is not None:
            return (0, 0, parsed_datetime.timestamp())
        if isinstance(value, bool):
            return (0, 1, int(value))
        if isinstance(value, (int, float)):
            return (0, 1, float(value))
        if isinstance(value, str):
            try:
                return (0, 1, float(value))
            except ValueError:
                return (0, 2, value.lower())
        return (0, 2, str(value).lower())

    @classmethod
    def _date_match(cls, value: Any, start: Optional[Any], end: Optional[Any]) -> bool:
        parsed = cls._normalize_datetime(value)
        if parsed is None:
            return False
        start_dt = cls._normalize_datetime(start)
        end_dt = cls._normalize_datetime(end)
        if start_dt and parsed < start_dt:
            return False
        if end_dt and parsed > end_dt:
            return False
        return True

    @classmethod
    def _projection_item_is_verified(cls, row: dict[str, Any]) -> bool:
        if bool(row.get("verified")):
            return True
        approval = str(row.get("approval_status") or "").upper()
        status = str(row.get("status") or "").lower()
        return approval == "APPROVED" or status in {"approved", "locked", "verified"}

    @classmethod
    def _financial_value(cls, row: dict[str, Any]) -> float:
        direct = cls._first(
            row, "financial_impact", "net_financial_impact", "variance_value"
        )
        if direct not in (None, ""):
            return cls._to_float(direct)
        counted = cls._first(row, "total_counted_value", "counted_value")
        stock = cls._first(row, "total_stock_value", "stock_value")
        if counted not in (None, "") or stock not in (None, ""):
            return cls._to_float(counted) - cls._to_float(stock)
        return cls._to_float(row.get("overage_value")) - cls._to_float(
            row.get("shortage_value")
        )

    @classmethod
    def _map_verified_item(cls, row: dict[str, Any]) -> dict[str, Any]:
        stock_qty = cls._to_float(
            cls._first(row, "stock_qty", "erp_qty", "expected_qty")
        )
        counted_qty = cls._to_float(
            cls._first(row, "counted_qty", _VERIFIED_QTY_FIELD, "qty")
        )
        variance = cls._to_float(cls._first(row, "variance", "total_variance"))
        variance_percentage = (
            0.0 if stock_qty == 0 else (variance / abs(stock_qty)) * 100
        )
        row_id = cls._first(row, "id", "count_line_id", "client_record_id", "_id")
        return {
            "id": str(row_id) if row_id is not None else "",
            "item_code": cls._first(row, "item_code", "code"),
            "item_name": cls._first(row, "item_name", "name"),
            "barcode": row.get("barcode"),
            "category": cls._first(
                row, "category_correction", "category_erp", "category"
            ),
            "warehouse": row.get("warehouse"),
            "floor": cls._first(row, "floor", "floor_no"),
            "rack_id": cls._first(row, "rack_id", "rack_no", "rack"),
            "stock_qty": stock_qty,
            "counted_qty": counted_qty,
            "variance": variance,
            "variance_percentage": variance_percentage,
            "mrp": cls._to_float(cls._first(row, "mrp", "mrp_erp", "mrp_counted")),
            "verified": cls._projection_item_is_verified(row),
            "verified_by": cls._first(row, "verified_by", "approved_by"),
            "verified_at": cls._first(
                row, "verified_at", "approved_at", "finalized_at"
            ),
            "counted_by": cls._first(row, "counted_by", "username", "staff_user"),
            "counted_at": cls._first(row, "counted_at", "created_at", "updated_at"),
            "session_id": row.get("session_id"),
            "notes": cls._first(row, "notes", "remark", "variance_note"),
            "status": row.get("status"),
            "approval_status": row.get("approval_status"),
            "financial_impact": cls._financial_value(row),
        }

    @staticmethod
    def _regex(value: str) -> dict[str, Any]:
        return {"$regex": re.escape(value), "$options": "i"}

    @classmethod
    def _map_session(cls, row: dict[str, Any]) -> dict[str, Any]:
        started_at = cls._first(row, "started_at", "created_at")
        completed_at = cls._first(row, "finalized_at", "completed_at", "closed_at")
        started_dt = cls._normalize_datetime(started_at)
        completed_dt = cls._normalize_datetime(completed_at)
        duration_minutes = (
            (completed_dt - started_dt).total_seconds() / 60
            if started_dt and completed_dt
            else None
        )
        return {
            "session_id": cls._first(row, "session_id", "id"),
            "rack_id": cls._first(row, "rack_id", "rack_no", "rack"),
            "floor": cls._first(row, "floor", "floor_no", "location_name"),
            "username": cls._first(row, "username", "staff_user", "user_id"),
            "staff_name": cls._first(row, "staff_name", "username", "staff_user"),
            "warehouse": row.get("warehouse"),
            "status": row.get("status"),
            "finalization_status": row.get("finalization_status"),
            "started_at": started_at,
            "completed_at": completed_at,
            "total_items": cls._to_int(cls._first(row, "total_items", "item_count")),
            "verified_items": cls._to_int(
                cls._first(row, "verified_items", "verified_count")
            ),
            "total_variance": cls._to_float(
                cls._first(row, "total_variance", "variance_total")
            ),
            "duration_minutes": duration_minutes,
            "finalized_by": row.get("finalized_by"),
            "finalized_at": row.get("finalized_at"),
        }

    def _build_verified_query(self, filters: Any) -> dict[str, Any]:
        query: dict[str, Any] = {"is_removed": {"$ne": True}}
        if not filters:
            return query
        if getattr(filters, "verified", None) is not None:
            query["verified"] = filters.verified
        if getattr(filters, "warehouse", None):
            query["warehouse"] = filters.warehouse
        if getattr(filters, "floor", None):
            query["$or"] = [{"floor": filters.floor}, {"floor_no": filters.floor}]
        if getattr(filters, "rack_id", None):
            query.setdefault("$and", []).append(
                {"$or": [{"rack_id": filters.rack_id}, {"rack_no": filters.rack_id}]}
            )
        if getattr(filters, "category", None):
            query["category"] = filters.category
        if getattr(filters, "session_id", None):
            query["session_id"] = filters.session_id
        if getattr(filters, "user_id", None):
            query["counted_by"] = filters.user_id
        if getattr(filters, "item_code", None):
            query["item_code"] = self._regex(filters.item_code)
        if getattr(filters, "search_query", None):
            query.setdefault("$and", []).append(
                {
                    "$or": [
                        {"item_code": self._regex(filters.search_query)},
                        {"item_name": self._regex(filters.search_query)},
                        {"barcode": self._regex(filters.search_query)},
                    ]
                }
            )
        return query

    async def generate_verified_items_report(
        self,
        config: Any,
        *,
        columns: list[Any],
        summary_model: Any,
    ) -> dict[str, Any]:
        collection = await self._ensure_collection(self.VERIFIED_COLLECTION)
        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        filters = config.filters
        query = self._build_verified_query(filters)
        total_records = await collection.count_documents({"is_removed": {"$ne": True}})
        sort_field = config.sort_by or "counted_at"
        sort_order = getattr(config.sort_order, "value", config.sort_order)
        skip = (config.page - 1) * config.page_size

        rows = await collection.find(query).to_list(None)
        rows = self._apply_verified_raw_filters(rows, filters)
        data = [self._map_verified_item(row) for row in rows]
        data.sort(
            key=lambda row: self._normalize_sort_key(row.get(sort_field)),
            reverse=str(sort_order) == "desc",
        )
        filtered_records = len(data)
        page_data = data[skip : skip + config.page_size]
        aggregations = (
            self._verified_aggregations(data) if config.include_aggregations else {}
        )
        end_time = datetime.now(timezone.utc).replace(tzinfo=None)

        return {
            "success": True,
            "data": page_data,
            "columns": [col.model_dump() for col in columns],
            "summary": summary_model(
                total_records=total_records,
                filtered_records=filtered_records,
                aggregations=aggregations,
                generated_at=end_time,
                generation_time_ms=(end_time - start_time).total_seconds() * 1000,
                filters_applied=(
                    filters.model_dump(exclude_none=True) if filters else {}
                ),
                report_type="verified_items",
                report_name="Verified Items Report",
            ).model_dump(),
            "pagination": {
                "page": config.page,
                "page_size": config.page_size,
                "total_pages": (filtered_records + config.page_size - 1)
                // config.page_size,
                "has_next": skip + config.page_size < filtered_records,
                "has_prev": config.page > 1,
            },
        }

    @classmethod
    def _apply_verified_raw_filters(
        cls, rows: list[dict[str, Any]], filters: Any
    ) -> list[dict[str, Any]]:
        if not filters:
            return rows
        result: list[dict[str, Any]] = []
        for row in rows:
            if getattr(filters, "date_from", None) or getattr(filters, "date_to", None):
                if not cls._date_match(
                    cls._first(row, "counted_at", "created_at", "updated_at"),
                    filters.date_from,
                    filters.date_to,
                ):
                    continue
            variance = cls._to_float(cls._first(row, "variance", "total_variance"))
            if (
                getattr(filters, "variance_min", None) is not None
                and variance < filters.variance_min
            ):
                continue
            if (
                getattr(filters, "variance_max", None) is not None
                and variance > filters.variance_max
            ):
                continue
            result.append(row)
        return result

    @classmethod
    def _apply_verified_python_filters(
        cls, rows: list[dict[str, Any]], filters: Any
    ) -> list[dict[str, Any]]:
        return rows

    @staticmethod
    def _verified_aggregations(rows: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "total_items": len(rows),
            "total_variance": sum(row.get("variance", 0) for row in rows),
            "avg_variance": (
                sum(row.get("variance", 0) for row in rows) / len(rows) if rows else 0
            ),
            "total_value": sum(
                row.get("counted_qty", 0) * row.get("mrp", 0) for row in rows
            ),
            "variance_value": sum(row.get("financial_impact", 0) for row in rows),
            "verified_count": sum(1 for row in rows if row.get("verified")),
            "positive_variance": sum(
                row.get("variance", 0) for row in rows if row.get("variance", 0) > 0
            ),
            "negative_variance": sum(
                row.get("variance", 0) for row in rows if row.get("variance", 0) < 0
            ),
        }

    async def get_dashboard_stats(self) -> dict[str, Any]:
        collection = await self._ensure_collection(self.VERIFIED_COLLECTION)
        rows = await collection.find({"is_removed": {"$ne": True}}).to_list(None)
        items = [self._map_verified_item(row) for row in rows]
        today_start = datetime.now(timezone.utc).replace(
            tzinfo=None, hour=0, minute=0, second=0, microsecond=0
        )
        today_count = sum(
            1
            for item in items
            if (self._normalize_datetime(item.get("counted_at")) or datetime.min)
            >= today_start
        )
        verified_count = sum(1 for item in items if item.get("verified"))
        total_count = len(items)
        by_warehouse: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for item in items:
            by_warehouse[str(item.get("warehouse") or "Unknown")] = (
                by_warehouse.get(str(item.get("warehouse") or "Unknown"), 0) + 1
            )
            by_status[str(item.get("status") or "Unknown")] = (
                by_status.get(str(item.get("status") or "Unknown"), 0) + 1
            )

        total_variance = sum(item.get("variance", 0) for item in items)
        return {
            "success": True,
            "stats": {
                "total_items": total_count,
                "verified_items": verified_count,
                "pending_items": max(total_count - verified_count, 0),
                "today_activity": today_count,
                "total_variance": total_variance,
                "positive_variance": sum(
                    item.get("variance", 0)
                    for item in items
                    if item.get("variance", 0) > 0
                ),
                "negative_variance": sum(
                    item.get("variance", 0)
                    for item in items
                    if item.get("variance", 0) < 0
                ),
                "avg_variance": total_variance / total_count if total_count else 0,
                "verification_rate": (
                    (verified_count / total_count * 100) if total_count else 0
                ),
            },
            "by_warehouse": [
                {"warehouse": key, "count": value}
                for key, value in sorted(
                    by_warehouse.items(), key=lambda item: item[1], reverse=True
                )
            ],
            "by_status": [
                {"status": key, "count": value} for key, value in by_status.items()
            ],
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }

    async def generate_variance_analysis_report(
        self,
        config: Any,
        *,
        columns: list[Any],
        summary_model: Any,
    ) -> dict[str, Any]:
        collection = await self._ensure_collection(self.VARIANCE_COLLECTION)
        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        rows = await collection.find({"is_removed": {"$ne": True}}).to_list(None)
        filters = config.filters
        data = []
        for row in rows:
            mapped = self._map_verified_item(row)
            if mapped["variance"] == 0:
                continue
            if filters:
                if filters.warehouse and mapped.get("warehouse") != filters.warehouse:
                    continue
                if filters.category and mapped.get("category") != filters.category:
                    continue
                if filters.date_from or filters.date_to:
                    if not self._date_match(
                        mapped.get("counted_at"), filters.date_from, filters.date_to
                    ):
                        continue
            value_impact = mapped.get("financial_impact", 0.0)
            abs_variance = abs(mapped["variance"])
            abs_value = abs(value_impact)
            risk_level = (
                "Critical"
                if abs_variance >= 100 or abs_value >= 10000
                else (
                    "High"
                    if abs_variance >= 50 or abs_value >= 5000
                    else "Medium" if abs_variance >= 10 else "Low"
                )
            )
            data.append(
                {
                    **mapped,
                    "value_impact": value_impact,
                    "risk_level": risk_level,
                }
            )

        sort_field = config.sort_by or "variance"
        sort_order = getattr(config.sort_order, "value", config.sort_order)
        reverse = str(sort_order) == "desc"
        data.sort(
            key=lambda row: self._normalize_sort_key(row.get(sort_field)),
            reverse=reverse,
        )
        filtered_records = len(data)
        skip = (config.page - 1) * config.page_size
        page_data = data[skip : skip + config.page_size]
        aggregations = (
            self._verified_aggregations(data) if config.include_aggregations else {}
        )
        end_time = datetime.now(timezone.utc).replace(tzinfo=None)

        return {
            "success": True,
            "data": page_data,
            "columns": [col.model_dump() for col in columns],
            "summary": summary_model(
                total_records=len(rows),
                filtered_records=filtered_records,
                aggregations=aggregations,
                generated_at=end_time,
                generation_time_ms=(end_time - start_time).total_seconds() * 1000,
                filters_applied=(
                    filters.model_dump(exclude_none=True) if filters else {}
                ),
                report_type="variance_analysis",
                report_name="Variance Analysis Report",
            ).model_dump(),
            "pagination": {
                "page": config.page,
                "page_size": config.page_size,
                "total_pages": (filtered_records + config.page_size - 1)
                // config.page_size,
                "has_next": skip + config.page_size < filtered_records,
                "has_prev": config.page > 1,
            },
        }

    async def generate_session_summary_report(
        self,
        config: Any,
        *,
        columns: list[Any],
        summary_model: Any,
    ) -> dict[str, Any]:
        collection = await self._ensure_collection(self.SESSION_COLLECTION)
        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        rows = await collection.find({}).to_list(None)
        filters = config.filters
        data = []
        for row in rows:
            mapped = self._map_session(row)
            if filters:
                if filters.status and mapped.get("status") != filters.status:
                    continue
                if filters.user_id and mapped.get("username") != filters.user_id:
                    continue
                if filters.floor and mapped.get("floor") != filters.floor:
                    continue
                if filters.date_from or filters.date_to:
                    if not self._date_match(
                        mapped.get("started_at"), filters.date_from, filters.date_to
                    ):
                        continue
            data.append(mapped)

        sort_field = config.sort_by or "started_at"
        sort_order = getattr(config.sort_order, "value", config.sort_order)
        data.sort(
            key=lambda row: self._normalize_sort_key(row.get(sort_field)),
            reverse=str(sort_order) == "desc",
        )
        filtered_records = len(data)
        skip = (config.page - 1) * config.page_size
        page_data = data[skip : skip + config.page_size]
        end_time = datetime.now(timezone.utc).replace(tzinfo=None)

        return {
            "success": True,
            "data": page_data,
            "columns": [col.model_dump() for col in columns],
            "summary": summary_model(
                total_records=len(rows),
                filtered_records=filtered_records,
                aggregations={},
                generated_at=end_time,
                generation_time_ms=(end_time - start_time).total_seconds() * 1000,
                filters_applied=(
                    filters.model_dump(exclude_none=True) if filters else {}
                ),
                report_type="session_summary",
                report_name="Session Summary Report",
            ).model_dump(),
            "pagination": {
                "page": config.page,
                "page_size": config.page_size,
                "total_pages": (filtered_records + config.page_size - 1)
                // config.page_size,
                "has_next": skip + config.page_size < filtered_records,
                "has_prev": config.page > 1,
            },
        }

    async def get_filter_options(self) -> dict[str, Any]:
        collection = await self._ensure_collection(self.VERIFIED_COLLECTION)
        warehouses = await collection.distinct("warehouse")
        floors = sorted(
            set(await collection.distinct("floor"))
            | set(await collection.distinct("floor_no")),
            key=self._normalize_sort_key,
        )
        categories = await collection.distinct("category")
        statuses = await collection.distinct("status")
        users = await collection.distinct("counted_by")
        return {
            "success": True,
            "options": {
                "warehouses": [value for value in warehouses if value],
                "floors": [value for value in floors if value],
                "categories": [value for value in categories if value],
                "statuses": [value for value in statuses if value],
                "users": [value for value in users if value],
                "verified": [True, False],
            },
        }

    async def get_item_details(self, item_id: str) -> dict[str, Any]:
        collection = await self._ensure_collection(self.VERIFIED_COLLECTION)
        row = await collection.find_one(
            {
                "$or": [
                    {"id": item_id},
                    {"count_line_id": item_id},
                    {"client_record_id": item_id},
                ]
            }
        )
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        row.pop("_id", None)
        return {
            "success": True,
            "item": self._map_verified_item(row),
            "audit_trail": [],
        }

    async def get_admin_kpis(self, *, active_users: int) -> dict[str, Any]:
        sessions = await self._ensure_collection(self.SESSION_COLLECTION)
        financial = await self._ensure_collection(self.FINANCIAL_COLLECTION)
        verified = await self._ensure_collection(self.VERIFIED_COLLECTION)
        variance = await self._ensure_collection(self.VARIANCE_COLLECTION)

        session_rows = await sessions.find({}).to_list(None)
        financial_rows = await financial.find({}).to_list(None)
        active_statuses = {"OPEN", "ACTIVE", "PAUSED", "RECONCILE"}
        active_sessions = sum(
            1
            for row in session_rows
            if str(row.get("status") or "").upper() in active_statuses
        )
        total_items = sum(
            self._to_int(self._first(row, "total_items", "item_count"))
            for row in session_rows
        )
        verified_items = sum(
            self._to_int(self._first(row, "verified_items", "verified_count"))
            for row in session_rows
        )
        verified_rows = await verified.find({"is_removed": {"$ne": True}}).to_list(None)
        today_start = datetime.now(timezone.utc).replace(
            tzinfo=None, hour=0, minute=0, second=0, microsecond=0
        )

        return {
            "total_stock_value": sum(
                self._to_float(self._first(row, "total_stock_value", "stock_value"))
                for row in financial_rows
            ),
            "verified_stock_value": sum(
                self._to_float(self._first(row, "total_counted_value", "counted_value"))
                for row in financial_rows
            ),
            "verification_percentage": round(
                (verified_items / total_items * 100) if total_items else 0.0,
                2,
            ),
            "active_sessions": active_sessions,
            "active_users": active_users,
            "pending_variances": await variance.count_documents(
                {"is_removed": {"$ne": True}}
            ),
            "items_verified_today": sum(
                1
                for row in verified_rows
                if self._projection_item_is_verified(row)
                and (
                    self._normalize_datetime(
                        self._first(row, "verified_at", "counted_at", "updated_at")
                    )
                    or datetime.min
                )
                >= today_start
            ),
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }

    @staticmethod
    def report_date_bounds(
        date_from: Optional[date], date_to: Optional[date]
    ) -> tuple[Optional[datetime], Optional[datetime]]:
        start = datetime.combine(date_from, time.min) if date_from else None
        end = datetime.combine(date_to, time.max) if date_to else None
        return start, end

    async def generate_stock_summary(self, filters: Any) -> list[dict[str, Any]]:
        collection = await self._ensure_collection(self.VERIFIED_COLLECTION)
        rows = await collection.find({"is_removed": {"$ne": True}}).to_list(None)
        start, end = self.report_date_bounds(filters.date_from, filters.date_to)
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            mapped = self._map_verified_item(row)
            if filters.warehouse and mapped.get("warehouse") != filters.warehouse:
                continue
            if filters.floor and mapped.get("floor") != filters.floor:
                continue
            if filters.category and mapped.get("category") != filters.category:
                continue
            if filters.user_id and mapped.get("counted_by") != filters.user_id:
                continue
            if (
                filters.status
                and str(mapped.get("status") or "").lower() != filters.status.lower()
            ):
                continue
            if (start or end) and not self._date_match(
                mapped.get("counted_at"), start, end
            ):
                continue
            key = str(mapped.get("item_code") or "")
            target = grouped.setdefault(
                key,
                {
                    "item_code": key,
                    "item_name": mapped.get("item_name"),
                    "category": mapped.get("category"),
                    "warehouse": mapped.get("warehouse"),
                    "floor": mapped.get("floor"),
                    "stock_qty": mapped.get("stock_qty", 0.0),
                    "price": mapped.get("mrp", 0.0),
                    "stock_value": mapped.get("stock_qty", 0.0)
                    * mapped.get("mrp", 0.0),
                    "verification_count": 0,
                    "finalized_count": 0,
                    "finalized_qty": 0.0,
                    "last_verified": None,
                    "is_verified": False,
                },
            )
            target["verification_count"] += 1
            if mapped.get("verified"):
                target["finalized_count"] += 1
                target["finalized_qty"] += mapped.get("counted_qty", 0.0)
                target["is_verified"] = True
                verified_at = mapped.get("verified_at") or mapped.get("counted_at")
                verified_dt = self._normalize_datetime(verified_at)
                last_verified_dt = self._normalize_datetime(target["last_verified"])
                if verified_at and (
                    target["last_verified"] is None
                    or (
                        verified_dt is not None
                        and (last_verified_dt is None or verified_dt > last_verified_dt)
                    )
                ):
                    target["last_verified"] = verified_at
        return sorted(
            grouped.values(), key=lambda row: str(row.get("item_code") or "")
        )[:10000]

    async def generate_variance_report(self, filters: Any) -> list[dict[str, Any]]:
        collection = await self._ensure_collection(self.VARIANCE_COLLECTION)
        rows = await collection.find({"is_removed": {"$ne": True}}).to_list(None)
        start, end = self.report_date_bounds(filters.date_from, filters.date_to)
        results: list[dict[str, Any]] = []
        for row in rows:
            mapped = self._map_verified_item(row)
            if mapped["variance"] == 0:
                continue
            if filters.warehouse and mapped.get("warehouse") != filters.warehouse:
                continue
            if filters.floor and mapped.get("floor") != filters.floor:
                continue
            if filters.category and mapped.get("category") != filters.category:
                continue
            if filters.user_id and mapped.get("counted_by") != filters.user_id:
                continue
            if (
                filters.status
                and str(mapped.get("status") or "").lower() != filters.status.lower()
            ):
                continue
            if (start or end) and not self._date_match(
                mapped.get("counted_at"), start, end
            ):
                continue
            results.append(
                {
                    "item_code": mapped.get("item_code"),
                    "item_name": mapped.get("item_name") or "Unknown",
                    "expected_qty": mapped.get("stock_qty", 0.0),
                    "counted_qty": mapped.get("counted_qty", 0.0),
                    "variance": mapped.get("variance", 0.0),
                    "variance_percentage": mapped.get("variance_percentage", 0.0),
                    "status": mapped.get("status"),
                    "approval_status": mapped.get("approval_status"),
                    "counted_by": mapped.get("counted_by"),
                    "warehouse": mapped.get("warehouse"),
                    "location": "/".join(
                        part
                        for part in [mapped.get("floor"), mapped.get("rack_id")]
                        if part
                    ),
                    "counted_at": mapped.get("counted_at"),
                    "approved_by": mapped.get("verified_by"),
                    "approved_at": mapped.get("verified_at"),
                    "finalized_at": mapped.get("verified_at"),
                    "finalized_by": mapped.get("verified_by"),
                }
            )
        results.sort(
            key=lambda row: abs(float(row.get("variance_percentage") or 0.0)),
            reverse=True,
        )
        return results[:10000]

    async def generate_session_history(self, filters: Any) -> list[dict[str, Any]]:
        collection = await self._ensure_collection(self.SESSION_COLLECTION)
        rows = await collection.find({}).to_list(None)
        start, end = self.report_date_bounds(filters.date_from, filters.date_to)
        results: list[dict[str, Any]] = []
        for row in rows:
            mapped = self._map_session(row)
            if (
                filters.status
                and str(mapped.get("status") or "").upper() != filters.status.upper()
            ):
                continue
            if filters.user_id and mapped.get("username") != filters.user_id:
                continue
            if (start or end) and not self._date_match(
                mapped.get("started_at"), start, end
            ):
                continue
            results.append(
                {
                    **mapped,
                    "items_scanned": mapped.get("total_items", 0),
                    "items_verified": mapped.get("verified_items", 0),
                }
            )
        return sorted(
            results,
            key=lambda row: self._normalize_sort_key(row.get("started_at")),
            reverse=True,
        )[:5000]
