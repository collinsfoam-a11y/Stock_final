from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.models.canonical_serial import SerialStatus
from backend.services.canonical_serial_service import (
    CanonicalSerialError,
    CanonicalSerialService,
    DuplicateSerialError,
    canonical_serial_id,
    normalize_serial,
)
from backend.services.concurrency import ConcurrencyError
from backend.services.governance_guard import install_db_write_guards
from backend.tests.utils.in_memory_db import InMemoryDatabase


def test_serial_normalization_and_identity_are_global_and_stable():
    assert normalize_serial(" sn 001 ") == "SN001"
    assert canonical_serial_id(" sn 001 ") == canonical_serial_id("SN001")


@pytest.mark.asyncio
async def test_register_writes_through_governed_service_with_initial_history():
    db = InMemoryDatabase()
    await db.inventory_identities.insert_one({"id": "item-1"})
    install_db_write_guards(db)
    document = await CanonicalSerialService(db).register(
        serial_number=" sn 001 ",
        item_identity_id="item-1",
        physical_batch_id=None,
        location_id=None,
        actor="admin",
        change_reference="CHG-0",
        source="SCAN",
    )
    assert document["normalized_serial"] == "SN001"
    assert document["history"][0]["to_status"] == "IN_STOCK"
    assert await db.canonical_serials.count_documents({}) == 1


@pytest.mark.asyncio
async def test_register_rejects_serial_owned_by_another_item():
    db = MagicMock()
    db.inventory_identities.find_one = AsyncMock(return_value={"id": "item-2"})
    db.canonical_serials.find_one = AsyncMock(
        return_value={"normalized_serial": "SN1", "item_identity_id": "item-1"}
    )
    service = CanonicalSerialService(db)
    with pytest.raises(DuplicateSerialError, match="another item or batch"):
        await service.register(
            serial_number="sn1",
            item_identity_id="item-2",
            physical_batch_id=None,
            location_id=None,
            actor="admin",
            change_reference="CHG-1",
            source="SCAN",
        )


@pytest.mark.asyncio
async def test_register_validates_batch_ownership():
    db = MagicMock()
    db.inventory_identities.find_one = AsyncMock(return_value={"id": "item-1"})
    db.physical_batches.find_one = AsyncMock(
        return_value={"id": "batch-1", "item_identity_id": "item-2"}
    )
    service = CanonicalSerialService(db)
    with pytest.raises(CanonicalSerialError, match="does not belong"):
        await service.register(
            serial_number="SN1",
            item_identity_id="item-1",
            physical_batch_id="batch-1",
            location_id=None,
            actor="admin",
            change_reference="CHG-2",
            source="IMPORT",
        )


@pytest.mark.asyncio
async def test_transition_appends_history_and_uses_optimistic_concurrency():
    db = MagicMock()
    before = {
        "id": "serial-1",
        "status": "IN_STOCK",
        "version": 2,
        "location_id": "loc-1",
    }
    db.canonical_serials.find_one = AsyncMock(return_value=before)
    db.canonical_serials.update_one = AsyncMock(
        return_value=MagicMock(modified_count=0)
    )
    service = CanonicalSerialService(db)
    with pytest.raises(ConcurrencyError, match="version mismatch"):
        await service.transition(
            "serial-1",
            status=SerialStatus.ALLOCATED,
            expected_version=1,
            actor="admin",
            change_reference="CHG-3",
        )
    query, update = db.canonical_serials.update_one.await_args.args
    assert {"version": 1} in query["$and"]
    assert update["$push"]["history"]["from_status"] == "IN_STOCK"
    assert update["$push"]["history"]["to_status"] == "ALLOCATED"


@pytest.mark.asyncio
async def test_retired_serial_cannot_transition():
    db = MagicMock()
    db.canonical_serials.find_one = AsyncMock(
        return_value={"id": "serial-1", "status": "RETIRED", "version": 4}
    )
    with pytest.raises(CanonicalSerialError, match="invalid serial transition"):
        await CanonicalSerialService(db).transition(
            "serial-1",
            status=SerialStatus.IN_STOCK,
            expected_version=4,
            actor="admin",
            change_reference="CHG-4",
        )


@pytest.mark.asyncio
async def test_import_reports_duplicate_input_without_attempting_second_write():
    service = CanonicalSerialService(MagicMock())
    service.register = AsyncMock(return_value={"id": "serial-1"})
    report = await service.import_serials(
        [
            {"serial_number": "SN 1", "item_identity_id": "item-1"},
            {"serial_number": "sn1", "item_identity_id": "item-1"},
        ],
        actor="admin",
        change_reference="CHG-5",
    )
    assert report["registered"] == 1
    assert report["failed"] == 1
    assert service.register.await_count == 1
