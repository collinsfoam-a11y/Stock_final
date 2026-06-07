from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.db.indexes import INDEXES
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(db: InMemoryDatabase, session_id: str) -> None:
    now = _utc_now()
    session = {
        "id": session_id,
        "session_id": session_id,
        "status": "ACTIVE",
        "version": 0,
        "location_id": "LOC-1",
        "floor_id": "FLOOR-1",
        "rack_id": "RACK-1",
        "started_at": now,
        "last_heartbeat": now,
    }
    await db.sessions.insert_one(session)
    await db.verification_sessions.insert_one(
        {"session_id": session_id, "status": "ACTIVE", "last_heartbeat": now}
    )


async def _seed_snapshot(
    db: InMemoryDatabase,
    session_id: str,
    *,
    item_code: str,
    stock_qty: float,
) -> None:
    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash:{session_id}:{item_code}",
            "item_count": 1,
            "items": [{"item_code": item_code, "stock_qty": stock_qty}],
        }
    )


async def _seed_item(
    db: InMemoryDatabase,
    *,
    item_code: str,
    uom_code: str = "NOS",
    allow_fraction: bool = False,
    uom_precision: int = 0,
    is_serialized: bool = False,
) -> None:
    await db.erp_items.insert_one(
        {
            "item_code": item_code,
            "item_name": item_code,
            "uom_code": uom_code,
            "base_uom": uom_code,
            "allow_fraction": allow_fraction,
            "uom_precision": uom_precision,
            "is_serialized": is_serialized,
            "last_cost": 1,
        }
    )


def _line(
    *,
    line_id: str,
    session_id: str,
    item_code: str,
    counted_qty: float,
    idempotency_key: str,
    barcode: str | None = None,
    serial_numbers: list[str] | None = None,
) -> dict:
    now = _utc_now()
    return {
        "id": line_id,
        "session_id": session_id,
        "location_id": "LOC-1",
        "floor_id": "FLOOR-1",
        "rack_id": "RACK-1",
        "floor_no": "FLOOR-1",
        "rack_no": "RACK-1",
        "item_code": item_code,
        "barcode": barcode,
        "counted_qty": counted_qty,
        "serial_numbers": serial_numbers or [],
        "idempotency_key": idempotency_key,
        "counted_at": now,
        "updated_at": now,
        "version": 1,
        "previous_version_id": None,
        "recount_of_id": None,
    }


