from __future__ import annotations

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

from pymongo.errors import DuplicateKeyError

from backend.services.replay_invariant_engine import ReplayInvariantEngine
from backend.services.transaction_manager import mongo_transaction

logger = logging.getLogger(__name__)
PROJECTION_VERSION = "v3.1"
DEFAULT_REBUILD_LEASE_SECONDS = 900
DEFAULT_REPLAY_CHECKPOINT_INTERVAL = 500

PROJECTION_COLLECTIONS = (
    "items_snapshot",
    "batch_records",
    "serial_records",
    "damage_logs",
    "variance_logs",
    "approvals",
    "sync_queue",
    "erp_snapshot",
    "erp_snapshot_history",
    "serial_registry",
    "item_serials",
    "session_dashboard_projection",
    "verified_items_projection",
    "variance_summary_projection",
    "financial_projection",
)

_COMMON_PROJECTION_HASH_VOLATILE_FIELDS = {
    "_id",
    "updated_at",
    "projection_updated_at",
    "backfilled_at",
}

_COLLECTION_PROJECTION_HASH_VOLATILE_FIELDS = {
    "event_applied": {"started_at", "applied_at"},
}


class _ProjectionShadowDatabase:
    """Redirect projection collection access to rebuild-scoped shadow collections."""

    def __init__(self, base_db: Any, collection_map: dict[str, str]) -> None:
        object.__setattr__(self, "_base_db", base_db)
        object.__setattr__(self, "_collection_map", collection_map)
        object.__setattr__(self, "client", getattr(base_db, "client", None))

    def __getitem__(self, name: str) -> Any:
        target_name = self._collection_map.get(name, name)
        return self._base_db[target_name]

    def __getattr__(self, name: str) -> Any:
        if name in self._collection_map:
            return self._base_db[self._collection_map[name]]
        return getattr(self._base_db, name)


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


def _as_sequence(value: Any) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def _is_projection_operation_marker(event: dict[str, Any]) -> bool:
    metadata = event.get("metadata") if isinstance(event.get("metadata"), dict) else {}
    return bool(metadata.get("non_domain_projection_marker")) or str(
        event.get("schema_version") or ""
    ) == "projection-marker.v1"


def _event_replay_sort_key(event: dict[str, Any]) -> tuple[int, Any, Any, Any, str]:
    global_sequence = _as_sequence(event.get("global_sequence"))
    aggregate_sequence = _as_sequence(event.get("aggregate_sequence"))
    if global_sequence is not None:
        return (0, global_sequence, aggregate_sequence or 0, datetime.min, "")
    return (
        1,
        event.get("timestamp") or event.get("recorded_at") or event.get("created_at") or datetime.min,
        aggregate_sequence or 0,
        event.get("recorded_at") or datetime.min,
        str(event.get("_id") or event.get("id") or event.get("event_id") or ""),
    )


