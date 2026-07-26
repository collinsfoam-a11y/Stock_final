"""
Tests for the BSR proactive duplicate-check endpoints (Part B):
- GET /count-lines/check/{session_id}/{item_code} extended with optional
  query params, kept backward compatible.
- POST /count-lines/check-duplicate structured body.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from backend.api.count_lines_routes import (
    DuplicateCheckRequest,
    check_duplicate_count_line,
    check_item_counted,
)
from backend.models.audit import AuditEventType
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


async def _seed_active_session(db: InMemoryDatabase, session_id: str) -> None:
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "ACTIVE",
            "version": 0,
        }
    )


CURRENT_USER = {"username": "staff1", "role": "staff"}


@pytest.mark.asyncio
async def test_check_duplicate_same_location_blocks_and_audits():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-1")
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM001",
            "floor_no": "F1",
            "rack_no": "R1",
            "status": "pending",
            "version": 1,
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-1", item_code="ITEM001", floor="F1", rack="R1"
            ),
            current_user=CURRENT_USER,
        )

    assert result.is_duplicate is True
    assert result.reason_code.value == "SAME_LOCATION_DUPLICATE"
    assert result.severity == "BLOCKING"
    assert result.requires_supervisor_review is True
    assert result.existing_count_line_id == "line-1"

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.DUPLICATE_SCAN_ATTEMPT
    assert kwargs["reason"] == "SAME_LOCATION_DUPLICATE"
    assert kwargs["session_id"] == "sess-1"


@pytest.mark.asyncio
async def test_check_duplicate_rejected_line_allows_recount_without_audit():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-2")
    await db.count_lines.insert_one(
        {
            "id": "line-2",
            "session_id": "sess-2",
            "item_code": "ITEM001",
            "floor_no": "F1",
            "rack_no": "R1",
            "status": "rejected",
            "version": 1,
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-2", item_code="ITEM001", floor="F1", rack="R1"
            ),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "RECOUNT_ALLOWED"
    audit_service.log_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_check_duplicate_different_location_flags_possible_relocation():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-3")
    await db.count_lines.insert_one(
        {
            "id": "line-3",
            "session_id": "sess-3",
            "item_code": "ITEM001",
            "floor_no": "F1",
            "rack_no": "R1",
            "status": "pending",
            "version": 1,
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-3", item_code="ITEM001", floor="F2", rack="R2"
            ),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "POSSIBLE_RELOCATION"
    assert result.severity == "WARNING"
    audit_service.log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_duplicate_serial_hard_block():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-4")
    await db.count_lines.insert_one(
        {
            "id": "line-4",
            "session_id": "sess-4",
            "item_code": "ITEM001",
            "serial_numbers": ["SER-1"],
            "status": "pending",
            "version": 1,
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-4", item_code="ITEM001", serial_no="SER-1"
            ),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "SERIAL_DUPLICATE"
    assert result.severity == "BLOCKING"
    assert result.requires_supervisor_review is True
    audit_service.log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_duplicate_idempotent_retry_is_not_audited():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-5")
    await db.count_lines.insert_one(
        {
            "id": "line-5",
            "session_id": "sess-5",
            "item_code": "ITEM001",
            "idempotency_key": "same-key",
            "status": "pending",
            "version": 1,
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-5", item_code="ITEM001", idempotency_key="same-key"
            ),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "IDEMPOTENT_RETRY"
    assert result.is_duplicate is True
    assert result.severity == "INFO"
    audit_service.log_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_check_duplicate_semantic_duplicate_different_key_is_audited():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-6")
    await db.count_lines.insert_one(
        {
            "id": "line-6",
            "session_id": "sess-6",
            "item_code": "ITEM001",
            "location_id": "LOC-1",
            "counted_qty": 5.0,
            "version": 1,
            "idempotency_key": "original-key",
            "semantic_hash": "will-be-recomputed-by-helper",
            "status": "pending",
        }
    )
    # Recompute the real semantic hash so the fixture matches production logic
    from backend.services.count_line_write_service import _build_semantic_hash

    real_hash = _build_semantic_hash(
        {
            "session_id": "sess-6",
            "item_code": "ITEM001",
            "location_id": "LOC-1",
            "counted_qty": 5.0,
            "version": 1,
        }
    )
    await db.count_lines.update_one({"id": "line-6"}, {"$set": {"semantic_hash": real_hash}})

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(
                session_id="sess-6",
                item_code="ITEM001",
                location_id="LOC-1",
                counted_qty=5.0,
                version=1,
                idempotency_key="different-key",
            ),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "SEMANTIC_DUPLICATE"
    assert result.severity == "BLOCKING"
    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["reason"] == "SEMANTIC_DUPLICATE"


@pytest.mark.asyncio
async def test_check_duplicate_finalized_session_blocks():
    db = InMemoryDatabase()
    await db.sessions.insert_one(
        {
            "id": "sess-7",
            "session_id": "sess-7",
            "status": "FINALIZED",
            "finalized_at": _utc_now(),
        }
    )

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(session_id="sess-7", item_code="ITEM001"),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "FINALIZED_SESSION"
    assert result.is_duplicate is True
    audit_service.log_event.assert_awaited_once()


@pytest.mark.asyncio
async def test_check_duplicate_clean_not_duplicate_no_audit():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-8")

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.count_lines_routes.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await check_duplicate_count_line(
            request=DuplicateCheckRequest(session_id="sess-8", item_code="ITEM001"),
            current_user=CURRENT_USER,
        )

    assert result.reason_code.value == "NOT_DUPLICATE"
    assert result.is_duplicate is False
    audit_service.log_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_legacy_get_endpoint_stays_backward_compatible_with_no_new_params():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-9")
    await db.count_lines.insert_one(
        {
            "id": "line-9",
            "session_id": "sess-9",
            "item_code": "ITEM001",
            "status": "pending",
            "version": 1,
        }
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await check_item_counted(
            session_id="sess-9",
            item_code="ITEM001",
            current_user=CURRENT_USER,
        )

    # Legacy fields untouched.
    assert result["already_counted"] is True
    assert len(result["count_lines"]) == 1
    assert "item_totals" in result
    assert "batch_totals" in result
    # New structured fields are additive (no floor/rack provided -> no
    # same-location assertion is possible, but the response must still be
    # well-formed with the new keys present).
    assert result["reason_code"] in {"NOT_DUPLICATE", "IDEMPOTENT_RETRY"}
    assert "is_duplicate" in result


@pytest.mark.asyncio
async def test_legacy_get_endpoint_populates_duplicate_fields_with_optional_params():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-10")
    await db.count_lines.insert_one(
        {
            "id": "line-10",
            "session_id": "sess-10",
            "item_code": "ITEM001",
            "floor_no": "F1",
            "rack_no": "R1",
            "status": "pending",
            "version": 1,
        }
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await check_item_counted(
            session_id="sess-10",
            item_code="ITEM001",
            current_user=CURRENT_USER,
            floor="F1",
            rack="R1",
        )

    assert result["is_duplicate"] is True
    assert result["reason_code"] == "SAME_LOCATION_DUPLICATE"
    assert result["requires_supervisor_review"] is True
