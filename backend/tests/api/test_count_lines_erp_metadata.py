"""
Tests for the BSR ERP-metadata traceability remediation:

- baseline_snapshot_id: stable identifier for the frozen session_snapshots
  document a count line's baseline was resolved against.
- erp_refreshed_at: transparency-only copy of erp_items.last_synced at the
  time the baseline/ERP item was resolved (never used for variance).
- uom_source: server-derived provenance of the persisted UOM
  (item_master | request_fallback | unknown -- erp_cache is never fabricated
  since no such distinct cache layer exists in this codebase).
- uom_resolved_at: server-generated, timezone-aware UTC timestamp for when
  UOM resolution ran; client input cannot influence it.

All four fields are additive (no existing field's behavior/type changes)
and derive from data already loaded during a normal write -- no new SQL
sync or extra query is triggered to populate them.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

from backend.api.count_lines_routes import create_count_line, create_count_lines_batch
from backend.api.count_lines_routes import CountLineBatchCreate
from backend.api.schemas import CountLineCreate
from backend.services.governance_guard import install_db_write_guards
from backend.services.validation_service import ValidationService
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "staff1", "role": "staff"}


async def _seed_active_session(
    db: InMemoryDatabase,
    session_id: str,
    item_code: str,
    *,
    snapshot_id: str = None,
    last_synced=None,
) -> None:
    await db.sessions.insert_one(
        {"id": session_id, "session_id": session_id, "status": "ACTIVE", "version": 0}
    )
    erp_item = {
        "item_code": item_code,
        "barcode": f"BC-{item_code}",
        "item_name": "Test Item",
        "stock_qty": 100.0,
        "mrp": 50.0,
    }
    if last_synced is not None:
        erp_item["last_synced"] = last_synced
    await db.erp_items.insert_one(erp_item)

    snapshot_doc = {
        "session_id": session_id,
        "snapshot_hash": f"hash-{session_id}",
        "items": [{"item_code": item_code, "stock_qty": 100.0}],
    }
    if snapshot_id is not None:
        snapshot_doc["id"] = snapshot_id
    await db.session_snapshots.insert_one(snapshot_doc)


def _line(
    *, session_id: str, item_code: str, idempotency_key: str, floor: str = "F1", rack: str = "R1", **overrides
) -> CountLineCreate:
    payload = {
        "session_id": session_id,
        "location_id": "LOC-1",
        "floor_id": floor,
        "rack_id": rack,
        "item_code": item_code,
        "idempotency_key": idempotency_key,
        "counted_qty": 100.0,
        "floor_no": floor,
        "rack_no": rack,
    }
    payload.update(overrides)
    return CountLineCreate(**payload)


@pytest.mark.asyncio
async def test_baseline_snapshot_id_persists_from_session_snapshots_document():
    """Requirement #1: baseline_snapshot_id comes from the frozen
    session_snapshots document's own `id` (matching how SessionSnapshot
    writes real production snapshots), not a fabricated value."""
    db = InMemoryDatabase()
    await _seed_active_session(
        db, "sess-meta-1", "ITEM-META1", snapshot_id="snap-fixed-id-1"
    )
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-1", item_code="ITEM-META1", idempotency_key="key-meta-1")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["baseline_snapshot_id"] == "snap-fixed-id-1"
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["baseline_snapshot_id"] == "snap-fixed-id-1"


@pytest.mark.asyncio
async def test_baseline_hash_unchanged_and_still_derives_from_frozen_snapshot():
    """Requirement #2: adding baseline_snapshot_id must not alter
    baseline_hash's own derivation (still the seeded snapshot_hash)."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-2", "ITEM-META2", snapshot_id="snap-fixed-id-2")
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-2", item_code="ITEM-META2", idempotency_key="key-meta-2")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["baseline_hash"] == "hash-sess-meta-2"
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["baseline_hash"] == "hash-sess-meta-2"
    assert persisted["baseline_snapshot_id"] == "snap-fixed-id-2"


