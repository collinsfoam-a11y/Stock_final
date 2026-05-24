"""Structured governance audit event logging for governed writes."""

from __future__ import annotations

import logging
import inspect
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


class GovernanceAuditService:
    """Writes governance evidence to an immutable ledger plus legacy audit view."""

    def __init__(self, db: Any) -> None:
        self.db = db

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    async def _resolve_awaitable(value: Any) -> Any:
        resolved = value
        for _ in range(10):
            if not inspect.isawaitable(resolved):
                break
            resolved = await resolved
        return resolved

    async def log_write_event(
        self,
        *,
        event: str,
        operation: str,
        session_id: str,
        item_id: Optional[str] = None,
        location_id: Optional[str] = None,
        version: Optional[int] = None,
        idempotency_key: Optional[str] = None,
        semantic_hash: Optional[str] = None,
        actor_id: Optional[str] = None,
        status: str = "SUCCESS",
        metadata: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
        gps_lat: Optional[float] = None,
        gps_lng: Optional[float] = None,
        device_id: Optional[str] = None,
    ) -> None:
        payload: dict[str, Any] = {
            "event": event,
            "operation": operation,
            "session_id": session_id,
            "item_id": item_id,
            "location_id": location_id,
            "version": version,
            "idempotency_key": idempotency_key,
            "semantic_hash": semantic_hash,
            "actor_id": actor_id,
            "timestamp": self._utc_now(),
            "status": status,
            "metadata": metadata or {},
            "gps_lat": gps_lat,
            "gps_lng": gps_lng,
            "device_id": device_id,
        }
        ledger_id = str(uuid.uuid4())
        ledger_payload: dict[str, Any] = {
            "_id": ledger_id,
            "ledger_id": ledger_id,
            "event_type": event,
            "operation": operation,
            "session_id": session_id,
            "item_id": item_id,
            "location_id": location_id,
            "aggregate_version": version,
            "idempotency_key": idempotency_key,
            "semantic_hash": semantic_hash,
            "actor_id": actor_id,
            "status": status,
            "metadata": metadata or {},
            "gps_lat": gps_lat,
            "gps_lng": gps_lng,
            "device_id": device_id,
            "recorded_at": payload["timestamp"],
            "source_collection": "governance_events",
            "immutable": True,
        }

        kwargs: dict[str, Any] = {}
        if db_session is not None:
            kwargs["session"] = db_session

        ledger_required = os.getenv("GOVERNANCE_LEDGER_REQUIRED", "true").lower() == "true"
        try:
            await self._resolve_awaitable(
                self.db.governance_ledger.insert_one(ledger_payload, **kwargs)
            )
        except Exception as exc:
            logger.error("Governance ledger append failed: %s", exc)
            if ledger_required:
                raise

        try:
            await self._resolve_awaitable(self.db.governance_events.insert_one(payload, **kwargs))
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Governance audit logging failed: %s", exc)
