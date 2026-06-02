"""Structured governance audit event logging for governed writes."""

from __future__ import annotations

import logging
import inspect
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from backend.services.governance_guard import write_authority
from backend.tenancy.org_context import get_current_org_id
from backend.tenancy.scoping import org_scoped_filter

logger = logging.getLogger(__name__)


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
        org_id = get_current_org_id()
        actor_user_id: Optional[str] = None
        actor_username: Optional[str] = None
        actor_role: Optional[str] = None
        try:
            if actor_id and hasattr(self.db, "users"):
                lookup = (
                    {"_id": ObjectId(str(actor_id))}
                    if ObjectId.is_valid(str(actor_id))
                    else {"username": str(actor_id)}
                )
                user = await self._resolve_awaitable(
                    self.db.users.find_one(
                        org_scoped_filter(None, lookup),
                        {"_id": 1, "username": 1, "role": 1, "org_id": 1},
                    )
                )
                if isinstance(user, dict) and user:
                    actor_user_id = str(user.get("_id") or "") or None
                    actor_username = str(user.get("username") or "").strip() or None
                    actor_role = str(user.get("role") or "").strip() or None
                    org_id = str(user.get("org_id") or org_id)
        except Exception:
            pass

        payload: dict[str, Any] = {
            "event": event,
            "operation": operation,
            "org_id": org_id,
            "session_id": session_id,
            "item_id": item_id,
            "location_id": location_id,
            "version": version,
            "idempotency_key": idempotency_key,
            "semantic_hash": semantic_hash,
            "actor_id": actor_id,
            "actor_user_id": actor_user_id,
            "actor_username": actor_username,
            "actor_role": actor_role,
            "timestamp": self._utc_now(),
            "status": status,
            "metadata": metadata or {},
        }

        kwargs: dict[str, Any] = {}
        if db_session is not None:
            kwargs["session"] = db_session

        try:
            with write_authority("GovernanceAuditService"):
                await self._resolve_awaitable(
                    self.db.governance_events.insert_one(payload, **kwargs)
                )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Governance audit logging failed: %s", exc)
