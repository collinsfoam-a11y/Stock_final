"""
FIX GROUP 6 — Regression tests: Governance guard coverage.

Ensures that all critical collections are protected and direct writes
are blocked unless an authorized service context is active.
"""

from unittest.mock import MagicMock

import pytest

from backend.services.governance_guard import (
    _GUARD_TARGET_COLLECTIONS,
    AUTHORIZED_WRITE_AUTHORITIES,
    GovernanceViolation,
    GovernedCollection,
    write_authority,
)


def test_all_required_collections_are_guarded():
    required = {
        "count_lines",
        "sessions",
        "verification_sessions",
        "recount_requests",
        "session_snapshots",
        "unknown_items",
        "inventory_adjustments",
        "inventory_ledger",
        "inventory_movements",
        "reconciliation_records",
    }
    missing = required - set(_GUARD_TARGET_COLLECTIONS)
    assert not missing, f"Missing governance guard on: {missing}"


@pytest.mark.asyncio
async def test_direct_write_without_authority_raises():
    collection = MagicMock()
    governed = GovernedCollection("count_lines", collection)

    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await governed.insert_one({"item_code": "X"})


@pytest.mark.asyncio
async def test_write_with_correct_authority_passes():
    collection = MagicMock()
    collection.insert_one = MagicMock(return_value=MagicMock(inserted_id="abc"))
    governed = GovernedCollection("count_lines", collection)

    with write_authority("CountLineWriteService"):
        result = await governed.insert_one({"item_code": "X"})

    assert result is not None


@pytest.mark.asyncio
async def test_write_with_wrong_authority_raises():
    collection = MagicMock()
    governed = GovernedCollection("count_lines", collection)

    with pytest.raises(GovernanceViolation), write_authority("SessionLifecycleService"):
        await governed.insert_one({"item_code": "X"})


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method_name",
    [
        "update_one",
        "update_many",
        "replace_one",
        "delete_one",
        "delete_many",
        "bulk_write",
        "find_one_and_update",
        "find_one_and_replace",
        "find_one_and_delete",
    ],
)
async def test_all_write_methods_are_guarded(method_name: str):
    collection = MagicMock()
    governed = GovernedCollection("sessions", collection)

    with pytest.raises(GovernanceViolation):
        method = getattr(governed, method_name)
        await method({})


def test_inventory_adjustment_service_has_authority():
    assert "InventoryAdjustmentService" in AUTHORIZED_WRITE_AUTHORITIES
    assert "inventory_adjustments" in AUTHORIZED_WRITE_AUTHORITIES["InventoryAdjustmentService"]
    assert "inventory_ledger" in AUTHORIZED_WRITE_AUTHORITIES["InventoryAdjustmentService"]


def test_reconciliation_service_has_authority():
    assert "ReconciliationService" in AUTHORIZED_WRITE_AUTHORITIES
    assert "reconciliation_records" in AUTHORIZED_WRITE_AUTHORITIES["ReconciliationService"]
