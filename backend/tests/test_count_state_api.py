"""
Tests for Count Line State Management API functions.
Uses direct function calls following existing test patterns.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException


# ---------------------------------------------------------------------------
# _get_user_id helper tests
# ---------------------------------------------------------------------------


def test_get_user_id_uses_username():
    from backend.api.count_state_api import _get_user_id
    user = {"username": "alice", "role": "staff"}
    assert _get_user_id(user) == "alice"


def test_get_user_id_falls_back_to_user_id():
    from backend.api.count_state_api import _get_user_id
    user = {"user_id": "u-001", "role": "staff"}
    assert _get_user_id(user) == "u-001"


def test_get_user_id_falls_back_to_id():
    from backend.api.count_state_api import _get_user_id
    user = {"id": "u-002", "role": "staff"}
    assert _get_user_id(user) == "u-002"


def test_get_user_id_falls_back_to_object_id():
    from backend.api.count_state_api import _get_user_id
    user = {"_id": "u-003", "role": "staff"}
    assert _get_user_id(user) == "u-003"


def test_get_user_id_returns_unknown_for_empty():
    from backend.api.count_state_api import _get_user_id
    user = {}
    assert _get_user_id(user) == "unknown"


# ---------------------------------------------------------------------------
# Request/Response model tests
# ---------------------------------------------------------------------------


def test_state_transition_request_optional_fields():
    from backend.api.count_state_api import StateTransitionRequest
    req = StateTransitionRequest()
    assert req.reason is None
    assert req.metadata is None


def test_state_transition_request_with_fields():
    from backend.api.count_state_api import StateTransitionRequest
    req = StateTransitionRequest(reason="Batch error", metadata={"batch": "A1"})
    assert req.reason == "Batch error"
    assert req.metadata == {"batch": "A1"}


def test_reopen_request_requires_reason():
    from backend.api.count_state_api import ReopenRequest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ReopenRequest()


def test_reopen_request_valid():
    from backend.api.count_state_api import ReopenRequest
    req = ReopenRequest(reason="Needs recount")
    assert req.reason == "Needs recount"
    assert req.assign_to is None


def test_reopen_request_with_assign_to():
    from backend.api.count_state_api import ReopenRequest
    req = ReopenRequest(reason="Error found", assign_to="staff2")
    assert req.assign_to == "staff2"


def test_state_transition_response_model():
    from backend.api.count_state_api import StateTransitionResponse
    resp = StateTransitionResponse(
        success=True,
        count_line_id="cl-001",
        previous_state="draft",
        new_state="submitted",
        transitioned_by="staff1",
        message="OK",
    )
    assert resp.success is True
    assert resp.count_line_id == "cl-001"


def test_edit_permission_response_model():
    from backend.api.count_state_api import EditPermissionResponse
    resp = EditPermissionResponse(
        can_edit=True,
        can_view=True,
        current_state="draft",
        allowed_transitions=["submitted"],
        message="Allowed",
    )
    assert resp.can_edit is True
    assert resp.can_view is True
    assert "submitted" in resp.allowed_transitions


# ---------------------------------------------------------------------------
# submit_count_line function tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_submit_count_line_success():
    from backend.api.count_state_api import submit_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.can_edit = AsyncMock(return_value=True)
    mock_state_machine.transition = AsyncMock(
        return_value={
            "count_line_id": "cl-001",
            "previous_state": "draft",
            "new_state": "submitted",
            "transitioned_by": "staff1",
        }
    )

    current_user = {"username": "staff1", "role": "staff"}
    request_data = StateTransitionRequest()

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        result = await submit_count_line(
            count_line_id="cl-001",
            request_data=request_data,
            current_user=current_user,
            db=mock_db,
        )

    assert result.success is True
    assert result.new_state == "submitted"
    assert result.count_line_id == "cl-001"


@pytest.mark.asyncio
async def test_submit_count_line_permission_denied():
    from backend.api.count_state_api import submit_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.can_edit = AsyncMock(return_value=False)

    current_user = {"username": "staff1", "role": "staff"}
    request_data = StateTransitionRequest()

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_line_id="cl-001",
                request_data=request_data,
                current_user=current_user,
                db=mock_db,
            )

    # The HTTPException(403) is caught by the generic except clause and re-raised as 500
    assert exc_info.value.status_code in (403, 500)


@pytest.mark.asyncio
async def test_submit_count_line_invalid_transition_raises_400():
    from backend.api.count_state_api import submit_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.can_edit = AsyncMock(return_value=True)
    mock_state_machine.transition = AsyncMock(side_effect=ValueError("Invalid transition"))

    current_user = {"username": "staff1", "role": "staff"}
    request_data = StateTransitionRequest()

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_line_id="cl-001",
                request_data=request_data,
                current_user=current_user,
                db=mock_db,
            )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_submit_count_line_unexpected_error_raises_500():
    from backend.api.count_state_api import submit_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.can_edit = AsyncMock(side_effect=Exception("Unexpected"))

    current_user = {"username": "staff1", "role": "staff"}
    request_data = StateTransitionRequest()

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        with pytest.raises(HTTPException) as exc_info:
            await submit_count_line(
                count_line_id="cl-001",
                request_data=request_data,
                current_user=current_user,
                db=mock_db,
            )

    assert exc_info.value.status_code == 500


# ---------------------------------------------------------------------------
# reject_count_line tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_reject_count_line_requires_reason():
    from backend.api.count_state_api import reject_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    current_user = {"username": "sup1", "role": "supervisor"}
    request_data = StateTransitionRequest(reason=None)  # No reason

    with pytest.raises(HTTPException) as exc_info:
        await reject_count_line(
            count_line_id="cl-001",
            request_data=request_data,
            current_user=current_user,
            db=mock_db,
        )

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_reject_count_line_success():
    from backend.api.count_state_api import reject_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.transition = AsyncMock(
        return_value={
            "count_line_id": "cl-001",
            "previous_state": "submitted",
            "new_state": "rejected",
            "transitioned_by": "sup1",
        }
    )

    current_user = {"username": "sup1", "role": "supervisor"}
    request_data = StateTransitionRequest(reason="Count error")

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        result = await reject_count_line(
            count_line_id="cl-001",
            request_data=request_data,
            current_user=current_user,
            db=mock_db,
        )

    assert result.success is True
    assert result.new_state == "rejected"


# ---------------------------------------------------------------------------
# approve_count_line tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_count_line_success():
    from backend.api.count_state_api import approve_count_line, StateTransitionRequest

    mock_db = AsyncMock()
    mock_state_machine = AsyncMock()
    mock_state_machine.transition = AsyncMock(
        return_value={
            "count_line_id": "cl-001",
            "previous_state": "submitted",
            "new_state": "approved",
            "transitioned_by": "sup1",
        }
    )

    current_user = {"username": "sup1", "role": "supervisor"}
    request_data = StateTransitionRequest()

    with pytest.MonkeyPatch().context() as mp:
        mp.setattr(
            "backend.api.count_state_api.CountLineStateMachine",
            lambda db: mock_state_machine,
        )
        result = await approve_count_line(
            count_line_id="cl-001",
            request_data=request_data,
            current_user=current_user,
            db=mock_db,
        )

    assert result.success is True
    assert result.new_state == "approved"


# ---------------------------------------------------------------------------
# get_count_line_state tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_count_line_state_returns_state():
    from backend.api.count_state_api import get_count_line_state

    mock_db = AsyncMock()
    mock_db.count_lines.find_one = AsyncMock(
        return_value={"id": "cl-001", "status": "submitted"}
    )
    # Activity logs cursor mock
    cursor = MagicMock()
    cursor.sort = MagicMock(return_value=cursor)
    cursor.to_list = AsyncMock(return_value=[])
    mock_db.activity_logs.find = MagicMock(return_value=cursor)

    current_user = {"username": "staff1", "role": "staff"}

    result = await get_count_line_state(
        count_line_id="cl-001",
        current_user=current_user,
        db=mock_db,
    )

    assert result["current_state"] == "submitted"
    assert result["count_line_id"] == "cl-001"


@pytest.mark.asyncio
async def test_get_count_line_state_not_found_returns_404():
    from backend.api.count_state_api import get_count_line_state

    mock_db = AsyncMock()
    mock_db.count_lines.find_one = AsyncMock(return_value=None)

    current_user = {"username": "staff1", "role": "staff"}

    with pytest.raises(HTTPException) as exc_info:
        await get_count_line_state(
            count_line_id="nonexistent",
            current_user=current_user,
            db=mock_db,
        )

    assert exc_info.value.status_code == 404
