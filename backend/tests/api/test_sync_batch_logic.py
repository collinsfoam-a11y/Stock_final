from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.api.sync_batch_api import SyncRecord, _process_count_line_op, sync_single_record


@pytest.mark.asyncio
async def test_sync_single_record_scopes_upsert_by_session_id(monkeypatch):
    db = MagicMock()
    db.count_lines.update_one = AsyncMock(return_value=SimpleNamespace())
    db.item_serials.insert_many = AsyncMock(return_value=None)
    recompute = AsyncMock(return_value=None)
    monkeypatch.setattr("backend.api.sync_batch_api.recompute_session_totals", recompute)

    record = SyncRecord(
        client_record_id="offline-line-1",
        session_id="session-a",
        item_code="ITEM-1",
        verified_qty=3,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )

    success, error = await sync_single_record(record, db, "staff1")

    assert success is True
    assert error is None
    filter_query = db.count_lines.update_one.await_args.args[0]
    assert filter_query == {
        "session_id": "session-a",
        "idempotency_key": "offline-line-1",
    }


@pytest.mark.asyncio
async def test_process_count_line_op_accepts_non_dict_audit_metadata(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.count_lines.insert_one = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_session",
        AsyncMock(return_value={"id": "session-a", "status": "OPEN"}),
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_duplicate_count_line",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.recompute_session_totals",
        AsyncMock(return_value=None),
    )

    message = await _process_count_line_op(
        {
            "_id": "legacy-id",
            "session_id": "session-a",
            "item_code": "ITEM-1",
            "counted_qty": 2,
            "audit": None,
        },
        {"username": "staff1"},
        {},
        db,
    )

    assert message == "Count line synced with canonical duplicate validation"
    inserted = db.count_lines.insert_one.await_args.args[0]
    assert inserted["idempotency_key"] == "legacy-id"


@pytest.mark.asyncio
async def test_process_count_line_op_drops_object_id_from_recount_update(monkeypatch):
    db = MagicMock()
    db.count_lines.find_one = AsyncMock(return_value=None)
    db.count_lines.update_one = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_session",
        AsyncMock(return_value={"id": "session-a", "status": "OPEN"}),
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.find_duplicate_count_line",
        AsyncMock(
            return_value={
                "_id": "mongo-id",
                "id": "rejected-line",
                "status": "rejected",
                "approval_status": "REJECTED",
            }
        ),
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.can_reuse_rejected_count_line",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        "backend.api.sync_batch_api.recompute_session_totals",
        AsyncMock(return_value=None),
    )

    message = await _process_count_line_op(
        {
            "_id": "legacy-id",
            "session_id": "session-a",
            "item_code": "ITEM-1",
            "counted_qty": 5,
            "recount_of_id": "rejected-line",
        },
        {"username": "staff1"},
        {},
        db,
    )

    assert message == "Rejected count line updated through explicit recount sync"
    update_payload = db.count_lines.update_one.await_args.args[1]["$set"]
    assert "_id" not in update_payload
