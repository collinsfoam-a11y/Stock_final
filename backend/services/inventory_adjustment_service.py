"""
FIX GROUP 11: Inventory Adjustment Workflow Service.

Enforces the complete immutable-ledger workflow:
  Count → Variance → Review → Approval → Adjustment Proposal
  → Authorization → Ledger Posting → Finalization

No direct stock mutations are permitted.  Every stage is audited and
attributed to a real actor.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import (
    GovernanceViolation,
    write_authority,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AdjustmentState(str, Enum):
    DRAFT = "DRAFT"
    PROPOSED = "PROPOSED"
    PENDING_AUTHORIZATION = "PENDING_AUTHORIZATION"
    AUTHORIZED = "AUTHORIZED"
    POSTED = "POSTED"
    FINALIZED = "FINALIZED"
    VOIDED = "VOIDED"
    ROLLED_BACK = "ROLLED_BACK"


# Allowed state transitions — plain string values so lookup is Python-version-safe.
# NOTE: PROPOSED is reserved for a future manager-review step between DRAFT and
# PENDING_AUTHORIZATION. No current code transitions into PROPOSED from DRAFT;
# it is kept here to avoid a GovernanceViolation if a future step is introduced.
_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"PENDING_AUTHORIZATION"},
    "PROPOSED": {"PENDING_AUTHORIZATION", "VOIDED"},
    "PENDING_AUTHORIZATION": {"AUTHORIZED", "VOIDED"},
    "AUTHORIZED": {"POSTED", "VOIDED"},
    "POSTED": {"FINALIZED", "ROLLED_BACK"},
    "FINALIZED": set(),
    "VOIDED": set(),
    "ROLLED_BACK": set(),
}


def _norm(state: Any) -> str:
    """Extract the plain string value from an enum or str."""
    return state.value if hasattr(state, "value") else str(state)


def _assert_transition(from_state: Any, to_state: Any) -> None:
    fs = _norm(from_state)
    ts = _norm(to_state)
    allowed = _TRANSITIONS.get(fs, set())
    if ts not in allowed:
        raise GovernanceViolation(
            f"Invalid adjustment transition: {fs} → {ts}. Allowed: {sorted(allowed) or 'none'}"
        )


class InventoryAdjustmentService:
    """
    Authoritative write-side service for inventory adjustments.

    All writes go through this service only — direct mutations are blocked
    by the governance guard.
    """

    def __init__(self, db: Any) -> None:
        self.db = db
        self.audit_service = GovernanceAuditService(db)

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority("InventoryAdjustmentService"):
            import inspect

            result = write_call()
            if inspect.isawaitable(result):
                return await result
            return result

    async def create_proposal(
        self,
        *,
        session_id: str,
        item_code: str,
        location_id: str,
        counted_qty: float,
        expected_qty: float,
        variance_reason: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Stage 1: Create an adjustment proposal from a counted variance.
        Actor must be authenticated with a real user context.
        """
        self._require_real_actor(actor)

        adjustment_id = str(uuid.uuid4())
        variance = counted_qty - expected_qty
        now = _utc_now()

        proposal: dict[str, Any] = {
            "id": adjustment_id,
            "session_id": session_id,
            "item_code": item_code,
            "location_id": location_id,
            "counted_qty": counted_qty,
            "expected_qty": expected_qty,
            "variance": variance,
            "variance_reason": variance_reason,
            "state": AdjustmentState.DRAFT,
            "actor_history": [
                {
                    "state": AdjustmentState.DRAFT,
                    "actor": actor,
                    "timestamp": now.isoformat(),
                }
            ],
            "created_by": actor.get("username"),
            "created_at": now,
            "updated_at": now,
        }

        await self._execute_authorized_write(
            lambda: self.db.inventory_adjustments.insert_one(proposal)
        )
        await self.audit_service.log_governance_event(
            event="ADJUSTMENT_DRAFT",
            operation="CREATE_PROPOSAL",
            session_id=session_id,
            actor=actor,
            item_id=item_code,
            location_id=location_id,
        )
        return {"id": adjustment_id, "state": AdjustmentState.DRAFT}

    async def submit_for_review(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        """Stage 2: Submit a draft proposal for supervisor review."""
        return await self._transition(
            adjustment_id,
            AdjustmentState.PENDING_AUTHORIZATION,
            actor,
            "SUBMIT_FOR_REVIEW",
        )

    async def authorize(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
        override_token: str,
    ) -> dict[str, Any]:
        """
        Stage 3: Supervisor authorizes the proposal.
        Requires a valid override token (FIX GROUP 7).
        """
        from backend.services.pin_auth_service import PINAuthService

        pin_service = PINAuthService(self.db)
        await pin_service.validate_override_token(
            token=override_token,
            user_id=str(actor.get("user_id") or actor.get("username") or ""),
            action="inventory_adjust",
        )
        return await self._transition(
            adjustment_id,
            AdjustmentState.AUTHORIZED,
            actor,
            "AUTHORIZE",
        )

    async def post_to_ledger(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Stage 4: Post the authorized adjustment to the immutable ledger.
        Writes a ledger entry — the original record is never mutated.
        """
        self._require_real_actor(actor)
        adjustment = await self._load_and_assert_state(adjustment_id, AdjustmentState.AUTHORIZED)
        now = _utc_now()
        ledger_entry: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "adjustment_id": adjustment_id,
            "session_id": adjustment["session_id"],
            "item_code": adjustment["item_code"],
            "location_id": adjustment["location_id"],
            "variance": adjustment["variance"],
            "posted_by": actor.get("username"),
            "posted_at": now,
        }
        await self._execute_authorized_write(
            lambda: self.db.inventory_ledger.insert_one(ledger_entry)
        )
        result = await self._transition(
            adjustment_id,
            AdjustmentState.POSTED,
            actor,
            "POST_TO_LEDGER",
        )
        await self.audit_service.log_governance_event(
            event="ADJUSTMENT_POSTED",
            operation="POST_TO_LEDGER",
            session_id=adjustment["session_id"],
            actor=actor,
            item_id=adjustment["item_code"],
            location_id=adjustment["location_id"],
        )
        return result

    async def finalize(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
    ) -> dict[str, Any]:
        """Stage 5: Finalize — locks the adjustment permanently."""
        return await self._transition(
            adjustment_id,
            AdjustmentState.FINALIZED,
            actor,
            "FINALIZE",
        )

    async def void(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
        reason: str,
    ) -> dict[str, Any]:
        """Void an in-progress adjustment before it is posted."""
        return await self._transition(
            adjustment_id,
            AdjustmentState.VOIDED,
            actor,
            "VOID",
            extra={"void_reason": reason},
        )

    async def rollback(
        self,
        adjustment_id: str,
        actor: dict[str, Any],
        reason: str,
    ) -> dict[str, Any]:
        """
        Rollback a posted adjustment by creating a reversal ledger entry.
        The original ledger entry is never deleted.
        """
        self._require_real_actor(actor)
        adjustment = await self._load_and_assert_state(adjustment_id, AdjustmentState.POSTED)
        now = _utc_now()
        reversal: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "adjustment_id": adjustment_id,
            "session_id": adjustment["session_id"],
            "item_code": adjustment["item_code"],
            "location_id": adjustment["location_id"],
            "variance": -adjustment["variance"],
            "reversal_reason": reason,
            "reversed_by": actor.get("username"),
            "reversed_at": now,
        }
        await self._execute_authorized_write(lambda: self.db.inventory_ledger.insert_one(reversal))
        return await self._transition(
            adjustment_id,
            AdjustmentState.ROLLED_BACK,
            actor,
            "ROLLBACK",
            extra={"rollback_reason": reason},
        )

    # ------------------------------------------------------------------ #
    # Internal helpers                                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _require_real_actor(actor: dict[str, Any]) -> None:
        username = str(actor.get("username") or actor.get("user_id") or "").strip()
        if not username or username in {"system", "conflict_resolver"}:
            raise GovernanceViolation(
                "CRITICAL: inventory adjustment requires a real authenticated actor"
            )

    async def _load_and_assert_state(
        self,
        adjustment_id: str,
        expected_state: str,
    ) -> dict[str, Any]:
        doc = await self.db.inventory_adjustments.find_one({"id": adjustment_id})
        if not doc:
            raise GovernanceViolation(f"Adjustment not found: {adjustment_id}")
        current = _norm(doc.get("state") or "")
        if current != _norm(expected_state):
            raise GovernanceViolation(
                f"Adjustment {adjustment_id} is in state '{current}', expected '{expected_state}'"
            )
        return doc

    async def _transition(
        self,
        adjustment_id: str,
        to_state: str,
        actor: dict[str, Any],
        operation: str,
        extra: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        self._require_real_actor(actor)
        doc = await self.db.inventory_adjustments.find_one({"id": adjustment_id})
        if not doc:
            raise GovernanceViolation(f"Adjustment not found: {adjustment_id}")

        from_state = doc.get("state") or ""
        _assert_transition(from_state, to_state)

        ts = _norm(to_state)
        now = _utc_now()
        history_entry = {
            "state": ts,
            "actor": actor,
            "timestamp": now.isoformat(),
        }
        update: dict[str, Any] = {
            "state": ts,
            "updated_at": now,
            f"{ts.lower()}_by": actor.get("username"),
            f"{ts.lower()}_at": now,
        }
        if extra:
            update.update(extra)

        await self._execute_authorized_write(
            lambda: self.db.inventory_adjustments.update_one(
                {"id": adjustment_id},
                {
                    "$set": update,
                    "$push": {"actor_history": history_entry},
                },
            )
        )
        await self.audit_service.log_governance_event(
            event=f"ADJUSTMENT_{to_state}",
            operation=operation,
            session_id=str(doc.get("session_id") or ""),
            actor=actor,
            item_id=str(doc.get("item_code") or ""),
            location_id=str(doc.get("location_id") or ""),
        )
        return {"id": adjustment_id, "state": to_state}
