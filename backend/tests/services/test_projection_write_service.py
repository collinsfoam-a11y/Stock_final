from __future__ import annotations

from datetime import datetime, timezone

import pytest
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.projection_write_service import ProjectionWriteService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(db: InMemoryDatabase, session_id: str) -> None:
    now_dt = _utc_now()
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "version": 3,
            "warehouse": "WH-A",
            "staff_user": "staff1",
            "staff_name": "Staff One",
            "started_at": now_dt,
            "updated_at": now_dt,
            "location_id": "LOC-1",
            "floor_id": "FLOOR-1",
            "rack_id": "RACK-1",
        }
    )
    await db.verification_sessions.insert_one(
        {"session_id": session_id, "status": "ACTIVE", "last_heartbeat": now_dt}
    )


async def _seed_session_snapshot(
    db: InMemoryDatabase, session_id: str, *, item_code: str, stock_qty: float
) -> None:
    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash:{session_id}",
            "item_count": 1,
            "items": [{"item_code": item_code, "stock_qty": stock_qty}],
        }
    )


@pytest.mark.asyncio
async def test_projection_write_service_rebuilds_all_projection_collections():
    db = InMemoryDatabase()
    session_id = "sess-proj-1"
    await _seed_active_session(db, session_id)

    now_dt = _utc_now()
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "counted_qty": 10,
            "erp_qty": 8,
            "variance": 2,
            "mrp_erp": 5,
            "counted_at": now_dt,
            "status": "approved",
            "approval_status": "APPROVED",
            "verified": True,
            "damaged_qty": 1,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-2",
            "session_id": session_id,
            "item_code": "ITEM-2",
            "item_name": "Item 2",
            "counted_qty": 3,
            "erp_qty": 5,
            "variance": -2,
            "mrp_erp": 7,
            "counted_at": now_dt,
            "status": "pending",
            "approval_status": "PENDING",
            "verified": False,
            "damaged_qty": 0,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-archived",
            "session_id": session_id,
            "item_code": "ITEM-ARCHIVED",
            "item_name": "Archived item",
            "counted_qty": 999,
            "erp_qty": 0,
            "variance": 999,
            "mrp_erp": 99,
            "counted_at": now_dt,
            "status": "approved",
            "approval_status": "APPROVED",
            "verified": True,
            "archived": True,
            "archive_reason": "orphan_session",
        }
    )

    service = ProjectionWriteService(db)
    await service.sync_for_sessions(
        [session_id],
        trigger="test.sync",
        actor="tester",
        rebuild_item_projections=True,
    )

    session_projection = await db.session_dashboard_projection.find_one({"session_id": session_id})
    assert session_projection is not None
    assert session_projection["version"] == 3
    assert session_projection["total_items"] == 2
    assert session_projection["verified_items"] == 1
    assert session_projection["pending_items"] == 1
    assert session_projection["projection_version"] == "write.sync.v1"

    assert await db.verified_items_projection.count_documents({"session_id": session_id}) == 2
    assert await db.variance_summary_projection.count_documents({"session_id": session_id}) == 2

    financial_projection = await db.financial_projection.find_one({"session_id": session_id})
    assert financial_projection is not None
    assert financial_projection["overage_value"] == 10.0
    assert financial_projection["shortage_value"] == 14.0

    assert await db.event_log.count_documents({"session_id": session_id}) == 1


@pytest.mark.asyncio
async def test_count_line_write_service_syncs_projection_before_return():
    db = InMemoryDatabase()
    session_id = "sess-proj-2"
    await _seed_active_session(db, session_id)
    await _seed_session_snapshot(db, session_id, item_code="ITEM-W-1", stock_qty=4.0)

    write_service = CountLineWriteService(db)
    now_dt = _utc_now()
    await write_service.process_write(
        {
            "operation": "insert_one",
            "document": {
                "id": "line-w-1",
                "session_id": session_id,
                "location_id": "LOC-1",
                "floor_id": "FLOOR-1",
                "rack_id": "RACK-1",
                "floor_no": "FLOOR-1",
                "rack_no": "RACK-1",
                "item_code": "ITEM-W-1",
                "counted_qty": 4.0,
                "erp_qty": 4.0,
                "variance": 0.0,
                "idempotency_key": "idem-w-1",
                "counted_at": now_dt,
                "updated_at": now_dt,
                "version": 1,
                # Remark is mandatory for every count-line write (L04 tracking policy).
                "remark": "counted",
            },
        },
        context={"username": "tester", "enforce_snapshot": False},
    )

    session = await db.sessions.find_one({"id": session_id})
    session_projection = await db.session_dashboard_projection.find_one({"session_id": session_id})
    assert session is not None
    assert session_projection is not None
    assert session_projection["version"] == session["version"]
    assert session_projection["projection_version"] == "write.sync.v1"

    projected_line = await db.verified_items_projection.find_one(
        {"session_id": session_id, "count_line_id": "line-w-1"}
    )
    assert projected_line is not None
