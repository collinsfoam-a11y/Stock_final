from __future__ import annotations

from datetime import datetime, timezone

import pytest
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import install_db_write_guards
from backend.services.unknown_item_service import UnknownItemService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(db: InMemoryDatabase, session_id: str = "sess-unknown") -> None:
    now = _utc_now()
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "version": 0,
            "location_id": "LOC-1",
            "floor_id": "F1",
            "rack_id": "R1",
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await db.verification_sessions.insert_one(
        {"session_id": session_id, "status": "ACTIVE", "last_heartbeat": now}
    )
    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash:{session_id}",
            "item_count": 0,
            "items": [],
        }
    )


@pytest.mark.asyncio
async def test_register_unknown_item_sets_defaults_and_audit_fields():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-register")
    install_db_write_guards(db)
    service = UnknownItemService(db)

    created = await service.register_unknown_item(
        payload={
            "session_id": "sess-register",
            "location_id": "LOC-1",
            "floor_id": "F1",
            "rack_id": "R1",
            "barcode": "510001",
        },
        actor_id="staff1",
    )

    stored = await db.unknown_items.find_one({"id": created["id"]})
    assert stored is not None
    assert stored["counted_qty"] == 1.0
    assert stored["reported_by"] == "staff1"
    assert stored["status"] == "OPEN"
    assert stored["version"] == 1
    assert stored["floor_no"] == "F1"
    assert stored["rack_no"] == "R1"

    audit_events = await db.audit_logs.find({"event_type": "UNKNOWN_ITEM_REPORTED"}).to_list(None)
    assert len(audit_events) == 1
    assert audit_events[0]["entity_id"] == created["id"]
    assert audit_events[0]["actor_username"] == "staff1"


@pytest.mark.asyncio
async def test_dismiss_unknown_item_writes_canonical_audit_event():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-dismiss")
    await db.unknown_items.insert_one(
        {
            "id": "unknown-dismiss",
            "session_id": "sess-dismiss",
            "location_id": "LOC-1",
            "barcode": "510001",
            "status": "OPEN",
            "version": 1,
        }
    )
    install_db_write_guards(db)
    service = UnknownItemService(db)

    await service.dismiss_unknown_item(
        item_id="unknown-dismiss", actor_id="supervisor1", reason="Wrong barcode label"
    )

    audit_events = await db.audit_logs.find({"event_type": "UNKNOWN_ITEM_DISMISSED"}).to_list(None)
    assert len(audit_events) == 1
    assert audit_events[0]["entity_id"] == "unknown-dismiss"
    assert audit_events[0]["actor_username"] == "supervisor1"
    assert audit_events[0]["details"]["reason"] == "Wrong barcode label"


@pytest.mark.asyncio
async def test_create_manual_sku_and_resolve_rolls_back_insert_on_failure(monkeypatch):
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-sku")
    await db.unknown_items.insert_one(
        {
            "id": "unknown-1",
            "session_id": "sess-sku",
            "location_id": "LOC-1",
            "floor_id": "F1",
            "rack_id": "R1",
            "floor_no": "F1",
            "rack_no": "R1",
            "barcode": "510001",
            "counted_qty": 1.0,
            "reported_by": "staff1",
            "reported_at": _utc_now(),
            "status": "OPEN",
            "version": 1,
        }
    )
    install_db_write_guards(db)
    service = UnknownItemService(db)

    async def _boom(self, payload, context=None):
        raise RuntimeError("forced-count-line-failure")

    monkeypatch.setattr(CountLineWriteService, "process_write", _boom)

    with pytest.raises(RuntimeError, match="forced-count-line-failure"):
        await service.create_manual_sku_and_resolve(
            item_id="unknown-1",
            item_code="SKU-1",
            item_name="Widget",
            category="General",
            subcategory="Tools",
            mrp=10.0,
            uom_code="PCS",
            actor_id="admin1",
            resolve_notes="map after create",
        )

    assert await db.erp_items.count_documents({"item_code": "SKU-1"}) == 0
    assert await db.count_lines.count_documents({}) == 0
    unknown = await db.unknown_items.find_one({"id": "unknown-1"})
    assert unknown["status"] == "OPEN"
    assert unknown["version"] == 1