@pytest.mark.asyncio
async def test_canonical_count_line_insert_emits_detailed_scan_added_event():
    db = InMemoryDatabase()
    session_id = "sess-event-1"
    item_code = "ITEM-EVENT"
    await _seed_active_session(db, session_id)
    await _seed_snapshot(db, session_id, item_code=item_code, stock_qty=2)
    await _seed_item(db, item_code=item_code)
    service = CountLineWriteService(db)

    await service.process_write(
        {
            "operation": "insert_one",
            "document": _line(
                line_id="line-event-1",
                session_id=session_id,
                item_code=item_code,
                counted_qty=2,
                idempotency_key="idem-event-1",
                barcode="8901234567890",
            ),
        },
        context={
            "username": "staff-1",
            "user_id": "user-1",
            "device_id": "device-1",
            "enforce_snapshot": False,
        },
    )

    event = await db.event_log.find_one({"event_type": "SCAN_ADDED"})
    projection = await db.session_dashboard_projection.find_one({"session_id": session_id})

    assert event is not None
    assert projection is not None
    assert event["payload"]["session_id"] == session_id
    assert event["payload"]["count_line"]["item_code"] == item_code
    assert event["payload"]["count_line"]["barcode"] == "8901234567890"
    assert event["payload"]["count_line"]["counted_qty"] == pytest.approx(2)
    assert event["payload"]["count_line"]["location_id"] == "LOC-1"
    assert event["payload"]["count_line"]["floor_id"] == "FLOOR-1"
    assert event["payload"]["count_line"]["rack_id"] == "RACK-1"
    assert event["metadata"]["user_id"] == "staff-1"
    assert event["metadata"]["device_id"] == "device-1"
    assert event["metadata"]["request_idempotency_key"] == "idem-event-1"
    assert event.get("scan_fingerprint")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("item_code", "item_kwargs", "line_kwargs", "expected_error"),
    [
        (
            "ITEM-FRACTION",
            {"uom_code": "NOS", "allow_fraction": False, "uom_precision": 0},
            {"counted_qty": 1.5},
            "FRACTION_NOT_ALLOWED",
        ),
        (
            "ITEM-PRECISION",
            {"uom_code": "KG", "allow_fraction": True, "uom_precision": 2},
            {"counted_qty": 1.234},
            "PRECISION_EXCEEDED",
        ),
        (
            "ITEM-SERIAL",
            {"uom_code": "NOS", "allow_fraction": False, "uom_precision": 0, "is_serialized": True},
            {"counted_qty": 2, "serial_numbers": ["SN-1"]},
            "SERIAL_QTY_MISMATCH",
        ),
    ],
)
async def test_invalid_uom_and_serial_writes_raise_before_count_line_persistence(
    item_code: str,
    item_kwargs: dict,
    line_kwargs: dict,
    expected_error: str,
):
    db = InMemoryDatabase()
    session_id = f"sess-{item_code.lower()}"
    await _seed_active_session(db, session_id)
    await _seed_snapshot(db, session_id, item_code=item_code, stock_qty=line_kwargs["counted_qty"])
    await _seed_item(db, item_code=item_code, **item_kwargs)
    service = CountLineWriteService(db)

    with pytest.raises(GovernanceViolation, match=expected_error):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _line(
                    line_id=f"line-{item_code.lower()}",
                    session_id=session_id,
                    item_code=item_code,
                    idempotency_key=f"idem-{item_code.lower()}",
                    **line_kwargs,
                ),
            },
            context={"username": "staff-1", "enforce_snapshot": False},
        )

    assert await db.count_lines.count_documents({}) == 0
    assert await db.event_log.count_documents({"event_type": "SCAN_ADDED"}) == 0


@pytest.mark.asyncio
async def test_same_idempotency_key_allowed_across_sessions_but_rejected_within_session():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-idem-1")
    await _seed_active_session(db, "sess-idem-2")
    await _seed_snapshot(db, "sess-idem-1", item_code="ITEM-IDEM-1", stock_qty=1)
    await _seed_snapshot(db, "sess-idem-2", item_code="ITEM-IDEM-2", stock_qty=1)
    await _seed_item(db, item_code="ITEM-IDEM-1")
    await _seed_item(db, item_code="ITEM-IDEM-2")
    service = CountLineWriteService(db)

    for session_id, item_code in (("sess-idem-1", "ITEM-IDEM-1"), ("sess-idem-2", "ITEM-IDEM-2")):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _line(
                    line_id=f"line-{session_id}",
                    session_id=session_id,
                    item_code=item_code,
                    counted_qty=1,
                    idempotency_key="shared-idem-key",
                ),
            },
            context={"username": "staff-1", "enforce_snapshot": False},
        )

    with pytest.raises(GovernanceViolation, match="Duplicate idempotency_key"):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _line(
                    line_id="line-sess-idem-1-dup",
                    session_id="sess-idem-1",
                    item_code="ITEM-IDEM-1",
                    counted_qty=1,
                    idempotency_key="shared-idem-key",
                ),
            },
            context={"username": "staff-1", "enforce_snapshot": False},
        )

    assert await db.count_lines.count_documents({}) == 2


def test_count_line_idempotency_index_is_scoped_by_session_id():
    idempotency_indexes = [
        (fields, options)
        for fields, options in INDEXES["count_lines"]
        if options.get("name") == "idx_count_line_idempotency"
    ]

    assert idempotency_indexes == [
        (
            [("session_id", 1), ("idempotency_key", 1)],
            {
                "name": "idx_count_line_idempotency",
                "unique": True,
                "partialFilterExpression": {
                    "session_id": {"$exists": True},
                    "idempotency_key": {"$exists": True},
                },
            },
        )
    ]
