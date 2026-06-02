"""Synchronous projection writer for session/count-line write flows."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import inspect
import logging
import os
from typing import Any, Optional

from backend.services.concurrency import coerce_version
from backend.services.lock_service import LockService, ResourceLockedError
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

_PROJECTION_VERSION = "write.sync.v1"
APPROVED_COUNT_LINE_STATUSES = {"approved", "locked"}
BLOCKING_APPROVAL_STATUSES = {"NEEDS_REVIEW", "REJECTED"}
BLOCKING_COUNT_LINE_STATUSES = {"rejected"}
SUPERSEDED_COUNT_LINE_STATUSES = {"superseded"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_float(value: Any) -> float:
    try:
        if value in (None, ""):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _as_datetime(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(text)
        except ValueError:
            return None
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    return None


def _resolve_unit_value(line: dict[str, Any]) -> float:
    for key in ("mrp_counted", "mrp_erp", "last_cost", "sale_price", "sales_price"):
        raw = line.get(key)
        if raw not in (None, ""):
            return _as_float(raw)
    return 0.0


def _compute_variance_percentage(variance: float, stock_qty: float) -> float:
    if stock_qty == 0.0:
        return 0.0
    return round((variance / stock_qty) * 100.0, 4)


def _normalize_count_line_status(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "pending"
    return value.strip().lower()


def _normalize_approval_status(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        return "PENDING"
    return value.strip().upper()


def _requires_supervisor_review_for_variance(variance: Any) -> bool:
    try:
        return abs(float(variance or 0.0)) > 0.0
    except (TypeError, ValueError):
        return False


def _count_line_requires_supervisor_review(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    return _requires_supervisor_review_for_variance(count_line.get("variance"))


def is_count_line_effectively_reviewed(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    line_status = _normalize_count_line_status(count_line.get("status"))
    if bool(count_line.get("verified")) or line_status in APPROVED_COUNT_LINE_STATUSES:
        return True
    if _normalize_approval_status(count_line.get("approval_status")) in BLOCKING_APPROVAL_STATUSES:
        return False
    if count_line.get("assigned_to") and count_line.get("recount_requested_at"):
        return False
    return not _count_line_requires_supervisor_review(count_line) and line_status != "rejected"


def get_effective_count_line_status(count_line: Optional[dict[str, Any]]) -> str:
    if not count_line:
        return "pending"
    line_status = _normalize_count_line_status(count_line.get("status"))
    if line_status in {"rejected", "locked", "approved"}:
        return line_status
    if is_count_line_effectively_reviewed(count_line):
        return "approved"
    return line_status


def get_effective_approval_status(count_line: Optional[dict[str, Any]]) -> str:
    if not count_line:
        return "PENDING"
    approval_status = _normalize_approval_status(count_line.get("approval_status"))
    if approval_status in {"REJECTED", "APPROVED"}:
        return approval_status
    if is_count_line_effectively_reviewed(count_line):
        return "APPROVED"
    return approval_status


def is_superseded_count_line(count_line: Optional[dict[str, Any]]) -> bool:
    if not count_line:
        return False
    if _normalize_count_line_status(count_line.get("status")) in SUPERSEDED_COUNT_LINE_STATUSES:
        return True
    if count_line.get("superseded_by_version_id"):
        return True
    if count_line.get("superseded_at"):
        return True
    return False


class ProjectionWriteService:
    """Maintains projection collections in the same transaction as raw writes."""

    def __init__(self, db: Any) -> None:
        self.db = db
        self.lock_enabled = os.getenv("PROJECTION_WRITE_LOCK_ENABLED", "true").lower() == "true"
        self.lock_wait_timeout_ms = max(
            0,
            int(os.getenv("PROJECTION_WRITE_LOCK_WAIT_TIMEOUT_MS", "5000")),
        )
        self.lock_retry_delay_ms = max(
            10,
            int(os.getenv("PROJECTION_WRITE_LOCK_RETRY_DELAY_MS", "50")),
        )
        self.lock_ttl_seconds = max(
            30,
            int(os.getenv("PROJECTION_WRITE_LOCK_TTL_SECONDS", "90")),
        )
        self.lock_owner_prefix = f"projection-write:{os.getpid()}:{id(self)}"

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    def _collection(self, name: str) -> Any:
        collection = getattr(self.db, name, None)
        if collection is not None:
            return collection
        return self.db[name]

    @staticmethod
    def session_lock_key(session_id: str) -> str:
        return f"projection_session:{session_id}"

    async def _resolve_result(self, value: Any) -> Any:
        resolved = value
        for _ in range(10):
            if not inspect.isawaitable(resolved):
                break
            resolved = await resolved
        return resolved

    async def sync_for_sessions(
        self,
        session_ids: list[str],
        *,
        trigger: str,
        actor: str,
        db_session: Optional[Any] = None,
        rebuild_item_projections: bool = True,
        item_projection_scopes: Optional[set[str]] = None,
        skip_session_lock: bool = False,
    ) -> None:
        if not session_ids:
            return

        unique_session_ids = sorted({str(sid).strip() for sid in session_ids if str(sid).strip()})
        kwargs = self._kwargs(db_session)
        now_dt = _utc_now()

        for session_id in unique_session_ids:
            owner = f"{self.lock_owner_prefix}:{id(asyncio.current_task())}:{session_id}"
            lock_acquired = False
            try:
                if self.lock_enabled and not skip_session_lock:
                    lock_acquired = await self._acquire_session_lock(
                        session_id=session_id,
                        owner=owner,
                    )
                session_doc = await self._resolve_result(
                    self.db.sessions.find_one(
                        {"$or": [{"id": session_id}, {"session_id": session_id}]},
                        **kwargs,
                    )
                )
                if not isinstance(session_doc, dict):
                    continue

                await self._sync_single_session(
                    session_id=session_id,
                    session_doc=session_doc,
                    trigger=trigger,
                    actor=actor,
                    now_dt=now_dt,
                    db_session=db_session,
                    rebuild_item_projections=rebuild_item_projections,
                    item_projection_scopes=item_projection_scopes,
                )
            finally:
                if lock_acquired:
                    await self._release_session_lock(session_id=session_id, owner=owner)

    async def _acquire_session_lock(self, *, session_id: str, owner: str) -> bool:
        if not hasattr(self.db, "locks") and hasattr(self.db, "__getitem__"):
            try:
                setattr(self.db, "locks", self.db["locks"])
            except Exception:
                return False
        lock_service = LockService(self.db)
        started = datetime.now(timezone.utc)
        while True:
            try:
                await lock_service.acquire_lock(
                    self.session_lock_key(session_id),
                    owner,
                    ttl_seconds=self.lock_ttl_seconds,
                )
                return True
            except ResourceLockedError:
                elapsed_ms = int(
                    (datetime.now(timezone.utc) - started).total_seconds() * 1000.0
                )
                if elapsed_ms >= self.lock_wait_timeout_ms:
                    raise
                await asyncio.sleep(self.lock_retry_delay_ms / 1000.0)
            except (AttributeError, TypeError):
                return False

    async def _release_session_lock(self, *, session_id: str, owner: str) -> None:
        try:
            lock_service = LockService(self.db)
            await lock_service.release_lock(self.session_lock_key(session_id), owner)
        except (AttributeError, TypeError):
            return

    async def _sync_single_session(
        self,
        *,
        session_id: str,
        session_doc: dict[str, Any],
        trigger: str,
        actor: str,
        now_dt: datetime,
        db_session: Optional[Any],
        rebuild_item_projections: bool,
        item_projection_scopes: Optional[set[str]],
    ) -> None:
        kwargs = self._kwargs(db_session)
        source_updated_at = self._resolve_source_updated_at(session_doc) or now_dt
        session_version = coerce_version(session_doc.get("version"))

        active_lines = await self._load_active_count_lines(session_id, db_session=db_session)
        aggregates = self._compute_aggregates(active_lines)

        session_projection_doc = {
            "session_id": session_id,
            "warehouse": session_doc.get("warehouse"),
            "floor": session_doc.get("floor") or session_doc.get("floor_no"),
            "floor_no": session_doc.get("floor_no"),
            "location_name": session_doc.get("location_name"),
            "location_type": session_doc.get("location_type"),
            "rack_no": session_doc.get("rack_no"),
            "rack_id": session_doc.get("rack_id"),
            "staff_user": session_doc.get("staff_user"),
            "username": session_doc.get("username") or session_doc.get("staff_user"),
            "staff_name": session_doc.get("staff_name"),
            "user_id": session_doc.get("user_id"),
            "status": session_doc.get("status"),
            "finalization_status": session_doc.get("finalization_status"),
            "started_at": session_doc.get("started_at"),
            "created_at": session_doc.get("created_at") or session_doc.get("started_at"),
            "completed_at": session_doc.get("completed_at"),
            "closed_at": session_doc.get("closed_at"),
            "finalized_at": session_doc.get("finalized_at"),
            "finalized_by": session_doc.get("finalized_by"),
            "reconciled_at": session_doc.get("reconciled_at"),
            "last_heartbeat": session_doc.get("last_heartbeat"),
            "last_activity": aggregates["last_activity"] or session_doc.get("last_activity"),
            "total_items": aggregates["total_items"],
            "verified_items": aggregates["verified_items"],
            "pending_items": aggregates["pending_items"],
            "damage_items": aggregates["damage_items"],
            "total_variance": aggregates["total_variance"],
            "positive_variance": aggregates["positive_variance"],
            "negative_variance": aggregates["negative_variance"],
            "pending_approvals": aggregates["pending_approvals"],
            "completion_percent": aggregates["completion_percent"],
            "snapshot_hash": session_doc.get("snapshot_hash"),
            "snapshot_item_count": session_doc.get("snapshot_item_count"),
            "notes": session_doc.get("notes") or session_doc.get("lifecycle_note"),
            "type": session_doc.get("type"),
            "version": session_version,
            "last_event_id": None,
            "last_event_type": trigger,
            "last_event_ts": now_dt,
            "source_updated_at": source_updated_at,
            "updated_at": now_dt,
            "projection_updated_at": now_dt,
            "projection_version": _PROJECTION_VERSION,
            "archived": False,
            "backfill_source": f"write:{trigger}",
            "backfilled_at": now_dt,
        }

        session_projection = self._collection("session_dashboard_projection")
        await self._resolve_result(
            session_projection.update_one(
                {"session_id": session_id},
                {"$set": session_projection_doc},
                upsert=True,
                **kwargs,
            )
        )

        if rebuild_item_projections:
            await self._rebuild_item_projections(
                session_id=session_id,
                session_doc=session_doc,
                active_lines=active_lines,
                now_dt=now_dt,
                db_session=db_session,
                item_projection_scopes=item_projection_scopes,
            )

        event_log = self._collection("event_log")
        await self._resolve_result(
            event_log.insert_one(
                {
                    "session_id": session_id,
                    "event_type": trigger,
                    "actor": actor,
                    "session_version": session_version,
                    "source_updated_at": source_updated_at,
                    "projection_updated_at": now_dt,
                    "projection_version": _PROJECTION_VERSION,
                    "created_at": now_dt,
                },
                **kwargs,
            )
        )

        visibility_ms = int(max((now_dt - source_updated_at).total_seconds() * 1000.0, 0.0))
        logger.info(
            "projection_write_sync session_id=%s trigger=%s rebuild_items=%s "
            "line_count=%s session_version=%s write_to_projection_visibility_ms=%s",
            sanitize_for_logging(session_id),
            sanitize_for_logging(trigger),
            rebuild_item_projections,
            len(active_lines),
            session_version,
            visibility_ms,
        )

    async def _load_active_count_lines(
        self,
        session_id: str,
        *,
        db_session: Optional[Any],
    ) -> list[dict[str, Any]]:
        kwargs = self._kwargs(db_session)
        find_result = self.db.count_lines.find(
            {"session_id": session_id, "archived": {"$ne": True}},
            **kwargs,
        )
        # find() is sync in Motor/InMemoryDB but may be async in test mocks; resolve if needed
        cursor = await find_result if inspect.isawaitable(find_result) else find_result
        lines: list[dict[str, Any]] = []
        if hasattr(cursor, "__aiter__"):
            try:
                async for line in cursor:
                    if not isinstance(line, dict):
                        continue
                    if is_superseded_count_line(line):
                        continue
                    lines.append(line)
                return lines
            except TypeError:
                lines = []
        if hasattr(cursor, "to_list"):
            try:
                raw_lines = await self._resolve_result(cursor.to_list(length=10000))
            except Exception:
                raw_lines = []
            for line in raw_lines or []:
                if not isinstance(line, dict):
                    continue
                if is_superseded_count_line(line):
                    continue
                lines.append(line)
        return lines

    def _compute_aggregates(self, lines: list[dict[str, Any]]) -> dict[str, Any]:
        total_items = 0
        verified_items = 0
        pending_approvals = 0
        damage_items = 0
        total_variance = 0.0
        positive_variance = 0.0
        negative_variance = 0.0
        last_activity: Optional[datetime] = None

        for line in lines:
            total_items += 1
            reviewed = is_count_line_effectively_reviewed(line)
            if reviewed:
                verified_items += 1

            approval_status = get_effective_approval_status(line)
            if approval_status != "APPROVED":
                pending_approvals += 1

            variance = _as_float(line.get("variance"))
            total_variance += variance
            if variance > 0:
                positive_variance += variance
            if variance < 0:
                negative_variance += variance

            damage_items += int(_as_float(line.get("damaged_qty")))
            for field in ("updated_at", "approved_at", "counted_at"):
                candidate = _as_datetime(line.get(field))
                if candidate and (last_activity is None or candidate > last_activity):
                    last_activity = candidate

        pending_items = max(total_items - verified_items, 0)
        completion_percent = round((verified_items / total_items) * 100.0, 2) if total_items else 0.0
        return {
            "total_items": total_items,
            "verified_items": verified_items,
            "pending_items": pending_items,
            "pending_approvals": pending_approvals,
            "damage_items": damage_items,
            "total_variance": round(total_variance, 4),
            "positive_variance": round(positive_variance, 4),
            "negative_variance": round(negative_variance, 4),
            "completion_percent": completion_percent,
            "last_activity": last_activity,
        }

    async def _rebuild_item_projections(
        self,
        *,
        session_id: str,
        session_doc: dict[str, Any],
        active_lines: list[dict[str, Any]],
        now_dt: datetime,
        db_session: Optional[Any],
        item_projection_scopes: Optional[set[str]],
    ) -> None:
        kwargs = self._kwargs(db_session)
        verified_projection = self._collection("verified_items_projection")
        variance_projection = self._collection("variance_summary_projection")
        financial_projection = self._collection("financial_projection")

        scopes = item_projection_scopes or {"verified", "variance", "financial"}
        if "verified" in scopes:
            await self._resolve_result(
                verified_projection.delete_many(
                    {"session_id": session_id, "archived": {"$ne": True}},
                    **kwargs,
                )
            )
        if "variance" in scopes:
            await self._resolve_result(
                variance_projection.delete_many(
                    {"session_id": session_id, "archived": {"$ne": True}},
                    **kwargs,
                )
            )
        if "financial" in scopes:
            await self._resolve_result(
                financial_projection.delete_many(
                    {"session_id": session_id, "archived": {"$ne": True}},
                    **kwargs,
                )
            )

        verified_docs: list[dict[str, Any]] = []
        variance_docs: list[dict[str, Any]] = []
        financial = {
            "total_stock_qty": 0.0,
            "total_counted_qty": 0.0,
            "total_stock_value": 0.0,
            "total_counted_value": 0.0,
            "overage_value": 0.0,
            "shortage_value": 0.0,
            "damage_value": 0.0,
        }
        reviewed_count = 0

        for line in active_lines:
            stock_qty = _as_float(line.get("erp_qty"))
            counted_qty = _as_float(line.get("counted_qty"))
            variance = _as_float(line.get("variance"))
            damaged_qty = _as_float(line.get("damaged_qty"))
            unit_value = _resolve_unit_value(line)

            reviewed = is_count_line_effectively_reviewed(line)
            if reviewed:
                reviewed_count += 1

            status = get_effective_count_line_status(line)
            approval_status = get_effective_approval_status(line)
            variance_pct = _compute_variance_percentage(variance, stock_qty)
            financial_impact = _as_float(line.get("financial_impact"))
            if financial_impact == 0.0 and unit_value != 0.0:
                financial_impact = (counted_qty - stock_qty) * unit_value

            base_doc = {
                "count_line_id": line.get("id") or str(line.get("_id") or ""),
                "approval_status": approval_status,
                "approved_at": line.get("approved_at"),
                "approved_by": line.get("approved_by"),
                "barcode": line.get("barcode"),
                "batch_id": line.get("batch_id"),
                "blind_recount_required": bool(line.get("blind_recount_required", False)),
                "category": line.get("category"),
                "counted_at": line.get("counted_at"),
                "counted_by": line.get("counted_by"),
                "counted_qty": counted_qty,
                "damaged_qty": damaged_qty,
                "dual_verification_required": bool(line.get("dual_verification_required", False)),
                "floor": line.get("floor_no") or line.get("floor"),
                "financial_impact": financial_impact,
                "id": line.get("id") or str(line.get("_id") or ""),
                "is_removed": bool(line.get("is_removed", False)),
                "item_code": line.get("item_code"),
                "item_id": line.get("item_id") or line.get("item_code"),
                "item_name": line.get("item_name"),
                "last_event_id": None,
                "last_event_type": "write_sync",
                "last_event_ts": now_dt,
                "mrp": line.get("mrp_counted")
                if line.get("mrp_counted") not in (None, "")
                else line.get("mrp_erp"),
                "mrp_erp": line.get("mrp_erp"),
                "notes": line.get("notes") or line.get("remark") or line.get("variance_note"),
                "original_count_hidden": bool(line.get("original_count_hidden", False)),
                "projection_version": _PROJECTION_VERSION,
                "rack_id": line.get("rack_id") or line.get("rack_no"),
                "rack_no": line.get("rack_no") or line.get("rack_id"),
                "session_id": session_id,
                "status": status,
                "stock_qty": stock_qty,
                "unit_value": unit_value,
                "updated_at": now_dt,
                "projection_updated_at": now_dt,
                "variance": variance,
                "variance_percentage": variance_pct,
                "verified": reviewed,
                "verified_at": line.get("verified_at"),
                "verified_by": line.get("verified_by"),
                "warehouse": session_doc.get("warehouse"),
                "archived": False,
            }
            verified_docs.append(base_doc)

            variance_doc = dict(base_doc)
            variance_doc["assigned_to"] = line.get("assigned_to")
            variance_doc["rejection_reason"] = line.get("rejection_reason")
            variance_docs.append(variance_doc)

            financial["total_stock_qty"] += stock_qty
            financial["total_counted_qty"] += counted_qty
            financial["total_stock_value"] += stock_qty * unit_value
            financial["total_counted_value"] += counted_qty * unit_value
            delta_value = (counted_qty - stock_qty) * unit_value
            if delta_value >= 0:
                financial["overage_value"] += delta_value
            else:
                financial["shortage_value"] += abs(delta_value)
            financial["damage_value"] += damaged_qty * unit_value

        if verified_docs and "verified" in scopes:
            await self._resolve_result(verified_projection.insert_many(verified_docs, **kwargs))
        if variance_docs and "variance" in scopes:
            await self._resolve_result(variance_projection.insert_many(variance_docs, **kwargs))

        complete_percent = round((reviewed_count / len(active_lines)) * 100.0, 2) if active_lines else 0.0
        financial_doc = {
            "session_id": session_id,
            "complete_percent": complete_percent,
            "damage_value": round(financial["damage_value"], 4),
            "overage_value": round(financial["overage_value"], 4),
            "projection_version": _PROJECTION_VERSION,
            "shortage_value": round(financial["shortage_value"], 4),
            "last_event_ts": now_dt,
            "total_counted_qty": round(financial["total_counted_qty"], 4),
            "total_counted_value": round(financial["total_counted_value"], 4),
            "total_stock_qty": round(financial["total_stock_qty"], 4),
            "total_stock_value": round(financial["total_stock_value"], 4),
            "updated_at": now_dt,
            "projection_updated_at": now_dt,
            "valuation_basis": "last_cost",
            "archived": False,
        }
        if "financial" in scopes:
            await self._resolve_result(financial_projection.insert_one(financial_doc, **kwargs))

    @staticmethod
    def _resolve_source_updated_at(session_doc: dict[str, Any]) -> Optional[datetime]:
        for key in ("updated_at", "completed_at", "closed_at", "last_activity", "started_at"):
            parsed = _as_datetime(session_doc.get(key))
            if parsed is not None:
                return parsed
        return None
