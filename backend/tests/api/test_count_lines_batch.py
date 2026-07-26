"""
Tests for the BSR batch count-line idempotency/duplicate-race remediation
(Part A): create_count_lines_batch must classify each line the same way
the single-submit endpoint does (_prepare_and_persist_count_line is the
shared single source of truth for both).
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from backend.api.count_lines_routes import (
    CountLineBatchCreate,
    create_count_lines_batch,
)
from backend.api.schemas import CountLineCreate
from backend.models.audit import AuditEventType
from backend.services.governance_guard import install_db_write_guards
from backend.tests.utils.in_memory_db import InMemoryDatabase
from pymongo.errors import DuplicateKeyError

CURRENT_USER = {"username": "staff1", "role": "staff"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(
    db: InMemoryDatabase, session_id: str, item_codes: list[str]
) -> None:
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "version": 0,
        }
    )
    for item_code in item_codes:
        await db.erp_items.insert_one(
            {
                "item_code": item_code,
                "barcode": f"BC-{item_code}",
                "item_name": f"Item {item_code}",
                "stock_qty": 100.0,
                "mrp": 50.0,
            }
        )
    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash-{session_id}",
            "items": [{"item_code": code, "stock_qty": 100.0} for code in item_codes],
        }
    )


def _batch_line(
    *, item_code: str, idempotency_key: str, counted_qty: float = 100.0
) -> CountLineCreate:
    return CountLineCreate(
        session_id="placeholder",
        location_id="LOC-1",
        floor_id="F1",
        rack_id="R1",
        item_code=item_code,
        idempotency_key=idempotency_key,
        counted_qty=counted_qty,
        floor_no="F1",
        rack_no="R1",
    )


@pytest.mark.asyncio
async def test_batch_two_new_lines_both_succeed():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-1", ["ITEM-A", "ITEM-B"])
    install_db_write_guards(db)

    batch = CountLineBatchCreate(
        session_id="sess-batch-1",
        lines=[
            _batch_line(item_code="ITEM-A", idempotency_key="key-a"),
            _batch_line(item_code="ITEM-B", idempotency_key="key-b"),
        ],
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch, current_user=CURRENT_USER
        )

    assert result["created"] == 2
    assert result["failed"] == 0
    assert all(r["success"] and r["idempotent_retry"] is False for r in result["results"])


@pytest.mark.asyncio
async def test_batch_idempotent_retry_returns_existing_as_safe_success():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-2", ["ITEM-A"])
    await db.count_lines.insert_one(
        {
            "id": "existing-line",
            "session_id": "sess-batch-2",
            "item_code": "ITEM-A",
            "idempotency_key": "retry-key",
            "status": "pending",
            "version": 1,
        }
    )
    install_db_write_guards(db)

    batch = CountLineBatchCreate(
        session_id="sess-batch-2",
        lines=[_batch_line(item_code="ITEM-A", idempotency_key="retry-key")],
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch, current_user=CURRENT_USER
        )

    assert result["created"] == 1
    assert result["failed"] == 0
    assert result["results"][0]["success"] is True
    assert result["results"][0]["idempotent_retry"] is True
    assert result["results"][0]["id"] == "existing-line"

    # BSR rule #17: a true retry must never be audited as a duplicate scan.
    audit_service.log_event.assert_not_awaited()

    # No second document was created for the retry.
    assert await db.count_lines.count_documents({"session_id": "sess-batch-2"}) == 1


@pytest.mark.asyncio
async def test_batch_semantic_duplicate_returns_structured_error_and_audits():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-3", ["ITEM-A"])
    await db.count_lines.insert_one(
        {
            "id": "existing-line-3",
            "session_id": "sess-batch-3",
            "item_code": "ITEM-A",
            "floor_no": "F1",
            "rack_no": "R1",
            "idempotency_key": "original-key",
            "status": "pending",
            "version": 1,
        }
    )
    install_db_write_guards(db)

    batch = CountLineBatchCreate(
        session_id="sess-batch-3",
        lines=[_batch_line(item_code="ITEM-A", idempotency_key="different-key")],
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch, current_user=CURRENT_USER
        )

    assert result["created"] == 0
    assert result["failed"] == 1
    error = result["errors"][0]
    assert error["success"] is False
    assert error["error_code"] == "DUPLICATE_SCAN_ATTEMPT"
    assert error["line_index"] == 0
    assert error["item_code"] == "ITEM-A"
    assert error["idempotency_key"] == "different-key"
    assert error["existing_count_line_id"] == "existing-line-3"

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.DUPLICATE_SCAN_ATTEMPT
    assert kwargs["reason"] == "SAME_LOCATION_DUPLICATE"

    # The duplicate rejection must not create a second document.
    assert await db.count_lines.count_documents({"session_id": "sess-batch-3"}) == 1


@pytest.mark.asyncio
async def test_batch_mixed_success_and_duplicate_preserves_partial_results():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-4", ["ITEM-A", "ITEM-B"])
    await db.count_lines.insert_one(
        {
            "id": "existing-line-4",
            "session_id": "sess-batch-4",
            "item_code": "ITEM-A",
            "floor_no": "F1",
            "rack_no": "R1",
            "idempotency_key": "original-key-4",
            "status": "pending",
            "version": 1,
        }
    )
    install_db_write_guards(db)

    batch = CountLineBatchCreate(
        session_id="sess-batch-4",
        lines=[
            _batch_line(item_code="ITEM-A", idempotency_key="different-key-4"),
            _batch_line(item_code="ITEM-B", idempotency_key="key-b-4"),
        ],
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch, current_user=CURRENT_USER
        )

    assert result["created"] == 1
    assert result["failed"] == 1
    assert result["results"][0]["success"] is True  # ITEM-B succeeded
    assert result["results"][0]["index"] == 1
    assert result["errors"][0]["line_index"] == 0
    assert result["errors"][0]["error_code"] == "DUPLICATE_SCAN_ATTEMPT"

    # The successful line's document must exist and be untouched by the
    # failure of the other line.
    persisted_b = await db.count_lines.find_one(
        {"session_id": "sess-batch-4", "item_code": "ITEM-B"}
    )
    assert persisted_b is not None


@pytest.mark.asyncio
async def test_batch_duplicate_key_error_race_recovers_cleanly():
    """A single-line batch that loses the real Mongo unique-index race
    (simulated here, since InMemoryDatabase has no unique-index enforcement)
    must be classified as SEMANTIC_DUPLICATE, not surface a raw exception
    string or crash the batch."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-batch-5", ["ITEM-A"])
    install_db_write_guards(db)

    batch = CountLineBatchCreate(
        session_id="sess-batch-5",
        lines=[_batch_line(item_code="ITEM-A", idempotency_key="race-key-5")],
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch(
            "backend.services.count_line_write_service.CountLineWriteService.process_write",
            new=AsyncMock(side_effect=DuplicateKeyError("E11000 duplicate key error")),
        ),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await create_count_lines_batch(
            request=AsyncMock(), batch_data=batch, current_user=CURRENT_USER
        )

    assert result["created"] == 0
    assert result["failed"] == 1
    error = result["errors"][0]
    assert error["error_code"] == "SEMANTIC_DUPLICATE"
    assert error["success"] is False

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.DUPLICATE_SCAN_ATTEMPT
    assert kwargs["reason"] == "SEMANTIC_DUPLICATE"
