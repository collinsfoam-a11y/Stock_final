from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.count_lines_routes import (
    CountLineMergeRequest,
    _persist_count_line_document,
    merge_count_lines,
)
from backend.api.schemas import CountLineCreate
from backend.services.concurrency import ConcurrencyError
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(
    db: InMemoryDatabase,
    session_id: str = "sess-1",
    *,
    version: int = 0,
) -> None:
    now = _utc_now()
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "version": version,
            "location_id": "LOC-1",
            "floor_id": "FLOOR-1",
            "rack_id": "RACK-1",
            "warehouse": "WH-1",
            "logic_version": "v1",
            "logic_scope_source": "global",
            "started_at": now,
            "last_heartbeat": now,
        }
    )
    await db.verification_sessions.insert_one(
        {
            "session_id": session_id,
            "status": "ACTIVE",
            "last_heartbeat": now,
        }
    )


def _touch_side_effect_collections(db: InMemoryDatabase) -> None:
    for collection_name in (
        "event_log",
        "session_dashboard_projection",
        "verified_items_projection",
        "variance_summary_projection",
        "financial_projection",
        "governance_events",
    ):
        getattr(db, collection_name)


async def _seed_session_snapshot(
    db: InMemoryDatabase,
    session_id: str,
    *,
    item_code: str,
    stock_qty: float,
) -> None:
    existing = await db.session_snapshots.find_one({"session_id": session_id})
    if existing:
        items = list(existing.get("items") or [])
        items.append({"item_code": item_code, "stock_qty": stock_qty})
        await db.session_snapshots.update_one(
            {"_id": existing["_id"]},
            {"$set": {"items": items, "item_count": len(items)}},
        )
        return

    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash:{session_id}",
            "item_count": 1,
            "items": [{"item_code": item_code, "stock_qty": stock_qty}],
        }
    )


def _build_line(
    *,
    line_id: str,
    session_id: str,
    item_code: str,
    counted_qty: float,
    idempotency_key: str,
    version: int = 1,
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
        "counted_qty": counted_qty,
        "idempotency_key": idempotency_key,
        "counted_at": now,
        "updated_at": now,
        "version": version,
        "previous_version_id": None,
        "recount_of_id": None,
    }


def _build_line_data(
    *,
    session_id: str,
    item_code: str,
    counted_qty: float,
    idempotency_key: str,
) -> CountLineCreate:
    return CountLineCreate(
        session_id=session_id,
        location_id="LOC-1",
        floor_id="FLOOR-1",
        rack_id="RACK-1",
        floor_no="FLOOR-1",
        rack_no="RACK-1",
        item_code=item_code,
        counted_qty=counted_qty,
        idempotency_key=idempotency_key,
    )


@pytest.mark.asyncio
async def test_count_line_insert_rolls_back_when_session_update_fails(monkeypatch):
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-tx")
    await _seed_session_snapshot(db, "sess-tx", item_code="ITEM-TX", stock_qty=10.0)
    service = CountLineWriteService(db)

    async def _boom(*args, **kwargs):
        raise RuntimeError("forced-session-update-failure")

    monkeypatch.setattr(service.lifecycle_service, "update_session_totals", _boom)

    line = _build_line(
        line_id="line-tx-1",
        session_id="sess-tx",
        item_code="ITEM-TX",
        counted_qty=10.0,
        idempotency_key="idem-tx-1",
    )

    with pytest.raises(RuntimeError, match="forced-session-update-failure"):
        await service.process_write(
            {"operation": "insert_one", "document": line},
            context={"username": "tester", "enforce_snapshot": False},
        )

    assert await db.count_lines.count_documents({}) == 0


