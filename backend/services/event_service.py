from __future__ import annotations

import hashlib
import inspect
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pymongo.errors import DuplicateKeyError

from backend.services.projection_service import ProjectionService

logger = logging.getLogger(__name__)

FLAG_EVENT_SHADOW_WRITE = "V3_EVENT_SHADOW_WRITE"
FLAG_EVENT_ENFORCE_WRITES = "V3_EVENT_ENFORCE_WRITES"
FLAG_PROJECTION_SHADOW = "V3_PROJECTION_SHADOW"
FLAG_PROJECTION_READS = "V3_PROJECTION_READS"
FLAG_LOCATION_SESSION_LOCK = "V3_ENFORCE_LOCATION_SESSION_LOCK"
FLAG_GLOBAL_SERIALS = "V3_ENFORCE_GLOBAL_SERIALS"
FLAG_BACKEND_UOM = "V3_ENFORCE_BACKEND_UOM"


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
            upper = serial.upper()
            if upper not in seen:
                seen.add(upper)
                normalized.append(upper)

    for entry in document.get("serial_entries") or []:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_string(entry.get("serial_number"))
        if serial:
            upper = serial.upper()
            if upper not in seen:
                seen.add(upper)
                normalized.append(upper)
    return normalized


def _line_identifier(document: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(document, dict):
        return None
    return _normalize_string(document.get("id") or document.get("_id"))


class EventService:
    """Append-only event writer plus projection fan-out."""

    def __init__(
        self,
        db: Any,
        *,
        projection_service: Optional[ProjectionService] = None,
    ) -> None:
        self.db = db
        self.projection_service = projection_service or ProjectionService(db)

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    @staticmethod
    async def _resolve_awaitable(value: Any) -> Any:
        resolved = value
        for _ in range(10):
            if not inspect.isawaitable(resolved):
                break
            resolved = await resolved
        return resolved

    async def is_enabled(self, key: str, *, default: bool = False) -> bool:
        env_value = os.getenv(key)
        if env_value is not None:
            return _as_bool(env_value, default=default)

        try:
            collection = getattr(self.db, "feature_flags", None) or self.db["feature_flags"]
            doc = await self._resolve_awaitable(collection.find_one({"key": key}))
        except Exception:
            return default

        if not isinstance(doc, dict):
            return default

        if "enabled" in doc:
            return _as_bool(doc.get("enabled"), default=default)
        if "state" in doc:
            return _as_bool(doc.get("state"), default=default)
        return default

    async def append_event(
        self,
        *,
        aggregate_id: str,
        event_type: str,
        payload: dict[str, Any],
        metadata: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
        apply_projection: bool = True,
        enforce_writes: Optional[bool] = None,
    ) -> dict[str, Any]:
        metadata = self._normalize_event_metadata(
            metadata=metadata,
            aggregate_id=aggregate_id,
            event_type=event_type,
            payload=payload,
        )
        idempotency_key = _normalize_string(metadata.get("idempotency_key"))
        request_idempotency_key = _normalize_string(metadata.get("request_idempotency_key"))
        scan_fingerprint = _normalize_string(metadata.get("scan_fingerprint"))
        if enforce_writes is None:
            enforce_writes = await self.is_enabled(FLAG_EVENT_ENFORCE_WRITES, default=True)

        existing = await self._find_existing_event(
            idempotency_key=idempotency_key,
            scan_fingerprint=scan_fingerprint,
            db_session=db_session,
        )
        if isinstance(existing, dict):
            return existing

        event_doc = {
            "_id": str(uuid.uuid4()),
            "aggregate_id": aggregate_id,
            "event_type": event_type,
            "payload": payload,
            "metadata": metadata,
            "timestamp": _utc_now(),
        }
        if idempotency_key:
            event_doc["idempotency_key"] = idempotency_key
        if request_idempotency_key:
            event_doc["request_idempotency_key"] = request_idempotency_key
        if scan_fingerprint:
            event_doc["scan_fingerprint"] = scan_fingerprint

        try:
            await self._resolve_awaitable(
                self.db.event_log.insert_one(event_doc, **self._kwargs(db_session))
            )
        except DuplicateKeyError:
            existing = await self._find_existing_event(
                idempotency_key=idempotency_key,
                scan_fingerprint=scan_fingerprint,
                db_session=db_session,
            )
            if isinstance(existing, dict):
                return existing
            if enforce_writes:
                raise
            logger.warning("Duplicate event suppressed for %s (%s)", event_type, aggregate_id)
            return event_doc

        if apply_projection and await self.is_enabled(FLAG_PROJECTION_SHADOW, default=True):
            try:
                await self.projection_service.apply_event(event_doc, db_session=db_session)
            except Exception:
                if enforce_writes:
                    raise
                logger.exception("Projection fan-out failed for event %s", event_doc["_id"])

        return event_doc

    async def record_session_event(
        self,
        *,
        event_type: str,
        session_id: str,
        payload: dict[str, Any],
        metadata: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
        required: bool = True,
    ) -> Optional[dict[str, Any]]:
        if not required and not await self.is_enabled(FLAG_EVENT_SHADOW_WRITE, default=True):
            return None

        safe_metadata = dict(metadata or {})
        safe_metadata.setdefault(
            "event_idempotency_key",
            f"{event_type}:{session_id}:{payload.get('updated_at') or payload.get('timestamp') or _utc_now().isoformat()}",
        )
        safe_metadata.setdefault("legacy_source", "sessions")
        return await self.append_event(
            aggregate_id=session_id,
            event_type=event_type,
            payload={"session_id": session_id, **payload},
            metadata=safe_metadata,
            db_session=db_session,
            apply_projection=False,
            enforce_writes=required,
        )

    async def mirror_count_line_write(
        self,
        *,
        payload: dict[str, Any],
        context: dict[str, Any],
        resolved_result: Any,
        pre_images: list[dict[str, Any]],
        post_images: list[dict[str, Any]],
        db_session: Optional[Any] = None,
    ) -> list[dict[str, Any]]:
        operation = str(payload.get("operation") or "").strip().lower()
        events: list[dict[str, Any]] = []

        if operation == "insert_one":
            document = payload.get("document")
            if isinstance(document, dict) and getattr(resolved_result, "inserted_id", None):
                document.setdefault("_id", getattr(resolved_result, "inserted_id"))
            if isinstance(document, dict):
                emitted = await self._emit_insert_events(
                    document=document,
                    context=context,
                    db_session=db_session,
                )
                events.extend(emitted)
            return events

        if operation in {"update_one", "update_many"}:
            post_index = {
                _line_identifier(doc): doc
                for doc in post_images
                if isinstance(doc, dict) and _line_identifier(doc)
            }
            for before in pre_images:
                before_id = _line_identifier(before)
                after = post_index.get(before_id)
                if not after:
                    continue
                events.extend(
                    await self._emit_update_events(
                        before=before,
                        after=after,
                        context=context,
                        db_session=db_session,
                    )
                )
            return events

        if operation in {"delete_one", "delete_many"}:
            for before in pre_images:
                removed = await self._emit_removed_event(
                    document=before,
                    context=context,
                    db_session=db_session,
                )
                if removed:
                    events.append(removed)
            return events

        return events

    async def record_sync_queue_event(
        self,
        *,
        event_type: str,
        session_id: Optional[str],
        item_code: Optional[str],
        strategy: str,
        details: dict[str, Any],
        resolved_by: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> Optional[dict[str, Any]]:
        queue_id = _normalize_string(details.get("conflict_id")) or str(uuid.uuid4())
        return await self.append_event(
            aggregate_id=item_code or session_id or "sync",
            event_type=event_type,
            payload={
                "queue_id": queue_id,
                "session_id": session_id,
                "item_code": item_code,
                "strategy": strategy,
                "details": details,
                "resolved_by": resolved_by,
                "status": "PENDING" if event_type == "SYNC_CONFLICT_RECORDED" else "RESOLVED",
            },
            metadata={
                "request_idempotency_key": queue_id,
                "event_idempotency_key": f"{event_type}:{queue_id}",
                "legacy_source": "sync_conflicts",
            },
            db_session=db_session,
        )

    async def _emit_insert_events(
        self,
        *,
        document: dict[str, Any],
        context: dict[str, Any],
        db_session: Optional[Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        aggregate_id = _normalize_string(document.get("item_code")) or "unknown-item"
        metadata = self._build_metadata(document=document, context=context, event_type="SCAN_ADDED")
        payload = self._build_payload(document=document, before=None, after=document)
        events.append(
            await self.append_event(
                aggregate_id=aggregate_id,
                event_type="SCAN_ADDED",
                payload=payload,
                metadata=metadata,
                db_session=db_session,
            )
        )

        if abs(float(document.get("variance") or 0.0)) > 0:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="VARIANCE_DETECTED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=document,
                        context=context,
                        event_type="VARIANCE_DETECTED",
                    ),
                    db_session=db_session,
                )
            )

        if float(document.get("damaged_qty") or 0.0) > 0:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="DAMAGE_MARKED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=document,
                        context=context,
                        event_type="DAMAGE_MARKED",
                    ),
                    db_session=db_session,
                )
            )

        if str(document.get("approval_status") or "").strip().upper() == "APPROVED":
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="APPROVAL_GRANTED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=document,
                        context=context,
                        event_type="APPROVAL_GRANTED",
                    ),
                    db_session=db_session,
                )
            )

        return events

    async def _emit_update_events(
        self,
        *,
        before: dict[str, Any],
        after: dict[str, Any],
        context: dict[str, Any],
        db_session: Optional[Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        aggregate_id = (
            _normalize_string(after.get("item_code") or before.get("item_code")) or "unknown-item"
        )
        payload = self._build_payload(document=after, before=before, after=after)

        counted_delta = float((payload.get("delta") or {}).get("counted_qty") or 0.0)
        damaged_delta = float((payload.get("delta") or {}).get("damaged_qty") or 0.0)
        before_approval = str(before.get("approval_status") or "").strip().upper()
        after_approval = str(after.get("approval_status") or "").strip().upper()
        before_status = str(before.get("status") or "").strip().upper()
        after_status = str(after.get("status") or "").strip().upper()
        before_verified = bool(before.get("verified"))
        after_verified = bool(after.get("verified"))

        if counted_delta != 0.0:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="QUANTITY_ADJUSTED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="QUANTITY_ADJUSTED",
                    ),
                    db_session=db_session,
                )
            )

        if damaged_delta > 0.0:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="DAMAGE_MARKED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="DAMAGE_MARKED",
                    ),
                    db_session=db_session,
                )
            )

        if after_approval == "APPROVED" and before_approval != "APPROVED":
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="APPROVAL_GRANTED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="APPROVAL_GRANTED",
                    ),
                    db_session=db_session,
                )
            )

        if after_status == "REJECTED" and before_status != "REJECTED":
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="RECOUNT_REQUESTED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="RECOUNT_REQUESTED",
                    ),
                    db_session=db_session,
                )
            )

        if after_verified and not before_verified:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="COUNT_VERIFIED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="COUNT_VERIFIED",
                    ),
                    db_session=db_session,
                    apply_projection=False,
                )
            )

        if not after_verified and before_verified:
            events.append(
                await self.append_event(
                    aggregate_id=aggregate_id,
                    event_type="COUNT_UNVERIFIED",
                    payload=payload,
                    metadata=self._build_metadata(
                        document=after,
                        context=context,
                        event_type="COUNT_UNVERIFIED",
                    ),
                    db_session=db_session,
                    apply_projection=False,
                )
            )

        return events

    async def _emit_removed_event(
        self,
        *,
        document: dict[str, Any],
        context: dict[str, Any],
        db_session: Optional[Any],
    ) -> Optional[dict[str, Any]]:
        aggregate_id = _normalize_string(document.get("item_code")) or "unknown-item"
        return await self.append_event(
            aggregate_id=aggregate_id,
            event_type="COUNT_LINE_REMOVED",
            payload=self._build_payload(document=document, before=document, after=None),
            metadata=self._build_metadata(
                document=document,
                context=context,
                event_type="COUNT_LINE_REMOVED",
            ),
            db_session=db_session,
        )

    def _build_payload(
        self,
        *,
        document: dict[str, Any],
        before: Optional[dict[str, Any]],
        after: Optional[dict[str, Any]],
    ) -> dict[str, Any]:
        active = after or before or document
        before_qty = float((before or {}).get("counted_qty") or 0.0)
        after_qty = float((after or {}).get("counted_qty") or 0.0)
        before_damaged = float((before or {}).get("damaged_qty") or 0.0)
        after_damaged = float((after or {}).get("damaged_qty") or 0.0)
        before_serials = _normalize_serials(before)
        after_serials = _normalize_serials(after) if after is not None else []
        return {
            "session_id": active.get("session_id"),
            "item_id": active.get("item_id") or active.get("item_code"),
            "batch_id": active.get("batch_id"),
            "count_line_id": _line_identifier(active),
            "count_line": active,
            "before": before,
            "after": after,
            "serial_numbers": after_serials,
            "delta": {
                "counted_qty": after_qty - before_qty if after is not None else -before_qty,
                "damaged_qty": (
                    after_damaged - before_damaged if after is not None else -before_damaged
                ),
                "serial_count": len(after_serials) - len(before_serials),
            },
        }

    def _build_metadata(
        self,
        *,
        document: dict[str, Any],
        context: dict[str, Any],
        event_type: str,
    ) -> dict[str, Any]:
        request_idempotency_key = _normalize_string(document.get("idempotency_key"))
        event_idempotency_key = f"{event_type}:{_line_identifier(document) or document.get('item_code')}:{document.get('updated_at') or document.get('counted_at') or document.get('approved_at') or _utc_now().isoformat()}"
        return {
            "user_id": _normalize_string(
                context.get("username")
                or context.get("user_id")
                or document.get("updated_by")
                or document.get("counted_by")
                or document.get("created_by")
            ),
            "device_id": _normalize_string(
                context.get("device_id") or document.get("device_id") or context.get("client_id")
            ),
            "request_idempotency_key": request_idempotency_key,
            "idempotency_key": event_idempotency_key,
            "event_idempotency_key": event_idempotency_key,
            "scan_fingerprint": (
                self.compute_scan_fingerprint(document, context)
                if event_type == "SCAN_ADDED"
                else None
            ),
            "legacy_source": "count_lines",
            "legacy_operation": context.get("transition") or event_type.lower(),
        }

    def _normalize_event_metadata(
        self,
        *,
        metadata: Optional[dict[str, Any]],
        aggregate_id: str,
        event_type: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        normalized = dict(metadata or {})
        request_idempotency_key = _normalize_string(
            normalized.get("request_idempotency_key") or normalized.get("idempotency_key")
        )
        event_idempotency_key = _normalize_string(normalized.get("event_idempotency_key"))
        if event_idempotency_key is None:
            fallback_token = _normalize_string(
                payload.get("count_line_id")
                or payload.get("session_id")
                or payload.get("queue_id")
                or payload.get("recount_id")
            ) or str(uuid.uuid4())
            event_idempotency_key = f"{event_type}:{aggregate_id}:{fallback_token}"

        normalized["idempotency_key"] = event_idempotency_key
        normalized["event_idempotency_key"] = event_idempotency_key
        if request_idempotency_key:
            normalized["request_idempotency_key"] = request_idempotency_key
        else:
            normalized.pop("request_idempotency_key", None)
        scan_fingerprint = _normalize_string(normalized.get("scan_fingerprint"))
        if scan_fingerprint:
            normalized["scan_fingerprint"] = scan_fingerprint
        else:
            normalized.pop("scan_fingerprint", None)
        return normalized

    async def _find_existing_event(
        self,
        *,
        idempotency_key: Optional[str],
        scan_fingerprint: Optional[str],
        db_session: Optional[Any],
    ) -> Optional[dict[str, Any]]:
        kwargs = self._kwargs(db_session)
        if idempotency_key:
            existing = await self._resolve_awaitable(
                self.db.event_log.find_one(
                    {
                        "$or": [
                            {"idempotency_key": idempotency_key},
                            {"metadata.idempotency_key": idempotency_key},
                            {"metadata.event_idempotency_key": idempotency_key},
                        ]
                    },
                    **kwargs,
                )
            )
            if isinstance(existing, dict):
                return existing
        if scan_fingerprint:
            existing = await self._resolve_awaitable(
                self.db.event_log.find_one(
                    {"scan_fingerprint": scan_fingerprint},
                    **kwargs,
                )
            )
            if isinstance(existing, dict):
                return existing
        return None

    def compute_scan_fingerprint(
        self,
        document: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
    ) -> str:
        serials = _normalize_serials(document)
        payload = {
            "device_id": _normalize_string(
                (context or {}).get("device_id") or document.get("device_id") or "unknown-device"
            ),
            "session_id": _normalize_string(document.get("session_id")),
            "item_code": _normalize_string(document.get("item_code")),
            "batch_id": _normalize_string(document.get("batch_id")),
            "serials": serials,
            "location_id": _normalize_string(
                document.get("location_id") or document.get("floor_id")
            ),
            "counted_qty": float(document.get("counted_qty") or 0.0),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
