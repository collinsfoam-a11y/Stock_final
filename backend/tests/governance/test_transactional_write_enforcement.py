from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.concurrency import ConcurrencyError
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.tenancy.scoping import org_scoped_filter
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(db: InMemoryDatabase, session_id: str = "sess-1") -> None:
    now = _utc_now()
    await db.sessions.insert_one(
        {
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
    )
    await db.verification_sessions.insert_one(
        {
            "session_id": session_id,
            "status": "ACTIVE",
            "last_heartbeat": now,
        }
    )


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


@pytest.mark.asyncio
async def test_count_line_write_infers_batch_id_from_single_batch_entry():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-1")
    await _seed_session_snapshot(db, "sess-batch-1", item_code="ITEM-BATCH", stock_qty=1.0)
    service = CountLineWriteService(db)

    line = _build_line(
        line_id="line-batch-1",
        session_id="sess-batch-1",
        item_code="ITEM-BATCH",
        counted_qty=1.0,
        idempotency_key="idem-batch-1",
    )
    line.pop("recount_of_id", None)
    line["batches"] = [{"batch_no": "B1", "counted_qty": 1.0, "damaged_qty": 0.0}]

    await service.process_write(
        {"operation": "insert_one", "document": line},
        context={"username": "tester", "enforce_snapshot": False},
    )

    stored = await db.count_lines.find_one(org_scoped_filter(None, {"id": "line-batch-1"}))
    assert stored is not None
    assert stored.get("batch_id") == "B1"
    assert stored.get("batches") == [
        {"batch_id": "B1", "batch_no": "B1", "counted_qty": 1.0, "damaged_qty": 0.0}
    ]


@pytest.mark.asyncio
async def test_count_line_write_rejects_serials_with_multiple_batches():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-2")
    await _seed_session_snapshot(db, "sess-batch-2", item_code="ITEM-BATCH", stock_qty=2.0)
    service = CountLineWriteService(db)

    line = _build_line(
        line_id="line-batch-2",
        session_id="sess-batch-2",
        item_code="ITEM-BATCH",
        counted_qty=2.0,
        idempotency_key="idem-batch-2",
    )
    line["serial_numbers"] = ["S1", "S2"]
    line["batches"] = [
        {"batch_no": "B1", "counted_qty": 1.0},
        {"batch_no": "B2", "counted_qty": 1.0},
    ]

    with pytest.raises(GovernanceViolation, match="Multi-batch serial counting"):
        await service.process_write(
            {"operation": "insert_one", "document": line},
            context={"username": "tester", "enforce_snapshot": False},
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
            org_scoped_filter(
                None,
                {"$or": [{"id": "sess-occ-filter"}, {"session_id": "sess-occ-filter"}]},
            ),
            {"$or": [{"version": 0}, {"version": {"$exists": False}}]},
        ]
    }
