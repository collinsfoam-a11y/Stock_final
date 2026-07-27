from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from backend.models.physical_batch import (
    PhysicalBatch,
    PhysicalBatchQuantities,
    PhysicalBatchStatus,
)
from backend.services.concurrency import ConcurrencyError
from backend.services.physical_batch_service import (
    PhysicalBatchError,
    PhysicalBatchService,
    normalize_batch_number,
    physical_batch_id,
)


def test_batch_identity_is_normalized_and_stable():
    assert normalize_batch_number(" lot 01 ") == "LOT01"
    assert physical_batch_id("item-1", " lot 01 ") == physical_batch_id(
        "item-1", "LOT01"
    )
    assert physical_batch_id("item-1", "LOT01") != physical_batch_id("item-2", "LOT01")


def test_quantity_and_lifecycle_invariants_are_enforced():
    with pytest.raises(ValidationError, match="cannot exceed"):
        PhysicalBatchQuantities(on_hand=4, damaged=3, reserved=2)
    with pytest.raises(ValidationError, match="zero on-hand"):
        PhysicalBatch(
            id="batch-1",
            item_identity_id="item-1",
            batch_number="B1",
            normalized_batch_number="B1",
            status=PhysicalBatchStatus.DEPLETED,
            quantities=PhysicalBatchQuantities(on_hand=1),
        )


@pytest.mark.asyncio
async def test_create_requires_canonical_item_and_active_location():
    db = MagicMock()
    db.inventory_identities.find_one = AsyncMock(return_value={"id": "item-1"})
    db.locations.find_one = AsyncMock(return_value=None)
    service = PhysicalBatchService(db)

    with pytest.raises(PhysicalBatchError, match="active location"):
        await service.create(
            item_identity_id="item-1",
            batch_number="B1",
            location_id="missing",
            quantities=PhysicalBatchQuantities(on_hand=1),
            actor="admin",
            change_reference="CHG-1",
        )


@pytest.mark.asyncio
async def test_update_uses_optimistic_concurrency():
    db = MagicMock()
    batch = {
        "id": "batch-1",
        "item_identity_id": "item-1",
        "batch_number": "B1",
        "normalized_batch_number": "B1",
        "status": "ACTIVE",
        "quantities": {"on_hand": 2, "damaged": 0, "reserved": 0},
        "version": 3,
        "active": True,
    }
    db.physical_batches.find_one = AsyncMock(return_value=batch)
    db.physical_batches.update_one = AsyncMock(return_value=MagicMock(modified_count=0))
    service = PhysicalBatchService(db)

    with pytest.raises(ConcurrencyError, match="version mismatch"):
        await service.update(
            "batch-1",
            expected_version=2,
            actor="admin",
            change_reference="CHG-2",
            quantities=PhysicalBatchQuantities(on_hand=3),
        )
    update_filter = db.physical_batches.update_one.await_args.args[0]
    assert {"version": 2} in update_filter["$and"]


@pytest.mark.asyncio
async def test_closed_batch_is_immutable_and_depletion_requires_zero_quantity():
    db = MagicMock()
    service = PhysicalBatchService(db)
    active = {
        "id": "batch-1",
        "item_identity_id": "item-1",
        "batch_number": "B1",
        "normalized_batch_number": "B1",
        "status": "ACTIVE",
        "quantities": {"on_hand": 2, "damaged": 0, "reserved": 0},
        "version": 0,
        "active": True,
    }
    db.physical_batches.find_one = AsyncMock(return_value=active)
    with pytest.raises(PhysicalBatchError, match="zero on-hand"):
        await service.update(
            "batch-1",
            expected_version=0,
            actor="admin",
            change_reference="CHG-3",
            status=PhysicalBatchStatus.DEPLETED,
        )

    closed = {**active, "status": "CLOSED", "active": False}
    db.physical_batches.find_one = AsyncMock(return_value=closed)
    with pytest.raises(PhysicalBatchError, match="immutable"):
        await service.update(
            "batch-1",
            expected_version=0,
            actor="admin",
            change_reference="CHG-4",
            quantities=PhysicalBatchQuantities(on_hand=0),
        )
