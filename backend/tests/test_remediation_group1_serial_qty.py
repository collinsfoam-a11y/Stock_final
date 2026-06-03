"""
FIX GROUP 1 — Regression tests: Serial-item offline sync quantity integrity.

Ensures that counted_qty always equals len(serial_numbers) for serial items,
preventing client-side inflation from corrupting inventory balances.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.api.sync_batch_api import SyncRecord, sync_single_record


def _make_db(session_id: str, item_code: str) -> MagicMock:
    db = MagicMock()
    db.sessions.find_one = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "warehouse": "WH1",
            "staff_user": "staff1",
        }
    )
    db.session_snapshots.find_one = AsyncMock(
        return_value={
            "session_id": session_id,
            "snapshot_hash": "hash-abc",
            "items": [{"item_code": item_code, "stock_qty": 0.0}],
        }
    )
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.erp_items.find_one = AsyncMock(return_value={"item_code": item_code, "stock_qty": 0.0})
    db.idempotency_operations.find_one = AsyncMock(return_value=None)
    return db


def _make_record(
    session_id: str,
    item_code: str,
    verified_qty: float,
    serials: list[str],
    client_record_id: str = None,
) -> SyncRecord:
    return SyncRecord(
        client_record_id=client_record_id or f"rec-{uuid.uuid4()}",
        session_id=session_id,
        location_id="LOC-1",
        floor_id="F1",
        rack_id="R1",
        item_code=item_code,
        verified_qty=verified_qty,
        serial_numbers=serials,
        created_at="2024-01-01T10:00:00Z",
        updated_at="2024-01-01T10:00:00Z",
    )


@pytest.mark.asyncio
async def test_scenario_a_one_serial_yields_qty_one():
    """Scenario A: 1 serial scanned → counted_qty must be 1."""
    session_id = str(uuid.uuid4())
    db = _make_db(session_id, "ITEM-A")

    captured_docs: list[dict] = []

    class CapturingWriteService:
        async def process_write(self, payload, context=None):
            captured_docs.append(payload.get("document", {}))

    from backend.services.session_lifecycle_service import SessionLifecycleService

    with (
        patch(
            "backend.api.sync_batch_api.CountLineWriteService",
            return_value=CapturingWriteService(),
        ),
        patch(
            "backend.api.sync_batch_api.SessionLifecycleService",
            return_value=SessionLifecycleService.__new__(SessionLifecycleService),
        ),
    ):
        from backend.services.session_lifecycle_service import SessionLifecycleService as SLS

        sls = SLS.__new__(SLS)
        sls.db = db
        sls.ensure_session_active = AsyncMock(
            return_value={
                "id": session_id,
                "session_id": session_id,
                "status": "ACTIVE",
                "staff_user": "staff1",
            }
        )

        record = _make_record(session_id, "ITEM-A", verified_qty=999.0, serials=["SN-001"])

        ok, err = await sync_single_record(
            record,
            db,
            "staff1",
            write_service=CapturingWriteService(),
            lifecycle_service=sls,
        )

    assert ok, f"Expected success, got error: {err}"
    assert len(captured_docs) == 1
    assert captured_docs[0]["counted_qty"] == 1.0, (
        f"Expected counted_qty=1.0 (serial count), got {captured_docs[0]['counted_qty']}"
    )


@pytest.mark.asyncio
async def test_scenario_b_ten_serials_yields_qty_ten():
    """Scenario B: 10 serials scanned → counted_qty must be 10."""
    session_id = str(uuid.uuid4())
    db = _make_db(session_id, "ITEM-B")
    serials = [f"SN-{i:03d}" for i in range(10)]

    captured_docs: list[dict] = []

    class CapturingWriteService:
        async def process_write(self, payload, context=None):
            captured_docs.append(payload.get("document", {}))

    from backend.services.session_lifecycle_service import SessionLifecycleService as SLS

    sls = SLS.__new__(SLS)
    sls.db = db
    sls.ensure_session_active = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "staff_user": "staff1",
        }
    )

    record = _make_record(session_id, "ITEM-B", verified_qty=50.0, serials=serials)
    ok, err = await sync_single_record(
        record,
        db,
        "staff1",
        write_service=CapturingWriteService(),
        lifecycle_service=sls,
    )

    assert ok, f"Expected success, got error: {err}"
    assert len(captured_docs) == 1
    assert captured_docs[0]["counted_qty"] == 10.0, (
        f"Expected counted_qty=10.0, got {captured_docs[0]['counted_qty']}"
    )


@pytest.mark.asyncio
async def test_scenario_c_resync_same_payload_idempotent():
    """Scenario C: Resyncing the same payload must not change the result."""
    session_id = str(uuid.uuid4())
    client_record_id = f"rec-{uuid.uuid4()}"
    db = _make_db(session_id, "ITEM-C")

    # Simulate that idempotency record already exists on second sync.
    db.count_lines.find_one = AsyncMock(
        return_value={
            "session_id": session_id,
            "idempotency_key": client_record_id,
            "counted_qty": 3.0,
        }
    )

    captured_docs: list[dict] = []

    class CapturingWriteService:
        async def process_write(self, payload, context=None):
            captured_docs.append(payload.get("document", {}))

    from backend.services.session_lifecycle_service import SessionLifecycleService as SLS

    sls = SLS.__new__(SLS)
    sls.db = db
    sls.ensure_session_active = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "staff_user": "staff1",
        }
    )

    record = _make_record(
        session_id,
        "ITEM-C",
        verified_qty=999.0,
        serials=["SN-X", "SN-Y", "SN-Z"],
        client_record_id=client_record_id,
    )
    ok, err = await sync_single_record(
        record,
        db,
        "staff1",
        write_service=CapturingWriteService(),
        lifecycle_service=sls,
    )

    assert ok, f"Expected idempotent success, got error: {err}"
    # No new write must have been issued — idempotency guard fired.
    assert len(captured_docs) == 0


@pytest.mark.asyncio
async def test_no_serials_preserves_verified_qty():
    """Non-serial items use verified_qty as-is (no inflation)."""
    session_id = str(uuid.uuid4())
    db = _make_db(session_id, "ITEM-D")

    captured_docs: list[dict] = []

    class CapturingWriteService:
        async def process_write(self, payload, context=None):
            captured_docs.append(payload.get("document", {}))

    from backend.services.session_lifecycle_service import SessionLifecycleService as SLS

    sls = SLS.__new__(SLS)
    sls.db = db
    sls.ensure_session_active = AsyncMock(
        return_value={
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "staff_user": "staff1",
        }
    )

    record = _make_record(session_id, "ITEM-D", verified_qty=42.0, serials=[])
    ok, err = await sync_single_record(
        record,
        db,
        "staff1",
        write_service=CapturingWriteService(),
        lifecycle_service=sls,
    )

    assert ok, f"Expected success, got error: {err}"
    assert len(captured_docs) == 1
    assert captured_docs[0]["counted_qty"] == 42.0