@pytest.mark.asyncio
async def test_count_line_write_rejects_stale_expected_session_version():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-occ")
    await _seed_session_snapshot(db, "sess-occ", item_code="ITEM-OCC-1", stock_qty=5.0)
    await _seed_session_snapshot(db, "sess-occ", item_code="ITEM-OCC-2", stock_qty=7.0)
    service = CountLineWriteService(db)

    first = _build_line(
        line_id="line-occ-1",
        session_id="sess-occ",
        item_code="ITEM-OCC-1",
        counted_qty=5.0,
        idempotency_key="idem-occ-1",
    )
    await service.process_write(
        {"operation": "insert_one", "document": first},
        context={
            "username": "tester",
            "enforce_snapshot": False,
            "expected_session_version": 0,
        },
    )
    session_after_first = await db.sessions.find_one({"id": "sess-occ"})
    event_count_after_first = await db.event_log.count_documents({})
    session_projection_count_after_first = await db.session_dashboard_projection.count_documents({})

    assert session_after_first["version"] == 1

    second = _build_line(
        line_id="line-occ-2",
        session_id="sess-occ",
        item_code="ITEM-OCC-2",
        counted_qty=7.0,
        idempotency_key="idem-occ-2",
    )

    with pytest.raises(ConcurrencyError, match="version mismatch"):
        await service.process_write(
            {"operation": "insert_one", "document": second},
            context={
                "username": "tester",
                "enforce_snapshot": False,
                "expected_session_version": 0,
            },
        )

    assert await db.count_lines.count_documents({}) == 1
    assert await db.count_lines.find_one({"id": "line-occ-2"}) is None
    assert await db.event_log.count_documents({}) == event_count_after_first
    assert await db.event_log.find_one({"payload.count_line.id": "line-occ-2"}) is None
    assert (
        await db.session_dashboard_projection.count_documents({})
        == session_projection_count_after_first
    )
    session_after_stale = await db.sessions.find_one({"id": "sess-occ"})
    assert session_after_stale["version"] == 1


@pytest.mark.asyncio
async def test_count_line_write_accepts_current_expected_session_version_and_increments():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-occ-valid")
    await _seed_session_snapshot(db, "sess-occ-valid", item_code="ITEM-OCC-V1", stock_qty=5.0)
    await _seed_session_snapshot(db, "sess-occ-valid", item_code="ITEM-OCC-V2", stock_qty=7.0)
    service = CountLineWriteService(db)

    await service.process_write(
        {
            "operation": "insert_one",
            "document": _build_line(
                line_id="line-occ-valid-1",
                session_id="sess-occ-valid",
                item_code="ITEM-OCC-V1",
                counted_qty=5.0,
                idempotency_key="idem-occ-valid-1",
            ),
        },
        context={
            "username": "tester",
            "enforce_snapshot": False,
            "expected_session_version": 0,
        },
    )

    session_after_first = await db.sessions.find_one({"id": "sess-occ-valid"})
    assert session_after_first["version"] == 1

    await service.process_write(
        {
            "operation": "insert_one",
            "document": _build_line(
                line_id="line-occ-valid-2",
                session_id="sess-occ-valid",
                item_code="ITEM-OCC-V2",
                counted_qty=7.0,
                idempotency_key="idem-occ-valid-2",
            ),
        },
        context={
            "username": "tester",
            "enforce_snapshot": False,
            "expected_session_version": 1,
        },
    )

    session_after_second = await db.sessions.find_one({"id": "sess-occ-valid"})
    projection = await db.session_dashboard_projection.find_one(
        {"session_id": "sess-occ-valid"}
    )

    assert await db.count_lines.count_documents({}) == 2
    assert session_after_second["version"] == 2
    assert projection["version"] == 2
    assert await db.event_log.find_one({"payload.count_line.id": "line-occ-valid-2"}) is not None


@pytest.mark.asyncio
async def test_persist_count_line_document_advances_session_version_under_occ():
    db = InMemoryDatabase()
    _touch_side_effect_collections(db)
    await _seed_active_session(db, "sess-legacy-persist")
    await _seed_session_snapshot(
        db,
        "sess-legacy-persist",
        item_code="ITEM-LEGACY-PERSIST",
        stock_qty=3.0,
    )
    service = CountLineWriteService(db)
    line_data = _build_line_data(
        session_id="sess-legacy-persist",
        item_code="ITEM-LEGACY-PERSIST",
        counted_qty=3.0,
        idempotency_key="idem-legacy-persist",
    )
    count_line = _build_line(
        line_id="line-legacy-persist",
        session_id="sess-legacy-persist",
        item_code="ITEM-LEGACY-PERSIST",
        counted_qty=3.0,
        idempotency_key="idem-legacy-persist",
    )
    session = await db.sessions.find_one({"id": "sess-legacy-persist"})

    await _persist_count_line_document(
        db,
        line_data,
        "tester",
        count_line,
        count_line["counted_at"],
        None,
        write_service=service,
        session=session,
    )

    stored_session = await db.sessions.find_one({"id": "sess-legacy-persist"})
    assert stored_session["version"] == 1
    assert stored_session["total_items"] == 1
    assert await db.count_lines.count_documents({"session_id": "sess-legacy-persist"}) == 1


