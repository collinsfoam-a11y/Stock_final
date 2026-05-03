"""Projection-authoritative read adapter for dashboard and report cutover."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException

from backend.services.projection_readiness_gate import (
    ProjectionGateCache,
    get_projection_gate_cache,
)
from backend.services.projection_snapshot import (
    PROJECTION_ITEM_SNAPSHOT_FIELDS,
    PROJECTION_SESSION_SNAPSHOT_FIELDS,
    SOURCE_SESSION_TIMESTAMP_FIELDS,
    apply_snapshot_filter,
    get_latest_collection_timestamp,
    get_projection_snapshot_ts,
    snapshot_mode_enabled,
)
from backend.services.query_utils import (
    date_match,
    escaped_regex_filter,
    normalize_datetime,
    normalize_sort_key,
)

_VERIFIED_QTY_FIELD = "verified" + "_qty"
_PROJECTION_SCAN_LIMIT = 10000
_RETRIABLE_READINESS_REASONS = {"STALE_DATA", "LAG_EXCEEDED", "PARITY_FAILED"}
_NON_RETRIABLE_READINESS_REASONS = {"DRIFT_DETECTED", "COLLECTION_MISSING"}
logger = logging.getLogger(__name__)


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
        self._validation_freshness_checked = False

    async def _ensure_collection(self, collection_name: str) -> Any:
        if self.enforce_readiness and self.gate_cache is not None:
            await self._require_readiness_with_retry(collection_name)
        if self._validation_mode_enabled():
            await self._ensure_projection_freshness()
        return self.db[collection_name]

    @staticmethod
    def _readiness_retry_attempts() -> int:
        try:
            retries = int(os.getenv("PROJECTION_READINESS_RETRY_ATTEMPTS", "2"))
        except ValueError:
            retries = 2
        return max(0, min(retries, 2))

    @staticmethod
    def _readiness_retry_delay_seconds() -> float:
        try:
            delay_ms = float(os.getenv("PROJECTION_READINESS_RETRY_DELAY_MS", "75"))
        except ValueError:
            delay_ms = 75.0
        return min(max(delay_ms / 1000.0, 0.05), 0.1)

    def _is_retriable_projection_inconsistency(self, detail: dict[str, Any]) -> bool:
        if detail.get("code") != "PROJECTION_INCONSISTENT":
            return False

        reason = str(detail.get("reason") or "")
        if reason in _NON_RETRIABLE_READINESS_REASONS:
            return False
        if reason not in _RETRIABLE_READINESS_REASONS:
            return False

        metrics = detail.get("metrics")
        if not isinstance(metrics, dict):
            return reason in {"STALE_DATA", "LAG_EXCEEDED"}

        drift_count = self._to_int(metrics.get("projection_drift_count"))
        gap_count = self._to_int(metrics.get("projection_gap_count"))
        if drift_count > 0 or gap_count > 0:
            return False
        return True

    @staticmethod
    def _iso_or_none(value: Optional[datetime]) -> Optional[str]:
        return value.isoformat() if isinstance(value, datetime) else None

    def _projection_timing_context(
        self,
        *,
        status: Any,
        read_time: datetime,
    ) -> dict[str, Any]:
        lag_seconds = getattr(status, "lag_seconds", None)
        checked_at = getattr(status, "checked_at", None)
        estimated_write_time: Optional[datetime] = None
        if isinstance(checked_at, datetime) and isinstance(lag_seconds, (int, float)):
            estimated_write_time = checked_at - timedelta(seconds=max(float(lag_seconds), 0.0))

        projection_available_time: Optional[datetime] = None
        stability_since = getattr(status, "stability_since", None)
        if isinstance(stability_since, datetime):
            window_seconds = max(
                int(getattr(self.gate_cache, "stability_window_seconds", 0) or 0),
                0,
            )
            projection_available_time = stability_since + timedelta(seconds=window_seconds)

        return {
            "write_time": self._iso_or_none(estimated_write_time),
            "projection_available_time": self._iso_or_none(projection_available_time),
            "read_time": read_time.isoformat(),
        }

    async def _require_readiness_with_retry(self, collection_name: str) -> None:
        if self.gate_cache is None:
            return

        retries = self._readiness_retry_attempts()
        delay_seconds = self._readiness_retry_delay_seconds()
        attempts = retries + 1
        first_read_time = datetime.now(timezone.utc).replace(tzinfo=None)

        for attempt in range(attempts):
            status = await self.gate_cache.get_status(force_refresh=attempt > 0)
            if status.ready:
                if attempt > 0:
                    timing = self._projection_timing_context(
                        status=status,
                        read_time=datetime.now(timezone.utc).replace(tzinfo=None),
                    )
                    logger.info(
                        "projection_readiness_retry_succeeded",
                        extra={
                            "collection": collection_name,
                            "attempt": attempt + 1,
                            "max_attempts": attempts,
                            "retry_delay_ms": int(delay_seconds * 1000),
                            "first_read_time": first_read_time.isoformat(),
                            **timing,
                        },
                    )
                return

            detail = status.http_detail()
            if attempt < retries and self._is_retriable_projection_inconsistency(detail):
                read_time = datetime.now(timezone.utc).replace(tzinfo=None)
                timing = self._projection_timing_context(status=status, read_time=read_time)
                logger.warning(
                    "projection_readiness_retry_pending",
                    extra={
                        "collection": collection_name,
                        "attempt": attempt + 1,
                        "max_attempts": attempts,
                        "retry_delay_ms": int(delay_seconds * 1000),
                        "reason": detail.get("reason"),
                        "retry_after_seconds": detail.get("retry_after_seconds"),
                        "first_read_time": first_read_time.isoformat(),
                        **timing,
                    },
                )
                await asyncio.sleep(delay_seconds)
                continue

            raise HTTPException(status_code=503, detail=detail)

    @staticmethod
    def _validation_mode_enabled() -> bool:
        return snapshot_mode_enabled()

    @staticmethod
    def _validation_freshness_retries() -> int:
        try:
            return max(
                1,
                int(os.getenv("PROJECTION_VALIDATION_FRESHNESS_RETRIES", "3")),
            )
        except ValueError:
            return 3

    @staticmethod
    def _validation_freshness_retry_delay_seconds() -> float:
        try:
            return max(
                0.0,
                float(
                    os.getenv(
                        "PROJECTION_VALIDATION_FRESHNESS_RETRY_DELAY_SECONDS", "0.5"
                    )
                ),
            )
        except ValueError:
            return 0.5

    @staticmethod
    def _max_projection_lag_seconds() -> float:
        try:
            return max(0.0, float(os.getenv("PROJECTION_MAX_LAG_SECONDS", "5.0")))
        except ValueError:
            return 5.0

    async def _ensure_projection_freshness(self) -> None:
        if self._validation_freshness_checked:
            return

        last_detail: dict[str, Any] | None = None
        retries = self._validation_freshness_retries()
        delay_seconds = self._validation_freshness_retry_delay_seconds()
        for attempt in range(retries):
            is_fresh, detail = await self._projection_freshness_status()
            if is_fresh:
                self._validation_freshness_checked = True
                return

            last_detail = detail
            if attempt < retries - 1 and delay_seconds > 0:
                await asyncio.sleep(delay_seconds)

        raise HTTPException(
            status_code=503,
            detail=last_detail or self._projection_not_ready_detail(),
        )

    async def _projection_freshness_status(self) -> tuple[bool, dict[str, Any]]:
        legacy_sessions = self.db["sessions"]
        projection_sessions = self.db[self.SESSION_COLLECTION]
        snapshot_ts = get_projection_snapshot_ts()
        legacy_query = (
            apply_snapshot_filter({}, SOURCE_SESSION_TIMESTAMP_FIELDS, snapshot_ts)
            if snapshot_ts
            else {}
        )
        projection_query = (
            apply_snapshot_filter({}, PROJECTION_SESSION_SNAPSHOT_FIELDS, snapshot_ts)
            if snapshot_ts
            else {}
        )

        legacy_count = await legacy_sessions.count_documents(legacy_query)
        projection_count = await projection_sessions.count_documents(projection_query)
        latest_legacy = await self._latest_source_timestamp(legacy_sessions)
        latest_projection = await self._latest_projection_timestamp(projection_sessions)

        metrics = {
            "snapshot_ts": snapshot_ts.isoformat() if snapshot_ts else None,
            "legacy_session_count": legacy_count,
            "projection_session_count": projection_count,
            "latest_legacy_session_ts": (
                latest_legacy.isoformat() if latest_legacy else None
            ),
            "latest_projection_session_ts": (
                latest_projection.isoformat() if latest_projection else None
            ),
        }
        if legacy_count != projection_count:
            return False, self._projection_not_ready_detail(metrics=metrics)
        if latest_legacy and latest_projection is None:
            return False, self._projection_not_ready_detail(metrics=metrics)
        max_lag_seconds = self._max_projection_lag_seconds()
        lag_seconds = None
        if latest_legacy and latest_projection:
            lag_seconds = max((latest_legacy - latest_projection).total_seconds(), 0.0)
            metrics["projection_session_lag_seconds"] = lag_seconds
        if snapshot_ts:
            if latest_projection and latest_projection < snapshot_ts:
                if lag_seconds is not None and lag_seconds <= max_lag_seconds:
                    return True, {}
                return False, self._projection_not_ready_detail(metrics=metrics)
            return True, {}
        if latest_legacy and latest_projection and latest_projection < latest_legacy:
            if lag_seconds is not None and lag_seconds <= max_lag_seconds:
                return True, {}
            return False, self._projection_not_ready_detail(metrics=metrics)
        return True, {}

    @classmethod
    async def _latest_source_timestamp(cls, collection: Any) -> datetime | None:
        return await cls._latest_timestamp(collection, SOURCE_SESSION_TIMESTAMP_FIELDS)

    @classmethod
    async def _latest_projection_timestamp(cls, collection: Any) -> datetime | None:
        return await cls._latest_timestamp(collection, PROJECTION_SESSION_SNAPSHOT_FIELDS)

    @classmethod
    async def _latest_timestamp(
        cls,
        collection: Any,
        fields: tuple[str, ...],
    ) -> datetime | None:
        return await get_latest_collection_timestamp(collection, fields)

    @staticmethod
    def _projection_not_ready_detail(
        *,
        metrics: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return {
            "code": "PROJECTION_INCONSISTENT",
            "reason": "STALE_DATA",
            "message": "Projection freshness guard is waiting for session projection catch-up.",
            "retry_after_seconds": 1,
            "metrics": metrics or {},
        }

    @classmethod
    def _snapshot_query(cls, collection_name: str, query: dict[str, Any]) -> dict[str, Any]:
        if collection_name == cls.SESSION_COLLECTION:
            return apply_snapshot_filter(query, PROJECTION_SESSION_SNAPSHOT_FIELDS)
        if collection_name in {
            cls.VERIFIED_COLLECTION,
            cls.VARIANCE_COLLECTION,
            cls.FINANCIAL_COLLECTION,
        }:
            return apply_snapshot_filter(query, PROJECTION_ITEM_SNAPSHOT_FIELDS)
        return dict(query)

    @staticmethod
    async def _find_page(
        collection: Any,
        query: dict[str, Any],
        *,
        sort_field: str,
        sort_direction: int,
        skip: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        cursor = (
            collection.find(query)
            .sort(sort_field, sort_direction)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    @staticmethod
    async def _find_limited(
        collection: Any,
        query: dict[str, Any],
        *,
        sort_field: str = "updated_at",
        sort_direction: int = -1,
        limit: int = _PROJECTION_SCAN_LIMIT,
    ) -> list[dict[str, Any]]:
        cursor = collection.find(query).sort(sort_field, sort_direction).limit(limit)
        return await cursor.to_list(length=limit)

    @staticmethod
    async def _find_natural_limited(
        collection: Any,
        query: dict[str, Any],
        *,
        limit: int = _PROJECTION_SCAN_LIMIT,
    ) -> list[dict[str, Any]]:
        cursor = collection.find(query).limit(limit)
        return await cursor.to_list(length=limit)

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

    _normalize_datetime = staticmethod(normalize_datetime)
    _normalize_sort_key = staticmethod(normalize_sort_key)
    _date_match = staticmethod(date_match)

    @classmethod
    def _legacy_line_warehouse(cls, row: dict[str, Any]) -> str:
        value = cls._first(
            row,
            "count_line_warehouse",
            "line_warehouse",
            "source_warehouse",
            "warehouse_correction",
        )
        return str(value or "Unknown")

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
        return escaped_regex_filter(value)

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
        query = self._snapshot_query(
            self.VERIFIED_COLLECTION,
            self._build_verified_query(filters),
        )
        total_records = await collection.count_documents(
            self._snapshot_query(
                self.VERIFIED_COLLECTION,
                {"is_removed": {"$ne": True}},
            )
        )
        sort_order = getattr(config.sort_order, "value", config.sort_order)
        sort_direction = -1 if str(sort_order) == "desc" else 1
        skip = (config.page - 1) * config.page_size

        rows = await self._find_limited(
            collection,
            query,
            sort_field="updated_at",
            sort_direction=sort_direction,
        )
        rows = self._apply_verified_raw_filters(rows, filters)
        data = [self._map_verified_item(row) for row in rows]
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
        rows = await self._find_limited(
            collection,
            self._snapshot_query(
                self.VERIFIED_COLLECTION,
                {"is_removed": {"$ne": True}},
            ),
        )
        today_start = datetime.now(timezone.utc).replace(
            tzinfo=None, hour=0, minute=0, second=0, microsecond=0
        )
        today_count = sum(
            1
            for row in rows
            if (
                self._normalize_datetime(
                    self._first(row, "counted_at", "created_at", "updated_at")
                )
                or datetime.min
            )
            >= today_start
        )
        verified_count = sum(1 for row in rows if bool(row.get("verified")))
        total_count = len(rows)
        by_warehouse: dict[str, int] = {}
        by_status: dict[str, int] = {}
        for row in rows:
            warehouse = self._legacy_line_warehouse(row)
            status = str(row.get("status") or "Unknown")
            by_warehouse[warehouse] = by_warehouse.get(warehouse, 0) + 1
            by_status[status] = by_status.get(status, 0) + 1

        variances = [self._to_float(row.get("variance")) for row in rows]
        total_variance = sum(variances)
        return {
            "success": True,
            "stats": {
                "total_items": total_count,
                "verified_items": verified_count,
                "pending_items": max(total_count - verified_count, 0),
                "today_activity": today_count,
                "total_variance": total_variance,
                "positive_variance": sum(
                    variance for variance in variances if variance > 0
                ),
                "negative_variance": sum(
                    variance for variance in variances if variance < 0
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
                {"status": key, "count": value}
                for key, value in sorted(
                    by_status.items(), key=lambda item: str(item[0]).lower()
                )
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
        rows = await self._find_limited(
            collection,
            self._snapshot_query(
                self.VARIANCE_COLLECTION,
                {"is_removed": {"$ne": True}},
            ),
        )
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
        rows = await self._find_limited(
            collection,
            self._snapshot_query(self.SESSION_COLLECTION, {}),
            sort_field="started_at",
        )
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
        snapshot_query = self._snapshot_query(self.VERIFIED_COLLECTION, {})
        if snapshot_query:
            rows = await self._find_natural_limited(collection, snapshot_query)
            warehouses = sorted(
                {row.get("warehouse") for row in rows if row.get("warehouse")},
                key=self._normalize_sort_key,
            )
            floors = sorted(
                {
                    self._first(row, "floor", "floor_no")
                    for row in rows
                    if self._first(row, "floor", "floor_no")
                },
                key=self._normalize_sort_key,
            )
            categories = sorted(
                {row.get("category") for row in rows if row.get("category")},
                key=self._normalize_sort_key,
            )
            statuses = sorted(
                {row.get("status") for row in rows if row.get("status")},
                key=self._normalize_sort_key,
            )
            users = sorted(
                {row.get("counted_by") for row in rows if row.get("counted_by")},
                key=self._normalize_sort_key,
            )
            return {
                "success": True,
                "options": {
                    "warehouses": warehouses,
                    "floors": floors,
                    "categories": categories,
                    "statuses": statuses,
                    "users": users,
                    "verified": [True, False],
                },
            }
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
            self._snapshot_query(
                self.VERIFIED_COLLECTION,
                {
                    "$or": [
                        {"id": item_id},
                        {"count_line_id": item_id},
                        {"client_record_id": item_id},
                    ]
                },
            )
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
        verified = await self._ensure_collection(self.VERIFIED_COLLECTION)
        variance = await self._ensure_collection(self.VARIANCE_COLLECTION)

        session_rows = await self._find_limited(
            sessions,
            self._snapshot_query(self.SESSION_COLLECTION, {}),
            sort_field="started_at",
        )
        verified_rows = await self._find_natural_limited(
            verified,
            self._snapshot_query(
                self.VERIFIED_COLLECTION,
                {"is_removed": {"$ne": True}},
            ),
        )
        active_statuses = {"OPEN", "ACTIVE", "PAUSED", "RECONCILE"}
        active_sessions = sum(
            1
            for row in session_rows
            if str(row.get("status") or "").upper() in active_statuses
            and not row.get("closed_at")
            and not row.get("finalized_at")
        )
        total_items = await self.db.erp_items.count_documents({})
        verified_item_codes = {
            str(row.get("item_code"))
            for row in verified_rows
            if row.get("item_code")
            and str(row.get("status") or "").lower() == "locked"
        }
        verified_items = len(verified_item_codes)
        total_stock_value_rows = await self.db.erp_items.find(
            {"stock_qty": {"$exists": True}}
        ).to_list(length=_PROJECTION_SCAN_LIMIT)
        total_stock_value = sum(
            self._to_float(row.get("stock_qty")) * self._to_float(row.get("price"))
            for row in total_stock_value_rows
        )
        verified_stock_value = sum(
            self._to_float(row.get("counted_qty"))
            * self._to_float(self._first(row, "mrp_counted", "mrp_erp", "mrp"))
            for row in verified_rows
            if str(row.get("status") or "").lower() == "locked"
        )
        today_start = datetime.now(timezone.utc).replace(
            tzinfo=None, hour=0, minute=0, second=0, microsecond=0
        )

        return {
            "total_stock_value": total_stock_value,
            "verified_stock_value": verified_stock_value,
            "verification_percentage": round(
                (verified_items / total_items * 100) if total_items else 0.0,
                2,
            ),
            "active_sessions": active_sessions,
            "active_users": active_users,
            "pending_variances": await variance.count_documents(
                self._snapshot_query(
                    self.VARIANCE_COLLECTION,
                    {
                        "is_removed": {"$ne": True},
                        "variance": {"$exists": True, "$ne": 0},
                        "$or": [
                            {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}},
                            {"approval_status": "NEEDS_REVIEW"},
                        ],
                    },
                )
            ),
            "items_verified_today": sum(
                1
                for row in verified_rows
                if str(row.get("status") or "").lower() == "locked"
                and (
                    self._normalize_datetime(
                        self._first(row, "finalized_at")
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
        item_query: dict[str, Any] = {}
        if filters.warehouse:
            item_query["warehouse"] = filters.warehouse
        if filters.floor:
            item_query["floor"] = filters.floor
        if filters.category:
            item_query["category"] = filters.category

        items = await self.db.erp_items.find(item_query).to_list(
            length=_PROJECTION_SCAN_LIMIT
        )
        item_codes = [item.get("item_code") for item in items if item.get("item_code")]
        if (filters.warehouse or filters.floor or filters.category) and not item_codes:
            return []

        line_query: dict[str, Any] = {"is_removed": {"$ne": True}}
        if item_codes:
            line_query["item_code"] = {"$in": item_codes}
        rows = await self._find_natural_limited(
            collection,
            self._snapshot_query(self.VERIFIED_COLLECTION, line_query),
        )
        start, end = self.report_date_bounds(filters.date_from, filters.date_to)
        grouped: dict[str, dict[str, Any]] = {}
        for row in rows:
            mapped = self._map_verified_item(row)
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
                    "verification_count": 0,
                    "finalized_count": 0,
                    "finalized_qty": 0.0,
                    "last_verified": None,
                },
            )
            target["verification_count"] += 1
            if str(row.get("status") or "").lower() == "locked":
                target["finalized_count"] += 1
                target["finalized_qty"] += mapped.get("counted_qty", 0.0)
                verified_at = self._first(
                    row, "finalized_at", "verified_at", "counted_at"
                )
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
        results: list[dict[str, Any]] = []
        for item in items:
            item_code = item.get("item_code")
            item_code_key = str(item_code) if item_code is not None else ""
            summary = grouped.get(item_code_key, {})
            price = self._to_float(item.get("price"))
            stock_qty = self._to_float(item.get("stock_qty"))
            verification_count = self._to_int(summary.get("verification_count"))
            finalized_count = self._to_int(summary.get("finalized_count"))
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
                    "verification_count": verification_count,
                    "finalized_count": finalized_count,
                    "finalized_qty": self._to_float(summary.get("finalized_qty")),
                    "last_verified": summary.get("last_verified"),
                    "is_verified": bool(finalized_count or verification_count),
                }
            )
        return sorted(
            results, key=lambda row: str(row.get("item_code") or "")
        )[:10000]

    async def generate_variance_report(self, filters: Any) -> list[dict[str, Any]]:
        collection = await self._ensure_collection(self.VARIANCE_COLLECTION)
        rows = await self._find_natural_limited(
            collection,
            self._snapshot_query(
                self.VARIANCE_COLLECTION,
                {"is_removed": {"$ne": True}},
            ),
        )
        start, end = self.report_date_bounds(filters.date_from, filters.date_to)
        item_query: dict[str, Any] = {}
        if filters.warehouse:
            item_query["warehouse"] = filters.warehouse
        if filters.floor:
            item_query["floor"] = filters.floor
        if filters.category:
            item_query["category"] = filters.category

        item_docs = {
            item.get("item_code"): item
            for item in await self.db.erp_items.find(item_query).to_list(
                length=_PROJECTION_SCAN_LIMIT
            )
            if item.get("item_code")
        }
        if (filters.warehouse or filters.floor or filters.category) and not item_docs:
            return []

        results: list[dict[str, Any]] = []
        for row in rows:
            mapped = self._map_verified_item(row)
            if mapped["variance"] == 0:
                continue
            item_info = item_docs.get(mapped.get("item_code")) or {}
            if filters.warehouse and item_info.get("warehouse") != filters.warehouse:
                continue
            if filters.floor and item_info.get("floor") != filters.floor:
                continue
            if filters.category and item_info.get("category") != filters.category:
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
            expected_qty = self._to_float(
                self._first(row, "erp_qty", "stock_qty", "expected_qty")
            )
            variance = mapped.get("variance", 0.0)
            variance_percentage = (
                100.0 if expected_qty == 0 else (variance / abs(expected_qty)) * 100
            )
            results.append(
                {
                    "item_code": mapped.get("item_code"),
                    "item_name": mapped.get("item_name")
                    or item_info.get("item_name")
                    or "Unknown",
                    "expected_qty": expected_qty,
                    "counted_qty": mapped.get("counted_qty", 0.0),
                    "variance": variance,
                    "variance_percentage": variance_percentage,
                    "status": mapped.get("status"),
                    "approval_status": mapped.get("approval_status"),
                    "counted_by": mapped.get("counted_by"),
                    "warehouse": item_info.get("warehouse"),
                    "location": "/".join(
                        part
                        for part in [
                            self._first(row, "floor_no", "floor"),
                            self._first(row, "rack_no", "rack_id"),
                        ]
                        if isinstance(part, str) and part
                    ),
                    "counted_at": mapped.get("counted_at"),
                    "approved_by": row.get("approved_by"),
                    "approved_at": row.get("approved_at"),
                    "finalized_at": row.get("finalized_at"),
                    "finalized_by": row.get("finalized_by"),
                }
            )
        results.sort(
            key=lambda row: abs(float(row.get("variance_percentage") or 0.0)),
            reverse=True,
        )
        return results[:10000]

    async def generate_session_history(self, filters: Any) -> list[dict[str, Any]]:
        collection = await self._ensure_collection(self.SESSION_COLLECTION)
        rows = await self._find_limited(
            collection,
            self._snapshot_query(self.SESSION_COLLECTION, {}),
            sort_field="started_at",
        )
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
                    "session_id": mapped.get("session_id"),
                    "username": mapped.get("username"),
                    "staff_name": mapped.get("staff_name"),
                    "warehouse": mapped.get("warehouse"),
                    "rack_id": mapped.get("rack_id"),
                    "floor": mapped.get("floor"),
                    "status": mapped.get("status"),
                    "finalization_status": mapped.get("finalization_status"),
                    "started_at": mapped.get("started_at"),
                    "completed_at": mapped.get("completed_at"),
                    "duration_minutes": mapped.get("duration_minutes"),
                    "items_scanned": mapped.get("total_items", 0),
                    "items_verified": mapped.get("verified_items", 0),
                    "total_variance": mapped.get("total_variance", 0.0),
                    "finalized_by": mapped.get("finalized_by"),
                    "finalized_at": mapped.get("finalized_at"),
                }
            )
        return results[:5000]