@pytest.mark.asyncio
async def test_erp_refreshed_at_persists_from_erp_items_last_synced():
    """Requirement #3: erp_refreshed_at copies erp_items.last_synced
    verbatim -- transparency metadata only, never used for variance."""
    db = InMemoryDatabase()
    synced_at = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    await _seed_active_session(
        db, "sess-meta-3", "ITEM-META3", snapshot_id="snap-3", last_synced=synced_at
    )
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-3", item_code="ITEM-META3", idempotency_key="key-meta-3")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["erp_refreshed_at"] == synced_at
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["erp_refreshed_at"] == synced_at


@pytest.mark.asyncio
async def test_missing_erp_last_synced_does_not_crash_and_is_null():
    """Requirement #4: missing erp_items.last_synced must not crash the
    write and must not fabricate a value -- null/absent only."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-4", "ITEM-META4", snapshot_id="snap-4")
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-4", item_code="ITEM-META4", idempotency_key="key-meta-4")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["erp_refreshed_at"] is None
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["erp_refreshed_at"] is None


@pytest.mark.asyncio
async def test_uom_source_is_item_master_when_item_master_uom_exists():
    """Requirement #5: item master's own UOM is authoritative."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-5", "ITEM-META5", snapshot_id="snap-5")
    await db.erp_items.update_one(
        {"item_code": "ITEM-META5"}, {"$set": {"uom_code": "BOX", "uom_name": "Box"}}
    )
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-meta-5",
        item_code="ITEM-META5",
        idempotency_key="key-meta-5",
        input_uom="EACH",
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["uom_source"] == "item_master"
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["uom_source"] == "item_master"


@pytest.mark.asyncio
async def test_uom_source_is_request_fallback_when_item_master_lacks_uom():
    """Requirement #6: item master has no UOM of its own, but the request
    supplied one -- provenance must reflect the fallback, not fabricate
    an item_master source."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-6", "ITEM-META6", snapshot_id="snap-6")
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-meta-6",
        item_code="ITEM-META6",
        idempotency_key="key-meta-6",
        input_uom="BOX",
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["uom_source"] == "request_fallback"
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["uom_source"] == "request_fallback"


@pytest.mark.asyncio
async def test_uom_source_is_unknown_when_no_uom_resolves_anywhere():
    """Requirement #7: neither the item master nor the request has a UOM
    -- must not fabricate item_master or request_fallback."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-7", "ITEM-META7", snapshot_id="snap-7")
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-7", item_code="ITEM-META7", idempotency_key="key-meta-7")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["uom_source"] == "unknown"
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["uom_source"] == "unknown"


