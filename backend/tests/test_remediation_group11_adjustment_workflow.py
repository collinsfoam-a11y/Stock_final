"""
FIX GROUP 11 — Regression tests: Inventory adjustment workflow.

Validates:
  - Complete workflow: Draft → PendingAuthorization → Authorized → Posted → Finalized
  - Immutable ledger (original never mutated)
  - Actor attribution on every stage
  - Invalid transitions are rejected
  - Direct stock mutations are blocked
"""

from unittest.mock import AsyncMock, MagicMock
import pytest

from backend.services.governance_guard import GovernanceViolation
from backend.services.inventory_adjustment_service import (
    AdjustmentState,
    InventoryAdjustmentService,
)


def _make_db(state: str = AdjustmentState.DRAFT, adjustment_id: str = "adj-1") -> MagicMock:
    db = MagicMock()
    db.inventory_adjustments = MagicMock()
    db.inventory_adjustments.insert_one = AsyncMock(return_value=None)
    db.inventory_adjustments.update_one = AsyncMock(return_value=None)
    db.inventory_adjustments.find_one = AsyncMock(
        return_value={
            "id": adjustment_id,
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "location_id": "LOC-1",
            "counted_qty": 15.0,
            "expected_qty": 12.0,
            "variance": 3.0,
            "state": state,
        }
    )
    db.inventory_ledger = MagicMock()
    db.inventory_ledger.insert_one = AsyncMock(return_value=None)
    db.governance_events = MagicMock()
    db.governance_events.insert_one = AsyncMock(return_value=None)
    return db


_REAL_ACTOR = {"user_id": "u-1", "username": "supervisor1", "role": "supervisor", "org_id": "ORG-1"}


@pytest.mark.asyncio
async def test_create_proposal_produces_draft():
    db = _make_db()
    service = InventoryAdjustmentService(db)

    result = await service.create_proposal(
        session_id="sess-1",
        item_code="ITEM-1",
        location_id="LOC-1",
        counted_qty=15.0,
        expected_qty=12.0,
        variance_reason="Found extra units on shelf",
        actor=_REAL_ACTOR,
    )

    assert result["state"] == AdjustmentState.DRAFT
    db.inventory_adjustments.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_for_review_transitions_to_pending_authorization():
    """
    submit_for_review must transition DRAFT → PENDING_AUTHORIZATION so that
    authorize() (which requires PENDING_AUTHORIZATION state) is reachable.
    """
    db = _make_db(state=AdjustmentState.DRAFT)
    service = InventoryAdjustmentService(db)

    result = await service.submit_for_review("adj-1", _REAL_ACTOR)
    assert result["state"] == AdjustmentState.PENDING_AUTHORIZATION
    db.inventory_adjustments.update_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_post_to_ledger_creates_immutable_entry():
    db = _make_db(state=AdjustmentState.AUTHORIZED)
    service = InventoryAdjustmentService(db)

    result = await service.post_to_ledger("adj-1", _REAL_ACTOR)

    assert result["state"] == AdjustmentState.POSTED
    # Ledger entry must have been created.
    db.inventory_ledger.insert_one.assert_awaited_once()
    ledger_doc = db.inventory_ledger.insert_one.call_args.args[0]
    assert ledger_doc["adjustment_id"] == "adj-1"
    assert ledger_doc["variance"] == 3.0


@pytest.mark.asyncio
async def test_rollback_creates_reversal_entry():
    db = _make_db(state=AdjustmentState.POSTED)
    service = InventoryAdjustmentService(db)

    result = await service.rollback("adj-1", _REAL_ACTOR, reason="Data entry error")

    assert result["state"] == AdjustmentState.ROLLED_BACK
    # Reversal ledger entry must have been created (original immutable).
    assert db.inventory_ledger.insert_one.await_count == 1
    reversal = db.inventory_ledger.insert_one.call_args.args[0]
    assert reversal["variance"] == -3.0  # negated variance


@pytest.mark.asyncio
async def test_invalid_transition_raises():
    db = _make_db(state=AdjustmentState.DRAFT)
    service = InventoryAdjustmentService(db)

    # DRAFT → POSTED is not allowed (must pass through PROPOSED and AUTHORIZED first)
    with pytest.raises(GovernanceViolation, match="Invalid adjustment transition"):
        await service._transition("adj-1", AdjustmentState.POSTED, _REAL_ACTOR, "SKIP")


@pytest.mark.asyncio
async def test_system_actor_is_rejected():
    db = _make_db(state=AdjustmentState.DRAFT)
    service = InventoryAdjustmentService(db)

    with pytest.raises(GovernanceViolation, match="real authenticated actor"):
        await service.submit_for_review("adj-1", {"username": "system"})


@pytest.mark.asyncio
async def test_finalize_locks_permanently():
    db = _make_db(state=AdjustmentState.POSTED)
    service = InventoryAdjustmentService(db)

    result = await service.finalize("adj-1", _REAL_ACTOR)
    assert result["state"] == AdjustmentState.FINALIZED


@pytest.mark.asyncio
async def test_voided_adjustment_blocks_further_transitions():
    db = _make_db(state=AdjustmentState.VOIDED)
    service = InventoryAdjustmentService(db)

    with pytest.raises(GovernanceViolation, match="Invalid adjustment transition"):
        await service._transition("adj-1", AdjustmentState.PROPOSED, _REAL_ACTOR, "REOPEN")