def _stable_hash(value: Any) -> str:
    serialized = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _canonical_projection_document(collection_name: str, document: dict[str, Any]) -> dict[str, Any]:
    volatile_fields = _COMMON_PROJECTION_HASH_VOLATILE_FIELDS | (
        _COLLECTION_PROJECTION_HASH_VOLATILE_FIELDS.get(collection_name, set())
    )

    def normalize(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: normalize(value[key])
                for key in sorted(value)
                if key not in volatile_fields
            }
        if isinstance(value, list):
            return [normalize(item) for item in value]
        return value

    return cast(dict[str, Any], normalize(document))


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

        event_id = _normalize_string(event.get("_id") or event.get("event_id") or event.get("id"))
        if not event_id:
            raise ValueError("Projection event is missing an event identifier")

        raw_payload = event.get("payload")
        payload = cast(dict[str, Any], raw_payload if isinstance(raw_payload, dict) else {})
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
        resume_token: Optional[str] = None,
        checkpoint_interval: int = DEFAULT_REPLAY_CHECKPOINT_INTERVAL,
        rebuild_owner: Optional[str] = None,
    ) -> dict[str, Any]:
        rebuild_id = _normalize_string(resume_token) or str(uuid.uuid4())
        run_id = str(uuid.uuid4())
        checkpoint_interval = max(int(checkpoint_interval or DEFAULT_REPLAY_CHECKPOINT_INTERVAL), 1)
        lease: Optional[dict[str, Any]] = None
        kwargs = self._kwargs(db_session)
        query: dict[str, Any] = {}
        if session_id:
            query["$or"] = [{"payload.session_id": session_id}, {"session_id": session_id}]

        lease = await self._acquire_rebuild_lease(
            session_id=session_id,
            owner=_normalize_string(rebuild_owner) or f"projection-rebuild:{run_id}",
            db_session=db_session,
        )

        await self._record_projection_operation(
            operation_id=run_id,
            operation_type="replay_rebuild_resumed" if resume_token else "replay_rebuild_started",
            session_id=session_id,
            status="started",
            metadata={
                "rebuild_id": rebuild_id,
                "resume_token": rebuild_id,
                "clear_existing": clear_existing,
                "query": query,
                "checkpoint_interval": checkpoint_interval,
                "lease": self._lease_metadata(lease),
            },
            db_session=db_session,
        )

        events: list[dict[str, Any]] = []
        try:
            cursor = self.db.event_log.find(query, **kwargs)
            async for event in cursor:
                events.append(event)

            projection_markers = [
                str(event.get("_id") or event.get("event_id") or event.get("id") or "<unknown>")
                for event in events
                if _is_projection_operation_marker(event)
            ]
            if projection_markers:
                raise ValueError(
                    "Projection rebuild aborted: event_log contains non-domain projection "
                    f"operation marker(s): {projection_markers[:5]}"
                )

            if os.getenv("EVENT_REPLAY_REQUIRE_GLOBAL_SEQUENCE", "").lower() == "true":
                missing_sequences = [
                    str(event.get("_id") or event.get("event_id") or event.get("id") or "<unknown>")
                    for event in events
                    if _as_sequence(event.get("global_sequence")) is None
                ]
                if missing_sequences:
                    raise ValueError(
                        "Projection rebuild aborted: event_log contains unsequenced event(s): "
                        f"{missing_sequences[:5]}"
                    )

            missing_event_ids = [
                str(event.get("event_type") or "<unknown>")
                for event in events
                if not _normalize_string(event.get("_id") or event.get("event_id") or event.get("id"))
            ]
            if missing_event_ids:
                raise ValueError(
                    "Projection rebuild aborted before clearing state: "
                    f"{len(missing_event_ids)} event_log record(s) are missing event identifiers"
                )

            events.sort(key=_event_replay_sort_key)

            if clear_existing:
                result = await self._rebuild_via_shadow_projection(
                    rebuild_id=rebuild_id,
                    events=events,
                    session_id=session_id,
                    db_session=db_session,
                    checkpoint_interval=checkpoint_interval,
                    resume_requested=resume_token is not None,
                    lease=lease,
                )
            else:
                processed = 0
                applied = 0
                for event in events:
                    processed += 1
                    if processed % checkpoint_interval == 0:
                        lease = await self._renew_rebuild_lease(lease, db_session=db_session)
                    if await self.apply_event(event, db_session=db_session):
                        applied += 1
                projection_hash = await self._projection_state_hash(
                    session_id=session_id,
                    db_session=db_session,
                )
                semantic_validation = await self._semantic_replay_validation(
                    events,
                    session_id=session_id,
                    db_session=db_session,
                )
                result = self._build_replay_result(
                    rebuild_id=rebuild_id,
                    events=events,
                    processed=processed,
                    applied=applied,
                    projection_hash=projection_hash,
                    semantic_validation=semantic_validation,
                    shadow_rebuild=False,
                    swap_atomic=False,
                    swap_validated=False,
                    resume_token=rebuild_id,
                    resumed=False,
                    checkpoint_processed_events=processed,
                )
            await self._record_projection_operation(
                operation_id=run_id,
                operation_type="replay_rebuild_completed",
                session_id=session_id,
                status="completed",
                metadata=result,
                db_session=db_session,
            )
            return result
        except Exception as exc:
            await self._record_projection_operation(
                operation_id=run_id,
                operation_type="replay_rebuild_failed",
                session_id=session_id,
                status="failed",
                metadata={
                    "rebuild_id": rebuild_id,
                    "resume_token": rebuild_id,
                    "error": str(exc),
                    "lease": self._lease_metadata(lease),
                },
                db_session=db_session,
            )
            raise
        finally:
            if lease is not None:
                await self._release_rebuild_lease(lease, db_session=db_session)

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

    async def _record_projection_operation(
        self,
        *,
        operation_id: str,
        operation_type: str,
        session_id: Optional[str],
        status: str,
        metadata: dict[str, Any],
        db_session: Optional[Any],
    ) -> None:
        collection = getattr(self.db, "projection_operations_log", None)
        if collection is None and hasattr(self.db, "__getitem__"):
            collection = self.db["projection_operations_log"]
        if collection is None:
            logger.warning("Projection operation log unavailable")
            return
        now_dt = _utc_now()
        await collection.insert_one(
            {
                "_id": f"{operation_id}:{operation_type}",
                "operation_id": operation_id,
                "operation_type": operation_type,
                "session_id": session_id,
                "status": status,
                "projection_version": PROJECTION_VERSION,
                "metadata": metadata,
                "created_at": now_dt,
            },
            **self._kwargs(db_session),
        )

    @staticmethod
    def _event_window_hash(events: list[dict[str, Any]]) -> str:
        return _stable_hash(
            [
                {
                    "event_id": event.get("_id") or event.get("event_id") or event.get("id"),
                    "global_sequence": event.get("global_sequence"),
                    "aggregate_id": event.get("aggregate_id"),
                    "aggregate_sequence": event.get("aggregate_sequence"),
                    "event_type": event.get("event_type"),
                }
                for event in events
            ]
        )

    @staticmethod
    def _last_global_sequence(events: list[dict[str, Any]]) -> Optional[int]:
        sequences = [_as_sequence(event.get("global_sequence")) for event in events]
        normalized = [sequence for sequence in sequences if sequence is not None]
        return max(normalized) if normalized else None

    def _build_replay_result(
        self,
        *,
        rebuild_id: str,
        events: list[dict[str, Any]],
        processed: int,
        applied: int,
        projection_hash: str,
        semantic_validation: dict[str, Any],
        shadow_rebuild: bool,
        swap_atomic: bool,
        swap_validated: bool,
        resume_token: str,
        resumed: bool,
        checkpoint_processed_events: int,
    ) -> dict[str, Any]:
        event_window_hash = self._event_window_hash(events)
        replay_hash = _stable_hash(
            {
                "projection_version": PROJECTION_VERSION,
                "processed_events": processed,
                "applied_events": applied,
                "event_window_hash": event_window_hash,
                "projection_hash": projection_hash,
                "semantic_validation_hash": _stable_hash(semantic_validation),
                "shadow_rebuild": shadow_rebuild,
                "swap_validated": swap_validated,
                "resume_token": resume_token,
                "resumed": resumed,
                "checkpoint_processed_events": checkpoint_processed_events,
            }
        )
        return {
            "rebuild_id": rebuild_id,
            "processed_events": processed,
            "applied_events": applied,
            "event_window_hash": event_window_hash,
            "projection_hash": projection_hash,
            "semantic_validation": semantic_validation,
            "semantic_validation_hash": _stable_hash(semantic_validation),
            "replay_hash": replay_hash,
            "last_global_sequence": self._last_global_sequence(events),
            "shadow_rebuild": shadow_rebuild,
            "swap_atomic": swap_atomic,
            "swap_validated": swap_validated,
            "resume_token": resume_token,
            "resumed": resumed,
            "checkpoint_processed_events": checkpoint_processed_events,
            "rebuilt_at": _utc_now().isoformat(),
        }

    async def _rebuild_via_shadow_projection(
        self,
        *,
        rebuild_id: str,
        events: list[dict[str, Any]],
        session_id: Optional[str],
        db_session: Optional[Any],
        checkpoint_interval: int,
        resume_requested: bool,
        lease: dict[str, Any],
    ) -> dict[str, Any]:
        shadow_map = self._shadow_collection_map(rebuild_id)
        shadow_db = _ProjectionShadowDatabase(self.db, shadow_map)
        shadow_service = ProjectionService(shadow_db)
        event_window_hash = self._event_window_hash(events)
        checkpoint = await self._load_replay_checkpoint(
            rebuild_id=rebuild_id,
            session_id=session_id,
            db_session=db_session,
        )
        resumed = False
        start_index = 0
        applied = 0

        if resume_requested:
            if not isinstance(checkpoint, dict):
                raise ValueError(f"Replay resume token '{rebuild_id}' has no checkpoint")
            if checkpoint.get("status") not in {"running", "interrupted"}:
                raise ValueError(
                    f"Replay resume token '{rebuild_id}' is not resumable "
                    f"(status={checkpoint.get('status')})"
                )
            if checkpoint.get("event_window_hash") != event_window_hash:
                raise ValueError(
                    f"Replay resume token '{rebuild_id}' does not match current event window"
                )
            start_index = int(checkpoint.get("processed_events") or 0)
            applied = int(checkpoint.get("applied_events") or 0)
            await self._assert_shadow_checkpoint_available(
                shadow_map=shadow_map,
                checkpoint=checkpoint,
                db_session=db_session,
            )
            resumed = True
        else:
            await self._clear_shadow_projection_state(
                shadow_map=shadow_map,
                db_session=db_session,
            )
            await self._record_replay_checkpoint(
                rebuild_id=rebuild_id,
                session_id=session_id,
                status="running",
                shadow_map=shadow_map,
                event_window_hash=event_window_hash,
                processed_events=0,
                applied_events=0,
                total_events=len(events),
                last_event=None,
                projection_hash=None,
                lease=lease,
                db_session=db_session,
            )
        processed = start_index
        last_processed_event = events[start_index - 1] if start_index > 0 and events else None
        try:
            for event in events[start_index:]:
                processed += 1
                last_processed_event = event
                if processed % checkpoint_interval == 0:
                    lease = await self._renew_rebuild_lease(lease, db_session=db_session)
                if await shadow_service.apply_event(event, db_session=db_session):
                    applied += 1
                if processed % checkpoint_interval == 0:
                    await self._record_replay_checkpoint(
                        rebuild_id=rebuild_id,
                        session_id=session_id,
                        status="running",
                        shadow_map=shadow_map,
                        event_window_hash=event_window_hash,
                        processed_events=processed,
                        applied_events=applied,
                        total_events=len(events),
                        last_event=event,
                        projection_hash=None,
                        lease=lease,
                        db_session=db_session,
                    )

            shadow_projection_hash = await shadow_service._projection_state_hash(
                session_id=session_id,
                db_session=db_session,
            )
            shadow_semantic_validation = await shadow_service._semantic_replay_validation(
                events,
                session_id=session_id,
                db_session=db_session,
            )
            lease = await self._renew_rebuild_lease(lease, db_session=db_session)
            swap_result = await self._swap_shadow_projection_state(
                shadow_map=shadow_map,
                session_id=session_id,
                expected_projection_hash=shadow_projection_hash,
                db_session=db_session,
                lease=lease,
            )
            live_semantic_validation = await self._semantic_replay_validation(
                events,
                session_id=session_id,
                db_session=db_session,
            )
            if _stable_hash(live_semantic_validation) != _stable_hash(shadow_semantic_validation):
                raise ValueError(
                    "Projection semantic validation failed: live validation does not match "
                    "shadow validation after swap"
                )
            await self._record_replay_checkpoint(
                rebuild_id=rebuild_id,
                session_id=session_id,
                status="completed",
                shadow_map=shadow_map,
                event_window_hash=event_window_hash,
                processed_events=processed,
                applied_events=applied,
                total_events=len(events),
                last_event=events[-1] if events else None,
                projection_hash=shadow_projection_hash,
                lease=lease,
                db_session=db_session,
            )
            return self._build_replay_result(
                rebuild_id=rebuild_id,
                events=events,
                processed=processed,
                applied=applied,
                projection_hash=shadow_projection_hash,
                semantic_validation=live_semantic_validation,
                shadow_rebuild=True,
                swap_atomic=bool(swap_result.get("swap_atomic")),
                swap_validated=True,
                resume_token=rebuild_id,
                resumed=resumed,
                checkpoint_processed_events=processed,
            )
        except Exception:
            await self._record_replay_checkpoint(
                rebuild_id=rebuild_id,
                session_id=session_id,
                status="failed",
                shadow_map=shadow_map,
                event_window_hash=event_window_hash,
                processed_events=processed,
                applied_events=applied,
                total_events=len(events),
                last_event=last_processed_event,
                projection_hash=None,
                lease=lease,
                db_session=db_session,
            )
            raise
        finally:
            await self._cleanup_shadow_projection_state(
                shadow_map=shadow_map,
                db_session=db_session,
            )

    @staticmethod
    def _shadow_collection_map(rebuild_id: str) -> dict[str, str]:
        safe_id = "".join(ch for ch in rebuild_id if ch.isalnum())[:32] or uuid.uuid4().hex
        return {
            collection_name: f"projection_shadow_{safe_id}__{collection_name}"
            for collection_name in (*PROJECTION_COLLECTIONS, "event_applied")
        }

    async def _clear_shadow_projection_state(
        self,
        *,
        shadow_map: dict[str, str],
        db_session: Optional[Any],
    ) -> None:
        for shadow_collection_name in shadow_map.values():
            await self.db[shadow_collection_name].delete_many({}, **self._kwargs(db_session))

    async def _cleanup_shadow_projection_state(
        self,
        *,
        shadow_map: dict[str, str],
        db_session: Optional[Any],
    ) -> None:
        try:
            await self._clear_shadow_projection_state(
                shadow_map=shadow_map,
                db_session=db_session,
            )
        except Exception as exc:  # pragma: no cover - cleanup must not mask rebuild result
            logger.warning("Shadow projection cleanup failed: %s", exc)

    async def _copy_shadow_collection_to_live(
        self,
        *,
        collection_name: str,
        shadow_collection_name: str,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> int:
        query = {"session_id": session_id} if session_id else {}
        shadow_docs: list[dict[str, Any]] = []
        async for document in self.db[shadow_collection_name].find(
            query,
            **self._kwargs(db_session),
        ):
            copied = dict(document)
            if collection_name != "erp_snapshot_history":
                copied.pop("_id", None)
            shadow_docs.append(copied)

        if shadow_docs:
            await self.db[collection_name].insert_many(
                shadow_docs,
                **self._kwargs(db_session),
            )
        return len(shadow_docs)

    async def _snapshot_live_projection_state(
        self,
        *,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> dict[str, list[dict[str, Any]]]:
        query = {"session_id": session_id} if session_id else {}
        snapshot: dict[str, list[dict[str, Any]]] = {}
        for collection_name in (*PROJECTION_COLLECTIONS, "event_applied"):
            snapshot[collection_name] = [
                dict(document)
                async for document in self.db[collection_name].find(
                    query,
                    **self._kwargs(db_session),
                )
            ]
        return snapshot

    async def _restore_live_projection_state(
        self,
        *,
        snapshot: dict[str, list[dict[str, Any]]],
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> None:
        await self._clear_projection_state(session_id=session_id, db_session=db_session)
        for collection_name, documents in snapshot.items():
            if documents:
                await self.db[collection_name].insert_many(
                    documents,
                    **self._kwargs(db_session),
                )

    @staticmethod
    def _checkpoint_id(*, rebuild_id: str, session_id: Optional[str]) -> str:
        return f"{rebuild_id}:{session_id or 'global'}"

    async def _load_replay_checkpoint(
        self,
        *,
        rebuild_id: str,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> Optional[dict[str, Any]]:
        return await self.db["projection_replay_checkpoints"].find_one(
            {"_id": self._checkpoint_id(rebuild_id=rebuild_id, session_id=session_id)},
            **self._kwargs(db_session),
        )

    async def _record_replay_checkpoint(
        self,
        *,
        rebuild_id: str,
        session_id: Optional[str],
        status: str,
        shadow_map: dict[str, str],
        event_window_hash: str,
        processed_events: int,
        applied_events: int,
        total_events: int,
        last_event: Optional[dict[str, Any]],
        projection_hash: Optional[str],
        lease: dict[str, Any],
        db_session: Optional[Any],
    ) -> None:
        now_dt = _utc_now()
        checkpoint_doc = {
            "rebuild_id": rebuild_id,
            "resume_token": rebuild_id,
            "session_id": session_id,
            "status": status,
            "shadow_map": shadow_map,
            "event_window_hash": event_window_hash,
            "processed_events": processed_events,
            "applied_events": applied_events,
            "total_events": total_events,
            "last_event_id": (last_event or {}).get("_id")
            or (last_event or {}).get("event_id")
            or (last_event or {}).get("id"),
            "last_global_sequence": (last_event or {}).get("global_sequence"),
            "projection_hash": projection_hash,
            "lease": self._lease_metadata(lease),
            "projection_version": PROJECTION_VERSION,
            "updated_at": now_dt,
        }
        await self.db["projection_replay_checkpoints"].update_one(
            {"_id": self._checkpoint_id(rebuild_id=rebuild_id, session_id=session_id)},
            {
                "$set": checkpoint_doc,
                "$setOnInsert": {
                    "_id": self._checkpoint_id(rebuild_id=rebuild_id, session_id=session_id),
                    "created_at": now_dt,
                },
            },
            upsert=True,
            **self._kwargs(db_session),
        )

    async def _assert_shadow_checkpoint_available(
        self,
        *,
        shadow_map: dict[str, str],
        checkpoint: dict[str, Any],
        db_session: Optional[Any],
    ) -> None:
        expected_applied = int(checkpoint.get("applied_events") or 0)
        if expected_applied <= 0:
            return
        applied_count = await self.db[shadow_map["event_applied"]].count_documents(
            {},
            **self._kwargs(db_session),
        )
        if int(applied_count) < expected_applied:
            raise ValueError(
                "Replay checkpoint cannot be resumed because shadow projection state "
                "is missing or incomplete"
            )

    @staticmethod
    def _rebuild_lock_key(session_id: Optional[str]) -> str:
        return f"projection_rebuild:{session_id or 'global'}"

    @staticmethod
    def _lease_metadata(lease: Optional[dict[str, Any]]) -> dict[str, Any]:
        if not isinstance(lease, dict):
            return {}
        return {
            "key": lease.get("_id"),
            "owner": lease.get("owner"),
            "fencing_token": lease.get("fencing_token"),
            "lease_version": lease.get("lease_version"),
            "expires_at": lease.get("expires_at"),
        }

    async def _next_rebuild_fencing_token(
        self,
        *,
        lock_key: str,
        db_session: Optional[Any],
    ) -> int:
        now_dt = _utc_now()
        collection = self.db["projection_rebuild_fencing_tokens"]
        await collection.update_one(
            {"_id": "global"},
            {
                "$inc": {"value": 1},
                "$setOnInsert": {"_id": "global", "created_at": now_dt},
                "$set": {"updated_at": now_dt, "last_lock_key": lock_key},
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        doc = await collection.find_one({"_id": "global"}, **self._kwargs(db_session))
        if not isinstance(doc, dict) or not isinstance(doc.get("value"), int):
            raise RuntimeError("Failed to allocate projection rebuild fencing token")
        return int(doc["value"])

    async def _acquire_rebuild_lease(
        self,
        *,
        session_id: Optional[str],
        owner: str,
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        now_dt = _utc_now()
        expires_at = now_dt + timedelta(seconds=DEFAULT_REBUILD_LEASE_SECONDS)
        lock_key = self._rebuild_lock_key(session_id)
        collection = self.db["projection_rebuild_leases"]
        existing = await collection.find_one({"_id": lock_key}, **self._kwargs(db_session))
        if isinstance(existing, dict):
            active = existing.get("expires_at") and existing["expires_at"] > now_dt
            if active and existing.get("owner") != owner:
                raise RuntimeError(
                    f"Projection rebuild already locked for {session_id or 'global'} "
                    f"by {existing.get('owner')}"
                )
            fencing_token = await self._next_rebuild_fencing_token(
                lock_key=lock_key,
                db_session=db_session,
            )
            result = await collection.update_one(
                {
                    "_id": lock_key,
                    "lease_version": int(existing.get("lease_version") or 1),
                },
                {
                    "$set": {
                        "owner": owner,
                        "session_id": session_id,
                        "expires_at": expires_at,
                        "renewed_at": now_dt,
                        "fencing_token": fencing_token,
                        "projection_version": PROJECTION_VERSION,
                    },
                    "$inc": {"lease_version": 1},
                },
                **self._kwargs(db_session),
            )
            if int(getattr(result, "matched_count", 0) or 0) <= 0:
                raise RuntimeError("Projection rebuild lease changed during acquisition")
        else:
            fencing_token = await self._next_rebuild_fencing_token(
                lock_key=lock_key,
                db_session=db_session,
            )
            await collection.insert_one(
                {
                    "_id": lock_key,
                    "owner": owner,
                    "session_id": session_id,
                    "created_at": now_dt,
                    "renewed_at": now_dt,
                    "expires_at": expires_at,
                    "fencing_token": fencing_token,
                    "lease_version": 1,
                    "projection_version": PROJECTION_VERSION,
                },
                **self._kwargs(db_session),
            )
        lease = await collection.find_one({"_id": lock_key}, **self._kwargs(db_session))
        if not isinstance(lease, dict):
            raise RuntimeError("Projection rebuild lease acquisition did not persist")
        return lease

    async def _renew_rebuild_lease(
        self,
        lease: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        now_dt = _utc_now()
        expires_at = now_dt + timedelta(seconds=DEFAULT_REBUILD_LEASE_SECONDS)
        collection = self.db["projection_rebuild_leases"]
        result = await collection.update_one(
            {
                "_id": lease.get("_id"),
                "owner": lease.get("owner"),
                "fencing_token": lease.get("fencing_token"),
                "lease_version": int(lease.get("lease_version") or 0),
                "expires_at": {"$gt": now_dt},
            },
            {
                "$set": {"expires_at": expires_at, "renewed_at": now_dt},
                "$inc": {"lease_version": 1},
            },
            **self._kwargs(db_session),
        )
        if int(getattr(result, "matched_count", 0) or 0) <= 0:
            raise RuntimeError("Projection rebuild lease is stale or expired")
        renewed = await collection.find_one({"_id": lease.get("_id")}, **self._kwargs(db_session))
        if not isinstance(renewed, dict):
            raise RuntimeError("Projection rebuild lease disappeared during renewal")
        return renewed

    async def _validate_rebuild_lease(
        self,
        lease: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        now_dt = _utc_now()
        found = await self.db["projection_rebuild_leases"].find_one(
            {
                "_id": lease.get("_id"),
                "owner": lease.get("owner"),
                "fencing_token": lease.get("fencing_token"),
                "lease_version": int(lease.get("lease_version") or 0),
                "expires_at": {"$gt": now_dt},
            },
            **self._kwargs(db_session),
        )
        if not isinstance(found, dict):
            raise RuntimeError("Projection rebuild lease validation failed before swap")

    async def _release_rebuild_lease(
        self,
        lease: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> None:
        await self.db["projection_rebuild_leases"].delete_one(
            {
                "_id": lease.get("_id"),
                "owner": lease.get("owner"),
                "fencing_token": lease.get("fencing_token"),
            },
            **self._kwargs(db_session),
        )

    async def _swap_shadow_projection_state(
        self,
        *,
        shadow_map: dict[str, str],
        session_id: Optional[str],
        expected_projection_hash: str,
        db_session: Optional[Any],
        lease: dict[str, Any],
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                if tx is not None:
                    return await self._swap_shadow_projection_state(
                        shadow_map=shadow_map,
                        session_id=session_id,
                        expected_projection_hash=expected_projection_hash,
                        db_session=tx,
                        lease=lease,
                    )

        await self._validate_rebuild_lease(lease, db_session=db_session)
        live_backup = None
        if db_session is None:
            live_backup = await self._snapshot_live_projection_state(
                session_id=session_id,
                db_session=db_session,
            )
        try:
            await self._clear_projection_state(session_id=session_id, db_session=db_session)
            copied_counts: dict[str, int] = {}
            for collection_name in (*PROJECTION_COLLECTIONS, "event_applied"):
                copied_counts[collection_name] = await self._copy_shadow_collection_to_live(
                    collection_name=collection_name,
                    shadow_collection_name=shadow_map[collection_name],
                    session_id=session_id,
                    db_session=db_session,
                )

            live_projection_hash = await self._projection_state_hash(
                session_id=session_id,
                db_session=db_session,
            )
            if live_projection_hash != expected_projection_hash:
                raise RuntimeError(
                    "Shadow projection swap validation failed: live projection hash "
                    "does not match shadow projection hash"
                )
            return {
                "swap_atomic": db_session is not None,
                "copied_counts": copied_counts,
                "live_projection_hash": live_projection_hash,
                "rollback_guarded": live_backup is not None,
            }
        except Exception:
            if live_backup is not None:
                await self._restore_live_projection_state(
                    snapshot=live_backup,
                    session_id=session_id,
                    db_session=db_session,
                )
            raise

    async def _projection_docs(
        self,
        collection_name: str,
        *,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> list[dict[str, Any]]:
        query = {"session_id": session_id} if session_id else {}
        return [
            document
            async for document in self.db[collection_name].find(
                query,
                **self._kwargs(db_session),
            )
        ]

    async def _semantic_replay_validation(
        self,
        events: list[dict[str, Any]],
        *,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        engine = ReplayInvariantEngine()
        projection_docs: dict[str, list[dict[str, Any]]] = {}
        for collection_name in engine.required_projection_collections():
            projection_docs[collection_name] = await self._projection_docs(
                collection_name,
                session_id=session_id,
                db_session=db_session,
            )

        validation = engine.validate(events, projection_docs)
        if not validation["passed"]:
            raise ValueError(
                "Projection semantic validation failed: "
                f"{validation['violation_count']} invariant violation(s)"
            )
        return validation

    async def _projection_state_hash(
        self,
        *,
        session_id: Optional[str],
        db_session: Optional[Any],
    ) -> str:
        kwargs = self._kwargs(db_session)
        query = {"session_id": session_id} if session_id else {}
        collections: dict[str, list[dict[str, Any]]] = {}
        for collection_name in (*PROJECTION_COLLECTIONS, "event_applied"):
            collection = self.db[collection_name]
            canonical_docs: list[dict[str, Any]] = []
            async for document in collection.find(query, **kwargs):
                canonical_docs.append(_canonical_projection_document(collection_name, document))
            canonical_docs.sort(key=_stable_hash)
            collections[collection_name] = canonical_docs
        return _stable_hash(
            {
                "projection_version": PROJECTION_VERSION,
                "collections": collections,
            }
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
            "status": payload.get("status") or payload.get("to_status") or current.get("status") or "OPEN",
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
            "snapshot_item_count": int(payload.get("item_count") or current.get("snapshot_item_count") or 0),
            "version": int(payload.get("version") or current.get("version") or 0),
            "updated_at": payload.get("updated_at") or event.get("timestamp") or now_dt,
            "last_event_id": event.get("_id") or event.get("id"),
            "last_event_type": event.get("event_type"),
            "projection_version": PROJECTION_VERSION,
        }

        if event_type == "SESSION_CREATED":
            next_doc["started_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["last_heartbeat"] = payload.get("updated_at") or event.get("timestamp") or now_dt
        elif event_type == "SESSION_TRANSITIONED":
            target_status = payload.get("to_status") or next_doc["status"]
            next_doc["status"] = target_status
            if target_status == "RECONCILE":
                next_doc["reconciled_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            if target_status == "CLOSED":
                next_doc["closed_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            if target_status == "FINALIZED":
                next_doc["finalized_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
        elif event_type == "SESSION_HEARTBEAT":
            next_doc["last_heartbeat"] = payload.get("updated_at") or event.get("timestamp") or now_dt
        elif event_type == "SESSION_FINALIZED":
            next_doc["status"] = "FINALIZED"
            next_doc["finalized_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["completed_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["closed_at"] = payload.get("updated_at") or event.get("timestamp") or now_dt
            next_doc["finalized_by"] = payload.get("finalized_by") or payload.get("actor") or current.get("finalized_by")

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
        session_doc = await self.db.session_dashboard_projection.find_one({"session_id": session_id}, **kwargs)
        if not isinstance(session_doc, dict):
            return

        total_items = 0
        verified_items = 0
        damage_items = 0
        total_variance = 0.0
        positive_variance = 0.0
        negative_variance = 0.0
        latest_counted_at: Optional[datetime] = None

        async for row in self.db.verified_items_projection.find({"session_id": session_id}, **kwargs):
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
        async for row in self.db.variance_summary_projection.find({"session_id": session_id}, **kwargs):
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
            unit_value = _as_float((line_row or {}).get("unit_value") or (line_row or {}).get("mrp"))
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
                    "complete_percent": (total_counted_qty / total_stock_qty * 100.0)
                    if total_stock_qty
                    else 0.0,
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
        inactive = event_type in {"COUNT_LINE_REMOVED", "COUNT_LINE_SUPERSEDED"} or _line_status_is_inactive(
            line.get("status")
        )
        if inactive:
            await self.db.verified_items_projection.delete_one(
                {"count_line_id": line_id},
                **self._kwargs(db_session),
            )
            await self.db.variance_summary_projection.delete_one(
                {"count_line_id": line_id},
                **self._kwargs(db_session),
            )
            await self._refresh_session_dashboard_projection(session_id=session_id, db_session=db_session)
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
        variance_percentage = (variance / abs(stock_qty) * 100.0) if stock_qty else (100.0 if variance else 0.0)
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
            "floor": line.get("floor_no") or line.get("floor_id") or (session_projection or {}).get("location_name"),
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
            "verified": bool(line.get("verified")) or str(line.get("approval_status") or "").upper() == "APPROVED",
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

        if abs(variance) > 1e-9 or verified_doc["approval_status"] or verified_doc["blind_recount_required"]:
            await self.db.variance_summary_projection.update_one(
                {"count_line_id": line_id},
                {
                    "$set": {
                        **verified_doc,
                        "count_line_id": line_id,
                        "approved_by": line.get("approved_by"),
                        "approved_at": line.get("approved_at"),
                        "assigned_to": line.get("assigned_to"),
                        "rejection_reason": line.get("rejection_reason") or line.get("variance_reason"),
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

        await self._refresh_session_dashboard_projection(session_id=session_id, db_session=db_session)
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
                    "last_event_id": event.get("_id") or event.get("event_id") or event.get("id"),
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

        snapshot_version = _normalize_string(
            line.get("snapshot_version")
            or line.get("erp_snapshot_version")
            or line.get("baseline_version")
            or line.get("baseline_hash")
        )
        snapshot_timestamp = (
            line.get("snapshot_timestamp")
            or line.get("erp_snapshot_timestamp")
            or line.get("last_synced")
            or line.get("baseline_timestamp")
        )
        source_sync_id = _normalize_string(
            line.get("source_sync_id")
            or line.get("erp_source_sync_id")
            or line.get("sync_id")
            or line.get("baseline_sync_id")
        )
        event_identifier = _normalize_string(
            event.get("_id") or event.get("event_id") or event.get("id")
        )
        event_recorded_at = event.get("recorded_at") or event.get("timestamp") or _utc_now()
        snapshot_history_id = _stable_hash(
            {
                "session_id": session_id,
                "item_code": item_code,
                "snapshot_version": snapshot_version,
                "snapshot_timestamp": snapshot_timestamp,
                "source_sync_id": source_sync_id,
                "event_id": event_identifier,
            }
        )
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
                    "snapshot_version": snapshot_version,
                    "snapshot_timestamp": snapshot_timestamp,
                    "source_sync_id": source_sync_id,
                    "stale_snapshot": not (
                        snapshot_version and snapshot_timestamp and source_sync_id
                    ),
                    "updated_at": _utc_now(),
                    "last_event_id": event_identifier,
                    "projection_version": PROJECTION_VERSION,
                }
            },
            upsert=True,
            **self._kwargs(db_session),
        )
        try:
            await self.db.erp_snapshot_history.insert_one(
                {
                    "_id": snapshot_history_id,
                    "session_id": session_id,
                    "item_id": item_id,
                    "item_code": item_code,
                    "baseline_qty": _as_float(line.get("erp_qty")),
                    "current_sql_qty": _as_float(line.get("current_sql_qty")),
                    "baseline_hash": line.get("baseline_hash"),
                    "snapshot_version": snapshot_version,
                    "snapshot_timestamp": snapshot_timestamp,
                    "source_sync_id": source_sync_id,
                    "stale_snapshot": not (
                        snapshot_version and snapshot_timestamp and source_sync_id
                    ),
                    "source_event_id": event_identifier,
                    "recorded_at": event_recorded_at,
                    "created_at": event_recorded_at,
                    "projection_version": PROJECTION_VERSION,
                },
                **self._kwargs(db_session),
            )
        except DuplicateKeyError:
            pass
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