@pytest.mark.asyncio
async def test_uom_resolved_at_is_server_generated_timezone_aware_utc():
    """Requirement #8: uom_resolved_at is a real server timestamp, timezone
    aware and in UTC, generated fresh at resolution time -- not copied from
    any client-supplied value (CountLineCreate has no such field at all,
    so a client cannot influence it through the public API)."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-meta-8", "ITEM-META8", snapshot_id="snap-8")
    install_db_write_guards(db)

    before = datetime.now(timezone.utc)
    line_data = _line(session_id="sess-meta-8", item_code="ITEM-META8", idempotency_key="key-meta-8")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )
    after = datetime.now(timezone.utc)

    resolved_at = result["uom_resolved_at"]
    assert isinstance(resolved_at, datetime)
    assert resolved_at.tzinfo is not None
    assert before <= resolved_at <= after

    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["uom_resolved_at"] == resolved_at


def test_uom_resolved_at_and_uom_source_are_not_client_overridable():
    """Requirement #8 (server-side proof): even if a caller-controlled doc
    dict already carries a spoofed uom_source/uom_resolved_at (bypassing
    the public schema, which has no such input fields at all),
    normalize_quantity_for_item recomputes and overwrites both from
    server-side state on every call."""
    service = ValidationService(db=None)
    doc = {
        "counted_qty": 10,
        "uom_source": "item_master",  # attacker-controlled, should be ignored
        "uom_resolved_at": datetime(2000, 1, 1, tzinfo=timezone.utc),  # spoofed, ancient
    }
    item = {}  # no item-master UOM at all

    result = service.normalize_quantity_for_item(item=item, doc=doc)

    assert result["uom_source"] == "unknown"
    assert result["uom_resolved_at"] > datetime(2020, 1, 1, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_persisted_count_line_metadata_matches_api_response():
    """Requirement #9: all four new fields must be identical between the
    persisted document and what the API returns."""
    db = InMemoryDatabase()
    await _seed_active_session(
        db,
        "sess-meta-9",
        "ITEM-META9",
        snapshot_id="snap-9",
        last_synced=datetime(2026, 2, 2, tzinfo=timezone.utc),
    )
    await db.erp_items.update_one(
        {"item_code": "ITEM-META9"}, {"$set": {"uom_code": "BOX", "uom_name": "Box"}}
    )
    install_db_write_guards(db)

    line_data = _line(session_id="sess-meta-9", item_code="ITEM-META9", idempotency_key="key-meta-9")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    persisted = await db.count_lines.find_one({"id": result["id"]})
    for field in ("baseline_snapshot_id", "erp_refreshed_at", "uom_source", "uom_resolved_at"):
        assert persisted[field] == result[field], field


@pytest.mark.asyncio
async def test_batch_count_creation_receives_same_metadata():
    """Requirement #10: batch creation shares _prepare_and_persist_count_line
    with the single-submit endpoint, so it must receive identical metadata."""
    db = InMemoryDatabase()
    await _seed_active_session(
        db,
        "sess-meta-10",
        "ITEM-META10",
        snapshot_id="snap-10",
        last_synced=datetime(2026, 3, 3, tzinfo=timezone.utc),
    )
    await db.erp_items.update_one(
        {"item_code": "ITEM-META10"}, {"$set": {"uom_code": "BOX", "uom_name": "Box"}}
    )
    install_db_write_guards(db)

    batch_payload = CountLineBatchCreate(
        session_id="sess-meta-10",
        lines=[
            _line(
                session_id="sess-meta-10",
                item_code="ITEM-META10",
                idempotency_key="key-meta-10",
            )
        ],
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        response = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch_payload, current_user=CURRENT_USER
        )

    assert response["created"] == 1
    line_id = response["results"][0]["id"]
    persisted = await db.count_lines.find_one({"id": line_id})
    assert persisted["baseline_snapshot_id"] == "snap-10"
    assert persisted["erp_refreshed_at"] == datetime(2026, 3, 3, tzinfo=timezone.utc)
    assert persisted["uom_source"] == "item_master"
    assert isinstance(persisted["uom_resolved_at"], datetime)


@pytest.mark.asyncio
async def test_historical_count_lines_without_new_fields_read_safely():
    """Requirement #11: a historical count_line written before this change
    (no baseline_snapshot_id/erp_refreshed_at/uom_source/uom_resolved_at
    keys at all) must still be readable via the list endpoint without
    crashing, and must not have values fabricated for it."""
    from backend.api.count_lines_routes import list_count_lines

    db = InMemoryDatabase()
    await db.sessions.insert_one(
        {"id": "sess-meta-11", "session_id": "sess-meta-11", "status": "ACTIVE", "version": 0}
    )
    await db.count_lines.insert_one(
        {
            "id": "legacy-line-1",
            "session_id": "sess-meta-11",
            "item_code": "ITEM-LEGACY",
            "counted_qty": 5.0,
            "erp_qty": 5.0,
            "baseline_hash": "legacy-hash",
            "status": "PENDING",
            "approval_status": "PENDING",
            "counted_at": datetime(2020, 1, 1),
        }
    )

    with patch("backend.api.count_lines_routes._get_db_client", return_value=db):
        response = await list_count_lines(
            current_user=CURRENT_USER,
            session_id="sess-meta-11",
            item_code=None,
            page=1,
            page_size=50,
            limit=None,
        )

    assert response["pagination"]["total"] == 1
    line = response["items"][0]
    assert line["id"] == "legacy-line-1"
    assert line.get("baseline_snapshot_id") is None
    assert line.get("erp_refreshed_at") is None
    assert line.get("uom_source") is None
    assert line.get("uom_resolved_at") is None
