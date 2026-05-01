"""Structured governance audit event logging for governed writes."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


class GovernanceAuditService:
    """Best-effort audit logger that never breaks business writes."""

    def __init__(self, db: Any) -> None:
        self.db = db

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

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
        }

        kwargs: dict[str, Any] = {}
        if db_session is not None:
            kwargs["session"] = db_session

        try:
            await self.db.governance_events.insert_one(payload, **kwargs)
        except (RuntimeError, TypeError, ValueError, OSError) as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Governance audit logging failed: %s", exc)