@pytest.mark.asyncio
async def test_persist_count_line_document_rolls_back_on_stale_session_version():
    db = InMemoryDatabase()
    _touch_side_effect_collections(db)
    await _seed_active_session(db, "sess-legacy-stale", version=1)
    await _seed_session_snapshot(
        db,
        "sess-legacy-stale",
        item_code="ITEM-LEGACY-STALE",
        stock_qty=4.0,
    )
    service = CountLineWriteService(db)
    line_data = _build_line_data(
        session_id="sess-legacy-stale",
        item_code="ITEM-LEGACY-STALE",
        counted_qty=4.0,
        idempotency_key="idem-legacy-stale",
    )
    count_line = _build_line(
        line_id="line-legacy-stale",
        session_id="sess-legacy-stale",
        item_code="ITEM-LEGACY-STALE",
        counted_qty=4.0,
        idempotency_key="idem-legacy-stale",
    )
    stale_session = {
        **(await db.sessions.find_one({"id": "sess-legacy-stale"})),
        "version": 0,
    }

    with pytest.raises(ConcurrencyError, match="version mismatch"):
        await _persist_count_line_document(
            db,
            line_data,
            "tester",
            count_line,
            count_line["counted_at"],
            None,
            write_service=service,
            session=stale_session,
            expected_session_version=0,
        )

    assert await db.count_lines.count_documents({}) == 0
    assert await db.event_log.count_documents({}) == 0
    assert await db.session_dashboard_projection.count_documents({}) == 0
    assert await db.governance_events.count_documents({}) == 0
    stored_session = await db.sessions.find_one({"id": "sess-legacy-stale"})
    assert stored_session["version"] == 1


@pytest.mark.asyncio
async def test_merge_count_lines_advances_session_version_inside_merge_path(monkeypatch):
    monkeypatch.setenv("PROJECTION_WRITE_LOCK_ENABLED", "false")
    db = InMemoryDatabase()
    _touch_side_effect_collections(db)
    await _seed_active_session(db, "sess-legacy-merge")
    await _seed_session_snapshot(
        db,
        "sess-legacy-merge",
        item_code="ITEM-LEGACY-MERGE",
        stock_qty=8.0,
    )
    await db.erp_items.insert_one(
        {
            "item_code": "ITEM-LEGACY-MERGE",
            "item_name": "Merge Item",
            "stock_qty": 8.0,
            "last_cost": 1.0,
        }
    )
    await db.count_lines.insert_one(
        _build_line(
            line_id="line-merge-target",
            session_id="sess-legacy-merge",
            item_code="ITEM-LEGACY-MERGE",
            counted_qty=3.0,
            idempotency_key="idem-merge-target",
        )
    )
    await db.count_lines.insert_one(
        _build_line(
            line_id="line-merge-source",
            session_id="sess-legacy-merge",
            item_code="ITEM-LEGACY-MERGE",
            counted_qty=2.0,
            idempotency_key="idem-merge-source",
        )
    )

    result = await merge_count_lines(
        http_request=None,
        payload=CountLineMergeRequest(
            target_line_id="line-merge-target",
            source_line_ids=["line-merge-source"],
        ),
        current_user={"username": "supervisor", "role": "supervisor"},
        db_override=db,
    )

    stored_session = await db.sessions.find_one({"id": "sess-legacy-merge"})
    target_line = await db.count_lines.find_one({"id": "line-merge-target"})
    source_line = await db.count_lines.find_one({"id": "line-merge-source"})

    assert result["merged"] == ["line-merge-source"]
    assert stored_session["version"] == 1
    assert target_line["counted_qty"] == 5.0
    assert source_line["merged_into_id"] == "line-merge-target"


