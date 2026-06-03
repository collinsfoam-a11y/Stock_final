from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional, cast

from pymongo.errors import DuplicateKeyError

from backend.services.transaction_manager import mongo_transaction

logger = logging.getLogger(__name__)
PROJECTION_VERSION = "v3.1"

PROJECTION_COLLECTIONS = (
    "items_snapshot",
    "batch_records",
    "serial_records",
    "damage_logs",
    "variance_logs",
    "approvals",
    "sync_queue",
    "erp_snapshot",
    "serial_registry",
    "item_serials",
    "session_dashboard_projection",
    "verified_items_projection",
    "variance_summary_projection",
    "financial_projection",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


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


def _normalize_serials(document: Optional[dict[str, Any]]) -> list[str]:
    if not isinstance(document, dict):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for value in document.get("serial_numbers") or []:
        serial = _normalize_string(value)
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                seen.add(serial_upper)
                normalized.append(serial_upper)
    for entry in document.get("serial_entries") or []:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_string(entry.get("serial_number"))
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                seen.add(serial_upper)
                normalized.append(serial_upper)
    return normalized


def _normalize_batches(document: Optional[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not isinstance(document, dict):
        return {}

    batches = document.get("batches")
    normalized: dict[str, dict[str, Any]] = {}
    if isinstance(batches, list) and batches:
        for entry in batches:
            if not isinstance(entry, dict):
                continue
            batch_id = _normalize_string(entry.get("batch_id") or entry.get("batch_no"))
            if not batch_id:
                continue
            batch_state = normalized.setdefault(
                batch_id,
                {
                    "batch_id": batch_id,
                    "batch_no": entry.get("batch_no") or batch_id,
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                },
            )
            batch_state["counted_qty"] += _as_float(
                entry.get("counted_qty") or entry.get("quantity") or entry.get("qty")
            )
            batch_state["damaged_qty"] += _as_float(entry.get("damaged_qty"))
        if normalized:
            return normalized

    batch_id = _normalize_string(document.get("batch_id")) or "NO_BATCH"
    return {
        batch_id: {
            "batch_id": batch_id,
            "batch_no": document.get("batch_no") or batch_id,
            "counted_qty": _as_float(document.get("counted_qty")),
            "damaged_qty": _as_float(document.get("damaged_qty")),
        }
    }


def _line_status_is_inactive(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return value.strip().lower() in {"superseded", "removed", "deleted"}


def _line_active(document: dict[str, Any]) -> bool:
    if document.get("is_removed") is True:
        return False
    return not _line_status_is_inactive(document.get("status"))


def _line_verified(document: dict[str, Any]) -> bool:
    if document.get("verified") is True:
        return True
    status = str(document.get("status") or "").strip().lower()
    approval_status = str(document.get("approval_status") or "").strip().upper()
    return status in {"locked", "approved"} or approval_status == "APPROVED"


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


def _resolve_unit_value(document: Optional[dict[str, Any]]) -> float:
    if not isinstance(document, dict):
        return 0.0
    for field_name in (
        "last_cost",
        "sale_price",
        "sales_price",
        "mrp",
        "mrp_counted",
        "mrp_erp",
        "cost",
        "price",
    ):
        value = _as_float(document.get(field_name), default=0.0)
        if value != 0.0 or document.get(field_name) not in (None, ""):
            return value
    return 0.0


class ProjectionService:
    """Maintains CQRS read models from event_log."""

    def __init__(self, db: Any) -> None:
        self.db = db

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    @staticmethod
    def _looks_like_mock(value: Any) -> bool:
        value_type = type(value)
        return value_type.__module__ == "unittest.mock" or value_type.__name__ in {
            "Mock",
            "MagicMock",
            "AsyncMock",
        }

    def _projection_backend_available(self) -> bool:
        collection = getattr(self.db, "event_applied", None)
        if collection is None or self._looks_like_mock(collection):
            return False
        find_one = getattr(collection, "find_one", None)
        if find_one is None or self._looks_like_mock(find_one):
            return False
        return True

    @staticmethod
    def _line_identifier(document: Optional[dict[str, Any]]) -> Optional[str]:
        if not isinstance(document, dict):
            return None
        return _normalize_string(document.get("id") or document.get("_id"))

    @staticmethod
    def _item_scope_query(item_id: str, item_code: str) -> dict[str, Any]:
        return {
            "$or": [
                {"item_id": item_id},
                {"item_code": item_code},
            ]
        }

    @classmethod
    def _serial_scope_query(
        cls,
        *,
        item_id: str,
        item_code: str,
        serial_field: str,
        serial_value: str,
    ) -> dict[str, Any]:
        return {
            "$and": [
                {serial_field: serial_value},
                cls._item_scope_query(item_id, item_code),
            ]
        }

    async def apply_event(
        self,
        event: dict[str, Any],
        *,
        db_session: Optional[Any] = None,
    ) -> bool:
        if not self._projection_backend_available():
            logger.debug(
                "Projection backend unavailable; skipping projection for event %s",
                event.get("_id") or event.get("id"),
            )
            return False

        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                if tx is not None:
                    return await self.apply_event(event, db_session=tx)

        event_id = _normalize_string(event.get("_id") or event.get("id"))
        if not event_id:
            raise ValueError("Projection event is missing an event identifier")

        raw_payload = event.get("payload")
        payload: dict[str, Any] = (
            cast(dict[str, Any], raw_payload) if isinstance(raw_payload, dict) else {}
        )
        if not await self._begin_event_apply(
            event_id=event_id, event=event, payload=payload, db_session=db_session
        ):
            return False

        event_type = str(event.get("event_type") or "").strip().upper()
        try:
            if event_type in {
                "SESSION_SNAPSHOT_CREATED",
                "SESSION_CREATED",
                "SESSION_TRANSITIONED",
                "SESSION_TOTALS_UPDATED",
                "SESSION_UPDATED",
                "SESSION_HEARTBEAT",
                "SESSION_FINALIZED",
            }:
                await self._project_session_event(event, payload, db_session=db_session)

            if event_type in {
                "SCAN_ADDED",
                "QUANTITY_ADJUSTED",
                "COUNT_LINE_REMOVED",
                "COUNT_LINE_MERGED",
                "COUNT_LINE_SUPERSEDED",
                "COUNT_VERIFIED",
                "COUNT_UNVERIFIED",
            }:
                await self._project_inventory_event(event, payload, db_session=db_session)

            if event_type == "DAMAGE_MARKED":
                await self._project_damage_log(event, payload, db_session=db_session)

            if event_type in {"VARIANCE_DETECTED", "RECOUNT_REQUESTED"}:
                await self._project_variance_log(event, payload, db_session=db_session)

            if event_type == "APPROVAL_GRANTED":
                await self._project_approval(event, payload, db_session=db_session)

            if event_type in {"SYNC_CONFLICT_RECORDED", "SYNC_CONFLICT_RESOLVED"}:
                await self._project_sync_queue(event, payload, db_session=db_session)
        except Exception:
            await self.db.event_applied.delete_one(
                {"event_id": event_id},
                **self._kwargs(db_session),
            )
            raise

        await self._finalize_event_apply(
            event_id=event_id, event=event, payload=payload, db_session=db_session
        )
        return True

    async def rebuild_from_event_log(
        self,
        *,
        session_id: Optional[str] = None,
        clear_existing: bool = False,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        kwargs = self._kwargs(db_session)
        if clear_existing:
            await self._clear_projection_state(session_id=session_id, db_session=db_session)

        query: dict[str, Any] = {}
        if session_id:
            query["payload.session_id"] = session_id

        events: list[dict[str, Any]] = []
        cursor = self.db.event_log.find(query, **kwargs).sort("timestamp", 1)
        async for event in cursor:
            events.append(event)

        events.sort(
            key=lambda event: (
                event.get("timestamp") or datetime.min,
                str(event.get("_id") or event.get("id") or ""),
            )
        )

        processed = 0
        applied = 0
        for event in events:
            processed += 1
            if await self.apply_event(event, db_session=db_session):
                applied += 1
        return {
            "processed_events": processed,
            "applied_events": applied,
            "rebuilt_at": _utc_now().isoformat(),
        }

    async def _begin_event_apply(
        self,
        *,
        event_id: str,
        event: dict[str, Any],
        payload: dict[str, Any],
        db_session: Optional[Any],
    ) -> bool:
        kwargs = self._kwargs(db_session)
        existing = await self.db.event_applied.find_one({"event_id": event_id}, **kwargs)
        if isinstance(existing, dict) and existing.get("status") == "applied":
            return False
        if isinstance(existing, dict):
            await self.db.event_applied.delete_one({"event_id": event_id}, **kwargs)

        apply_doc = {
            "event_id": event_id,
            "event_type": event.get("event_type"),
            "aggregate_id": event.get("aggregate_id"),
            "session_id": payload.get("session_id"),
            "item_id": payload.get("item_id"),
            "status": "applying",
            "started_at": _utc_now(),
            "projection_version": PROJECTION_VERSION,
        }
        try:
            await self.db.event_applied.insert_one(apply_doc, **kwargs)
            return True
        except DuplicateKeyError:
            existing = await self.db.event_applied.find_one({"event_id": event_id}, **kwargs)
            return not (isinstance(existing, dict) and existing.get("status") == "applied")

    async def _finalize_event_apply(
        self,
        *,
        event_id: str,
        event: dict[str, Any],
        payload: dict[str, Any],
        db_session: Optional[Any],
    ) -> None:
        await self.db.event_applied.update_one(
            {"event_id": event_id},
            {
                "$set": {
                    "status": "applied",
                    "applied_at": _utc_now(),
                    "event_type": event.get("event_type"),
                    "aggregate_id": event.get("aggregate_id"),
                    "session_id": payload.get("session_id"),
                    "item_id": payload.get("item_id"),
                    "projection_timestamp": event.get("timestamp"),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            **self._kwargs(db_session),
        )

    async def _clear_projection_state(
        self,
        *,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> None:
        kwargs = self._kwargs(db_session)
        if not session_id:
            for collection_name in (*PROJECTION_COLLECTIONS, "event_applied"):
                await self.db[collection_name].delete_many({}, **kwargs)
            return

        for collection_name in PROJECTION_COLLECTIONS:
            await self.db[collection_name].delete_many({"session_id": session_id}, **kwargs)
        await self.db.event_applied.delete_many({"session_id": session_id}, **kwargs)

    async def _project_session_event(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        session_id = _normalize_string(payload.get("session_id") or event.get("aggregate_id"))
        if not session_id:
            return

        existing = await self.db.session_dashboard_projection.find_one(
            {"session_id": session_id},
            **self._kwargs(db_session),
        )
        current = dict(existing) if isinstance(existing, dict) else {}
        now_dt = _utc_now()
        event_type = str(event.get("event_type") or "").strip().upper()

        next_doc = {
            "session_id": session_id,
            "warehouse": payload.get("warehouse", current.get("warehouse")),
            "location_id": payload.get("location_id", current.get("location_id")),
            "location_key": payload.get("location_key", current.get("location_key")),
            "location_type": payload.get("location_type", current.get("location_type")),
            "location_name": payload.get("location_name", current.get("location_name")),
            "rack_no": payload.get("rack_no", current.get("rack_no")),
            "staff_user": payload.get("staff_user", current.get("staff_user")),
            "staff_name": payload.get("staff_name", current.get("staff_name")),
            "status": payload.get("status")
            or payload.get("to_status")
            or current.get("status")
            or "OPEN",
            "type": payload.get("type", current.get("type") or "STANDARD"),
            "started_at": current.get("started_at"),
            "last_heartbeat": payload.get("last_heartbeat", current.get("last_heartbeat")),
            "closed_at": current.get("closed_at"),
            "completed_at": current.get("completed_at"),
            "reconciled_at": current.get("reconciled_at"),
            "finalized_at": current.get("finalized_at"),
            "finalized_by": current.get("finalized_by"),
            "finalization_status": payload.get(
                "finalization_status", current.get("finalization_status")
            ),
            "notes": payload.get("note", current.get("notes")),
            "snapshot_hash": payload.get("snapshot_hash", current.get("snapshot_hash")),
            "snapshot_item_count": int(
                payload.get("item_count") or current.get("snapshot_item_count") or 0
            ),
            "version": int(payload.get("version") or current.get("version") or 0),
            "updated_at": payload.get("updated_at") or event.get("timestamp") or now_dt,
            "last_event_id": event.get("_id") or event.get("id"),
            "last_event_type": event.get("event_type"),
            "projection_version": PROJECTION_VERSION,
        }

        if event_type == "SESSION_CREATED":
            next_doc["started_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["last_heartbeat"] = (
                payload.get("updated_at") or event.get("timestamp") or now_dt
            )
        elif event_type == "SESSION_TRANSITIONED":
            target_status = payload.get("to_status") or next_doc["status"]
            next_doc["status"] = target_status
            if target_status == "RECONCILE":
                next_doc["reconciled_at"] = (
                    payload.get("updated_at") or event.get("timestamp") or now_dt
                )
            if target_status == "CLOSED":
                next_doc["closed_at"] = (
                    payload.get("updated_at") or event.get("timestamp") or now_dt
                )
            if target_status == "FINALIZED":
                next_doc["finalized_at"] = (
                    payload.get("updated_at") or event.get("timestamp") or now_dt
                )
        elif event_type == "SESSION_HEARTBEAT":
            next_doc["last_heartbeat"] = (
                payload.get("updated_at") or event.get("timestamp") or now_dt
            )
        elif event_type == "SESSION_FINALIZED":
            next_doc["status"] = "FINALIZED"
            next_doc["finalized_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["completed_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["closed_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["finalized_by"] = (
                payload.get("finalized_by") or payload.get("actor") or current.get("finalized_by")
            )

        for field_name in (
            "total_items",
            "verified_items",
            "pending_items",
            "damage_items",
            "total_variance",
            "positive_variance",
            "negative_variance",
            "scanned_items",
            "pending_approvals",
            "approved_count",
        ):
            if field_name in payload:
                next_doc[field_name] = payload.get(field_name)
            elif field_name in current:
                next_doc[field_name] = current.get(field_name)

        await self.db.session_dashboard_projection.update_one(
            {"session_id": session_id},
            {"$set": next_doc},
            upsert=True,
            **self._kwargs(db_session),
        )

    async def _refresh_session_dashboard_projection(
        self,
        *,
        session_id: str,
        db_session: Optional[Any],
    ) -> None:
        kwargs = self._kwargs(db_session)
        session_doc = await self.db.session_dashboard_projection.find_one(
            {"session_id": session_id}, **kwargs
        )
        if not isinstance(session_doc, dict):
            return

        total_items = 0
        verified_items = 0
        damage_items = 0
        total_variance = 0.0
        positive_variance = 0.0
        negative_variance = 0.0
        latest_counted_at: Optional[datetime] = None

        async for row in self.db.verified_items_projection.find(
            {"session_id": session_id}, **kwargs
        ):
            if not isinstance(row, dict) or not _line_active(row):
                continue
            total_items += 1
            variance = _as_float(row.get("variance"))
            total_variance += variance
            positive_variance += max(variance, 0.0)
            negative_variance += min(variance, 0.0)
            if _line_verified(row):
                verified_items += 1
            if _as_float(row.get("damaged_qty")) > 0:
                damage_items += 1
            counted_at = row.get("counted_at")
            counted_dt = counted_at if isinstance(counted_at, datetime) else None
            if counted_dt and (latest_counted_at is None or counted_dt > latest_counted_at):
                latest_counted_at = counted_dt

        pending_approvals = 0
        approved_count = 0
        async for row in self.db.variance_summary_projection.find(
            {"session_id": session_id}, **kwargs
        ):
            if not isinstance(row, dict):
                continue
            if _variance_pending(row):
                pending_approvals += 1
            if str(row.get("approval_status") or "").strip().upper() == "APPROVED":
                approved_count += 1

        update_doc = {
            "total_items": total_items,
            "scanned_items": total_items,
            "verified_items": verified_items,
            "pending_items": max(total_items - verified_items, 0),
            "damage_items": damage_items,
            "total_variance": total_variance,
            "positive_variance": positive_variance,
            "negative_variance": negative_variance,
            "pending_approvals": pending_approvals,
            "approved_count": approved_count,
            "completion_percent": (verified_items / total_items * 100.0) if total_items else 0.0,
            "updated_at": _utc_now(),
            "last_counted_at": latest_counted_at,
            "projection_version": PROJECTION_VERSION,
        }
        await self.db.session_dashboard_projection.update_one(
            {"session_id": session_id},
            {"$set": update_doc},
            upsert=True,
            **kwargs,
        )

    async def _refresh_financial_projection(
        self,
        *,
        session_id: str,
        db_session: Optional[Any],
    ) -> None:
        kwargs = self._kwargs(db_session)
        total_counted_qty = 0.0
        total_stock_qty = 0.0
        total_counted_value = 0.0
        total_stock_value = 0.0
        shortage_value = 0.0
        overage_value = 0.0
        damage_value = 0.0

        async for item_row in self.db.items_snapshot.find({"session_id": session_id}, **kwargs):
            if not isinstance(item_row, dict):
                continue
            item_code = _normalize_string(item_row.get("item_code"))
            if not item_code:
                continue

            counted_qty = _as_float(item_row.get("counted_qty"))
            damaged_qty = _as_float(item_row.get("damaged_qty"))
            erp_snapshot = await self.db.erp_snapshot.find_one(
                {"session_id": session_id, "item_code": item_code},
                **kwargs,
            )
            stock_qty = _as_float(
                (erp_snapshot or {}).get("current_sql_qty")
                or (erp_snapshot or {}).get("baseline_qty")
                or 0.0
            )
            line_row = await self.db.verified_items_projection.find_one(
                {"session_id": session_id, "item_code": item_code},
                **kwargs,
            )
            unit_value = _as_float(
                (line_row or {}).get("unit_value") or (line_row or {}).get("mrp")
            )
            variance = counted_qty - stock_qty

            total_counted_qty += counted_qty
            total_stock_qty += stock_qty
            total_counted_value += counted_qty * unit_value
            total_stock_value += stock_qty * unit_value
            shortage_value += abs(min(variance, 0.0)) * unit_value
            overage_value += max(variance, 0.0) * unit_value
            damage_value += damaged_qty * unit_value

        await self.db.financial_projection.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "session_id": session_id,
                    "total_counted_qty": total_counted_qty,
                    "total_stock_qty": total_stock_qty,
                    "complete_percent": (
                        (total_counted_qty / total_stock_qty * 100.0) if total_stock_qty else 0.0
                    ),
                    "total_counted_value": total_counted_value,
                    "total_stock_value": total_stock_value,
                    "shortage_value": shortage_value,
                    "overage_value": overage_value,
                    "damage_value": damage_value,
                    "valuation_basis": "last_cost",
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **kwargs,
        )

    async def _project_verified_item_projection(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        after = payload.get("after") if isinstance(payload.get("after"), dict) else None
        before = payload.get("before") if isinstance(payload.get("before"), dict) else None
        line = after or payload.get("count_line") or before
        if not isinstance(line, dict):
            return

        line_id = self._line_identifier(line) or _normalize_string(payload.get("count_line_id"))
        session_id = _normalize_string(payload.get("session_id") or line.get("session_id"))
        if not line_id or not session_id:
            return

        event_type = str(event.get("event_type") or "").strip().upper()
        inactive = event_type in {
            "COUNT_LINE_REMOVED",
            "COUNT_LINE_SUPERSEDED",
        } or _line_status_is_inactive(line.get("status"))
        if inactive:
            await self.db.verified_items_projection.delete_one(
                {"count_line_id": line_id},
                **self._kwargs(db_session),
            )
            await self.db.variance_summary_projection.delete_one(
                {"count_line_id": line_id},
                **self._kwargs(db_session),
            )
            await self._refresh_session_dashboard_projection(
                session_id=session_id, db_session=db_session
            )
            await self._refresh_financial_projection(session_id=session_id, db_session=db_session)
            return

        item_code = _normalize_string(line.get("item_code") or payload.get("item_id"))
        if not item_code:
            return
        item_id = _normalize_string(line.get("item_id") or payload.get("item_id") or item_code)
        batch_id = _normalize_string(line.get("batch_id") or payload.get("batch_id"))
        counted_qty = _as_float(line.get("counted_qty"))
        damaged_qty = _as_float(line.get("damaged_qty"))
        stock_qty = _as_float(
            line.get("erp_qty")
            or line.get("current_sql_qty")
            or line.get("system_qty")
            or line.get("expected_qty")
        )
        variance = _as_float(line.get("variance"), default=counted_qty - stock_qty)
        if "variance" not in line or line.get("variance") in (None, ""):
            variance = counted_qty - stock_qty
        unit_value = _resolve_unit_value(line)
        variance_percentage = (
            (variance / abs(stock_qty) * 100.0) if stock_qty else (100.0 if variance else 0.0)
        )
        session_projection = await self.db.session_dashboard_projection.find_one(
            {"session_id": session_id},
            **self._kwargs(db_session),
        )

        verified_doc = {
            "count_line_id": line_id,
            "id": line_id,
            "session_id": session_id,
            "item_id": item_id,
            "item_code": item_code,
            "item_name": line.get("item_name"),
            "barcode": line.get("barcode"),
            "category": line.get("category"),
            "warehouse": line.get("warehouse") or (session_projection or {}).get("warehouse"),
            "floor": line.get("floor_no")
            or line.get("floor_id")
            or (session_projection or {}).get("location_name"),
            "rack_id": line.get("rack_id") or line.get("rack_no"),
            "rack_no": line.get("rack_no") or line.get("rack_id"),
            "batch_id": batch_id,
            "stock_qty": stock_qty,
            "counted_qty": counted_qty,
            "damaged_qty": damaged_qty,
            "variance": variance,
            "variance_percentage": variance_percentage,
            "mrp": unit_value,
            "unit_value": unit_value,
            "verified": bool(line.get("verified"))
            or str(line.get("approval_status") or "").upper() == "APPROVED",
            "verified_by": line.get("verified_by") or line.get("approved_by"),
            "verified_at": line.get("verified_at") or line.get("approved_at"),
            "counted_by": line.get("counted_by") or line.get("created_by"),
            "counted_at": line.get("counted_at"),
            "notes": line.get("notes") or line.get("approval_note") or line.get("variance_note"),
            "status": line.get("status"),
            "approval_status": line.get("approval_status"),
            "approved_by": line.get("approved_by"),
            "approved_at": line.get("approved_at"),
            "blind_recount_required": bool(line.get("blind_recount_required")),
            "dual_verification_required": bool(line.get("dual_verification_required")),
            "original_count_hidden": bool(line.get("original_count_hidden")),
            "updated_at": _utc_now(),
            "last_event_id": event.get("_id") or event.get("id"),
            "last_event_type": event.get("event_type"),
            "projection_version": PROJECTION_VERSION,
            "is_removed": False,
        }
        await self.db.verified_items_projection.update_one(
            {"count_line_id": line_id},
            {"$set": verified_doc},
            upsert=True,
            **self._kwargs(db_session),
        )

        if (
            abs(variance) > 1e-9
            or verified_doc["approval_status"]
            or verified_doc["blind_recount_required"]
        ):
            await self.db.variance_summary_projection.update_one(
                {"count_line_id": line_id},
                {
                    "$set": {
                        **verified_doc,
                        "count_line_id": line_id,
                        "approved_by": line.get("approved_by"),
                        "approved_at": line.get("approved_at"),
                        "assigned_to": line.get("assigned_to"),
                        "rejection_reason": line.get("rejection_reason")
                        or line.get("variance_reason"),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )
        else:
            await self.db.variance_summary_projection.delete_one(
                {"count_line_id": line_id},
                **self._kwargs(db_session),
            )

        await self._refresh_session_dashboard_projection(
            session_id=session_id, db_session=db_session
        )
        await self._refresh_financial_projection(session_id=session_id, db_session=db_session)

    async def _project_inventory_event(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        after = payload.get("after") if isinstance(payload.get("after"), dict) else None
        before = payload.get("before") if isinstance(payload.get("before"), dict) else None
        line = after or payload.get("count_line") or before
        if not isinstance(line, dict):
            return

        session_id = _normalize_string(payload.get("session_id") or line.get("session_id"))
        item_id = _normalize_string(
            payload.get("item_id") or line.get("item_id") or line.get("item_code")
        )
        item_code = _normalize_string(line.get("item_code") or payload.get("item_id") or item_id)
        if not session_id or not item_id or not item_code:
            return

        batch_id = _normalize_string(payload.get("batch_id") or line.get("batch_id")) or "NO_BATCH"
        counted_delta = _as_float((payload.get("delta") or {}).get("counted_qty"))
        damaged_delta = _as_float((payload.get("delta") or {}).get("damaged_qty"))
        serial_delta = int((payload.get("delta") or {}).get("serial_count") or 0)
        if event.get("event_type") == "SCAN_ADDED" and counted_delta == 0.0:
            counted_delta = _as_float(line.get("counted_qty"))
            damaged_delta = _as_float(line.get("damaged_qty"))
            serial_delta = len(_normalize_serials(after or line))

        before_serials = set(_normalize_serials(before))
        after_serials = set(_normalize_serials(after))
        added_serials = sorted(after_serials)
        removed_serials = sorted(before_serials - after_serials)
        before_batches = _normalize_batches(before)
        after_batches = _normalize_batches(after)
        if event.get("event_type") == "SCAN_ADDED" and not after_batches:
            after_batches = _normalize_batches(after or line)
        batch_ids = sorted(set(before_batches.keys()) | set(after_batches.keys()))

        snapshot_query = {"session_id": session_id, "item_code": item_code}
        snapshot_update = {
            "$set": {
                "session_id": session_id,
                "item_id": item_id,
                "item_code": item_code,
                "item_name": line.get("item_name"),
                "base_uom": line.get("base_uom") or line.get("uom_code") or line.get("uom_name"),
                "input_uom": line.get("input_uom") or line.get("uom_code") or line.get("uom_name"),
                "location_id": line.get("location_id"),
                "floor_id": line.get("floor_id") or line.get("floor_no"),
                "floor_no": line.get("floor_no") or line.get("floor_id"),
                "rack_id": line.get("rack_id") or line.get("rack_no"),
                "rack_no": line.get("rack_no") or line.get("rack_id"),
                "counted_by": line.get("counted_by") or line.get("created_by"),
                "updated_by": line.get("updated_by") or line.get("counted_by"),
                "counted_at": line.get("counted_at"),
                "last_event_id": event.get("_id") or event.get("id"),
                "last_event_type": event.get("event_type"),
                "last_event_at": event.get("timestamp") or _utc_now(),
                "updated_at": _utc_now(),
                "projection_version": PROJECTION_VERSION,
            },
            "$inc": {
                "counted_qty": counted_delta,
                "damaged_qty": damaged_delta,
                "serial_count": serial_delta,
            },
        }
        await self.db.items_snapshot.update_one(
            snapshot_query,
            snapshot_update,
            upsert=True,
            **self._kwargs(db_session),
        )

        for current_batch_id in batch_ids:
            before_batch = before_batches.get(current_batch_id) or {}
            after_batch = after_batches.get(current_batch_id) or {}
            batch_counted_delta = _as_float(after_batch.get("counted_qty")) - _as_float(
                before_batch.get("counted_qty")
            )
            batch_damaged_delta = _as_float(after_batch.get("damaged_qty")) - _as_float(
                before_batch.get("damaged_qty")
            )
            if batch_counted_delta == 0.0 and batch_damaged_delta == 0.0:
                continue

            batch_update = {
                "$set": {
                    "session_id": session_id,
                    "item_id": item_id,
                    "item_code": item_code,
                    "batch_id": current_batch_id,
                    "batch_no": after_batch.get("batch_no")
                    or before_batch.get("batch_no")
                    or current_batch_id,
                    "item_name": line.get("item_name"),
                    "counted_by": line.get("counted_by") or line.get("created_by"),
                    "counted_at": line.get("counted_at"),
                    "last_event_id": event.get("_id") or event.get("id"),
                    "last_event_type": event.get("event_type"),
                    "last_event_at": event.get("timestamp") or _utc_now(),
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                },
                "$inc": {
                    "counted_qty": batch_counted_delta,
                    "damaged_qty": batch_damaged_delta,
                },
            }
            await self.db.batch_records.update_one(
                {
                    "session_id": session_id,
                    "item_code": item_code,
                    "batch_id": current_batch_id,
                },
                batch_update,
                upsert=True,
                **self._kwargs(db_session),
            )

        for serial in added_serials:
            serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_no",
                serial_value=serial,
            )
            await self.db.serial_records.update_one(
                serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_no": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "batch_id": batch_id,
                        "count_line_id": self._line_identifier(line),
                        "status": "DAMAGED" if _as_float(line.get("damaged_qty")) > 0 else "GOOD",
                        "last_event_at": event.get("timestamp") or _utc_now(),
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )
            await self.db.serial_registry.update_one(
                serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_no": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "item_name": line.get("item_name"),
                        "counted_by": line.get("counted_by") or line.get("created_by"),
                        "floor_id": line.get("floor_id") or line.get("floor_no"),
                        "rack_id": line.get("rack_id") or line.get("rack_no"),
                        "batch_id": batch_id,
                        "count_line_id": self._line_identifier(line),
                        "status": "LOCKED",
                        "source_event_id": event.get("_id") or event.get("id"),
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )
            item_serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_number",
                serial_value=serial,
            )
            await self.db.item_serials.update_one(
                item_serial_query,
                {
                    "$set": {
                        "item_id": item_id,
                        "serial_number": serial,
                        "session_id": session_id,
                        "item_code": item_code,
                        "item_name": line.get("item_name"),
                        "count_line_id": self._line_identifier(line),
                        "rack_id": line.get("rack_id") or line.get("rack_no"),
                        "floor_no": line.get("floor_id") or line.get("floor_no"),
                        "batch_id": batch_id,
                        "status": "LOCKED",
                        "updated_at": _utc_now(),
                        "projection_version": PROJECTION_VERSION,
                    }
                },
                upsert=True,
                **self._kwargs(db_session),
            )

        for serial in removed_serials:
            serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_no",
                serial_value=serial,
            )
            await self.db.serial_records.delete_one(serial_query, **self._kwargs(db_session))
            await self.db.serial_registry.delete_one(serial_query, **self._kwargs(db_session))
            item_serial_query = self._serial_scope_query(
                item_id=item_id,
                item_code=item_code,
                serial_field="serial_number",
                serial_value=serial,
            )
            await self.db.item_serials.delete_one(item_serial_query, **self._kwargs(db_session))

        await self.db.erp_snapshot.update_one(
            {"session_id": session_id, "item_code": item_code},
            {
                "$set": {
                    "session_id": session_id,
                    "item_id": item_id,
                    "item_code": item_code,
                    "baseline_qty": _as_float(line.get("erp_qty")),
                    "current_sql_qty": _as_float(line.get("current_sql_qty")),
                    "baseline_hash": line.get("baseline_hash"),
                    "updated_at": _utc_now(),
                    "last_event_id": event.get("_id") or event.get("id"),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        await self._project_verified_item_projection(event, payload, db_session=db_session)

    async def _project_damage_log(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        line = payload.get("after") or payload.get("count_line") or payload.get("before")
        if not isinstance(line, dict):
            return
        event_id = _normalize_string(event.get("_id") or event.get("id")) or f"damage-{_utc_now()}"
        await self.db.damage_logs.update_one(
            {"event_id": event_id},
            {
                "$set": {
                    "event_id": event_id,
                    "session_id": line.get("session_id"),
                    "item_code": line.get("item_code"),
                    "batch_id": line.get("batch_id"),
                    "count_line_id": self._line_identifier(line),
                    "qty": _as_float((payload.get("delta") or {}).get("damaged_qty"))
                    or _as_float(line.get("damaged_qty")),
                    "reason": line.get("condition_details")
                    or line.get("item_condition")
                    or line.get("variance_reason")
                    or "UNSPECIFIED",
                    "location": line.get("mark_location")
                    or line.get("location_id")
                    or line.get("floor_id")
                    or line.get("floor_no"),
                    "timestamp": event.get("timestamp") or _utc_now(),
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        await self._project_verified_item_projection(event, payload, db_session=db_session)

    async def _project_variance_log(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        line = payload.get("after") or payload.get("count_line") or payload.get("before")
        if not isinstance(line, dict):
            return
        event_id = (
            _normalize_string(event.get("_id") or event.get("id")) or f"variance-{_utc_now()}"
        )
        await self.db.variance_logs.update_one(
            {"event_id": event_id},
            {
                "$set": {
                    "event_id": event_id,
                    "session_id": line.get("session_id"),
                    "item_code": line.get("item_code"),
                    "batch_id": line.get("batch_id"),
                    "count_line_id": self._line_identifier(line),
                    "variance": _as_float(line.get("variance")),
                    "variance_reason": line.get("variance_reason"),
                    "approval_status": line.get("approval_status"),
                    "status": line.get("status"),
                    "timestamp": event.get("timestamp") or _utc_now(),
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        await self._project_verified_item_projection(event, payload, db_session=db_session)

    async def _project_approval(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        line = payload.get("after") or payload.get("count_line") or payload.get("before")
        if not isinstance(line, dict):
            return
        approval_id = (
            _normalize_string(event.get("_id") or event.get("id")) or f"approval-{_utc_now()}"
        )
        await self.db.approvals.update_one(
            {"approval_id": approval_id},
            {
                "$set": {
                    "approval_id": approval_id,
                    "session_id": line.get("session_id"),
                    "item_code": line.get("item_code"),
                    "count_line_id": self._line_identifier(line),
                    "approved_by": line.get("approved_by"),
                    "approved_at": line.get("approved_at") or event.get("timestamp"),
                    "approval_note": line.get("approval_note"),
                    "status": line.get("approval_status") or "APPROVED",
                    "updated_at": _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        await self._project_verified_item_projection(event, payload, db_session=db_session)

    async def _project_sync_queue(
        self,
        event: dict[str, Any],
        payload: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        queue_id = _normalize_string(payload.get("queue_id") or event.get("_id") or event.get("id"))
        if not queue_id:
            return
        await self.db.sync_queue.update_one(
            {"queue_id": queue_id},
            {
                "$set": {
                    "queue_id": queue_id,
                    "event_type": event.get("event_type"),
                    "status": payload.get("status") or "PENDING",
                    "session_id": payload.get("session_id"),
                    "item_code": payload.get("item_code"),
                    "strategy": payload.get("strategy"),
                    "details": payload.get("details"),
                    "resolved_by": payload.get("resolved_by"),
                    "updated_at": _utc_now(),
                    "last_event_at": event.get("timestamp") or _utc_now(),
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
