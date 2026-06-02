"""Structured governance audit event logging for governed writes."""

from __future__ import annotations

import logging
import inspect
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Automated system actors that are allowed without a real user context.
_SYSTEM_ACTORS = frozenset({"system", "conflict_resolver", "system_auto_resolve", "sync"})


class GovernanceAuditService:
    """Best-effort audit logger that never breaks business writes."""

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

    async def log_governance_event(
        self,
        *,
        event: str,
        operation: str,
        session_id: str,
        actor: dict[str, Any],
        item_id: Optional[str] = None,
        location_id: Optional[str] = None,
        version: Optional[int] = None,
        idempotency_key: Optional[str] = None,
        semantic_hash: Optional[str] = None,
        status: str = "SUCCESS",
        metadata: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> None:
        """
        FIX GROUP 5: Full actor attribution for every governance event.

        The ``actor`` dict must contain at minimum ``user_id`` and ``username``.
        Only automated operations (conflict_resolver, system) may omit a real user.
        """
        actor_id = str(actor.get("user_id") or actor.get("username") or actor.get("id") or "")
        username = str(actor.get("username") or actor.get("user_id") or actor.get("id") or "")
        role = str(actor.get("role") or "")
        org_id = str(actor.get("org_id") or "")

        if not actor_id or actor_id == "system":
            if actor_id not in _SYSTEM_ACTORS:
                logger.warning(
                    "Governance event '%s' recorded without real actor (got: '%s'). "
                    "Only automated operations may omit actor context.",
                    event,
                    actor_id,
                )

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
            "username": username,
            "role": role,
            "org_id": org_id,
            "timestamp": self._utc_now(),
            "status": status,
            "metadata": metadata or {},
        }

        kwargs: dict[str, Any] = {}
        if db_session is not None:
            kwargs["session"] = db_session

        try:
            await self._resolve_awaitable(self.db.governance_events.insert_one(payload, **kwargs))
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Governance audit logging failed: %s", exc)

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
        """Backwards-compatible shim that delegates to log_governance_event."""
        actor = {"user_id": actor_id or "system", "username": actor_id or "system"}
        await self.log_governance_event(
            event=event,
            operation=operation,
            session_id=session_id,
            actor=actor,
            item_id=item_id,
            location_id=location_id,
            version=version,
            idempotency_key=idempotency_key,
            semantic_hash=semantic_hash,
            status=status,
            metadata=metadata,
            db_session=db_session,
        )