@pytest.mark.asyncio
async def test_semantic_hash_duplicate_is_rejected():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-sem")
    await _seed_session_snapshot(db, "sess-sem", item_code="ITEM-SEM", stock_qty=12.0)
    service = CountLineWriteService(db)

    first = _build_line(
        line_id="line-sem-1",
        session_id="sess-sem",
        item_code="ITEM-SEM",
        counted_qty=12.0,
        idempotency_key="idem-sem-1",
        version=1,
    )
    await service.process_write(
        {"operation": "insert_one", "document": first},
        context={"username": "tester", "enforce_snapshot": False},
    )

    duplicate_logical = _build_line(
        line_id="line-sem-2",
        session_id="sess-sem",
        item_code="ITEM-SEM",
        counted_qty=12.0,
        idempotency_key="idem-sem-2",
        version=1,
    )

    with pytest.raises(GovernanceViolation, match="semantic hash"):
        await service.process_write(
            {"operation": "insert_one", "document": duplicate_logical},
            context={"username": "tester", "enforce_snapshot": False},
        )

    assert await db.count_lines.count_documents({}) == 1


@pytest.mark.asyncio
async def test_skip_governance_bypass_is_rejected():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-bypass")
    await _seed_session_snapshot(db, "sess-bypass", item_code="ITEM-BYPASS", stock_qty=4.0)
    service = CountLineWriteService(db)

    with pytest.raises(GovernanceViolation, match="skip_governance bypass has been removed"):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _build_line(
                    line_id="line-bypass-1",
                    session_id="sess-bypass",
                    item_code="ITEM-BYPASS",
                    counted_qty=4.0,
                    idempotency_key="idem-bypass-1",
                ),
            },
            context={"username": "tester", "skip_governance": True},
        )


@pytest.mark.asyncio
async def test_skip_transaction_bypass_is_rejected():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-skip-tx")
    await _seed_session_snapshot(db, "sess-skip-tx", item_code="ITEM-SKIP-TX", stock_qty=4.0)
    service = CountLineWriteService(db)

    with pytest.raises(GovernanceViolation, match="skip_transaction bypass has been removed"):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _build_line(
                    line_id="line-skip-tx-1",
                    session_id="sess-skip-tx",
                    item_code="ITEM-SKIP-TX",
                    counted_qty=4.0,
                    idempotency_key="idem-skip-tx-1",
                ),
            },
            context={"username": "tester", "skip_transaction": True},
        )


@pytest.mark.asyncio
async def test_free_form_governance_flags_are_rejected():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-legacy-flags")
    await _seed_session_snapshot(
        db,
        "sess-legacy-flags",
        item_code="ITEM-LEGACY",
        stock_qty=2.0,
    )
    service = CountLineWriteService(db)

    with pytest.raises(GovernanceViolation, match="free-form governance flags have been removed"):
        await service.process_write(
            {
                "operation": "insert_one",
                "document": _build_line(
                    line_id="line-legacy-1",
                    session_id="sess-legacy-flags",
                    item_code="ITEM-LEGACY",
                    counted_qty=2.0,
                    idempotency_key="idem-legacy-1",
                ),
            },
            context={"username": "tester", "require_active_session": False},
        )


@pytest.mark.asyncio
async def test_session_lifecycle_occ_update_scopes_filter_by_session_and_version():
    db = MagicMock()
    db.sessions = MagicMock()
    db.sessions.update_one = AsyncMock(return_value=SimpleNamespace(modified_count=1))
    service = SessionLifecycleService(db)

    await service._update_session_with_occ(
        session_id="sess-occ-filter",
        set_doc={"status": "REVIEW"},
        expected_version=0,
        db_session=None,
    )

    filter_doc = db.sessions.update_one.await_args.args[0]
    assert filter_doc == {
        "$and": [
            {"$or": [{"id": "sess-occ-filter"}, {"session_id": "sess-occ-filter"}]},
            {"$or": [{"version": 0}, {"version": {"$exists": False}}]},
        ]
    }
