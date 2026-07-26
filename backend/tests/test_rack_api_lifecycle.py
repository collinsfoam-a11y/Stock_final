"""
Tests for rack_api.py's claim/release/pause/resume endpoints wiring into the
real session lifecycle instead of the previously-broken
raise_forbidden_direct_write() placeholder.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.api.rack_api import (
    RackClaimRequest,
    claim_rack,
    pause_rack,
    release_rack,
    resume_rack,
)


def _mock_db_with_rack(rack: dict, session: dict | None = None):
    db = MagicMock()
    db.rack_registry.find_one = AsyncMock(return_value=rack)
    db.rack_registry.insert_one = AsyncMock()
    db.rack_registry.update_one = AsyncMock()
    db.verification_sessions.find_one = AsyncMock(return_value=session)
    return db


def _mock_lock_manager(acquired: bool = True):
    lm = MagicMock()
    lm.acquire_rack_lock = AsyncMock(return_value=acquired)
    lm.get_rack_lock_owner = AsyncMock(return_value="other_user")
    lm.create_session_lock = AsyncMock()
    lm.release_rack_lock = AsyncMock(return_value=True)
    return lm


@pytest.fixture
def mock_pubsub():
    pubsub = MagicMock()
    pubsub.publish_rack_update = AsyncMock()
    return pubsub


async def test_claim_rack_creates_and_activates_a_real_session(mock_pubsub):
    db = _mock_db_with_rack(
        {
            "rack_id": "R1",
            "floor": "Ground",
            "status": "available",
            "claimed_by": None,
            "session_id": None,
            "lock_expires_at": None,
        }
    )
    lock_manager = _mock_lock_manager(acquired=True)

    with (
        patch("backend.api.rack_api.get_db", return_value=db),
        patch("backend.api.rack_api.get_lock_manager", return_value=lock_manager),
        patch("backend.api.rack_api.SessionLifecycleService") as mock_lifecycle_cls,
    ):
        mock_lifecycle = mock_lifecycle_cls.return_value
        mock_lifecycle.create_session = AsyncMock()
        mock_lifecycle.transition_session = AsyncMock()

        response = await claim_rack(
            rack_id="R1",
            request=RackClaimRequest(floor="Ground", warehouse="WH1"),
            current_user={"username": "staff1", "full_name": "Staff One"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert response.success is True
    mock_lifecycle.create_session.assert_awaited_once()
    create_kwargs = mock_lifecycle.create_session.await_args.kwargs
    assert create_kwargs["session_doc"]["warehouse"] == "WH1"
    assert create_kwargs["session_doc"]["rack_no"] == "R1"
    assert create_kwargs["username"] == "staff1"

    mock_lifecycle.transition_session.assert_awaited_once()
    transition_kwargs = mock_lifecycle.transition_session.await_args.kwargs
    assert transition_kwargs["target_status"] == "ACTIVE"


async def test_claim_rack_defaults_warehouse_to_floor_when_omitted(mock_pubsub):
    db = _mock_db_with_rack(
        {
            "rack_id": "R2",
            "floor": "Ground",
            "status": "available",
            "claimed_by": None,
            "session_id": None,
            "lock_expires_at": None,
        }
    )
    lock_manager = _mock_lock_manager(acquired=True)

    with (
        patch("backend.api.rack_api.get_db", return_value=db),
        patch("backend.api.rack_api.get_lock_manager", return_value=lock_manager),
        patch("backend.api.rack_api.SessionLifecycleService") as mock_lifecycle_cls,
    ):
        mock_lifecycle = mock_lifecycle_cls.return_value
        mock_lifecycle.create_session = AsyncMock()
        mock_lifecycle.transition_session = AsyncMock()

        await claim_rack(
            rack_id="R2",
            request=RackClaimRequest(floor="Ground"),
            current_user={"username": "staff1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    create_kwargs = mock_lifecycle.create_session.await_args.kwargs
    assert create_kwargs["session_doc"]["warehouse"] == "Ground"


async def test_release_rack_moves_active_session_to_review(mock_pubsub):
    db = _mock_db_with_rack(
        rack={
            "rack_id": "R1",
            "floor": "Ground",
            "status": "active",
            "claimed_by": "staff1",
            "session_id": "sess_1",
            "lock_expires_at": 123.0,
        },
        session={"session_id": "sess_1", "status": "ACTIVE"},
    )
    lock_manager = _mock_lock_manager()

    with (
        patch("backend.api.rack_api.get_db", return_value=db),
        patch("backend.api.rack_api.get_lock_manager", return_value=lock_manager),
        patch("backend.api.rack_api.SessionLifecycleService") as mock_lifecycle_cls,
    ):
        mock_lifecycle = mock_lifecycle_cls.return_value
        mock_lifecycle.transition_session = AsyncMock()

        response = await release_rack(
            rack_id="R1",
            current_user={"username": "staff1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert response.success is True
    mock_lifecycle.transition_session.assert_awaited_once()
    kwargs = mock_lifecycle.transition_session.await_args.kwargs
    assert kwargs["session_id"] == "sess_1"
    assert kwargs["target_status"] == "REVIEW"


async def test_release_rack_does_not_touch_session_already_past_active(mock_pubsub):
    db = _mock_db_with_rack(
        rack={
            "rack_id": "R1",
            "floor": "Ground",
            "status": "active",
            "claimed_by": "staff1",
            "session_id": "sess_1",
            "lock_expires_at": 123.0,
        },
        session={"session_id": "sess_1", "status": "REVIEW"},
    )
    lock_manager = _mock_lock_manager()

    with (
        patch("backend.api.rack_api.get_db", return_value=db),
        patch("backend.api.rack_api.get_lock_manager", return_value=lock_manager),
        patch("backend.api.rack_api.SessionLifecycleService") as mock_lifecycle_cls,
    ):
        mock_lifecycle = mock_lifecycle_cls.return_value
        mock_lifecycle.transition_session = AsyncMock()

        response = await release_rack(
            rack_id="R1",
            current_user={"username": "staff1"},
            redis_service=MagicMock(),
            pubsub_service=mock_pubsub,
        )

    assert response.success is True
    mock_lifecycle.transition_session.assert_not_awaited()


async def test_pause_rack_succeeds_without_touching_session(mock_pubsub):
    db = _mock_db_with_rack(
        rack={
            "rack_id": "R1",
            "floor": "Ground",
            "status": "active",
            "claimed_by": "staff1",
            "session_id": "sess_1",
            "lock_expires_at": 123.0,
        }
    )

    with patch("backend.api.rack_api.get_db", return_value=db):
        result = await pause_rack(
            rack_id="R1",
            current_user={"username": "staff1"},
            pubsub_service=mock_pubsub,
        )

    assert result["success"] is True
    assert result["status"] == "paused"
    db.verification_sessions.find_one.assert_not_called()


async def test_resume_rack_succeeds_without_touching_session(mock_pubsub):
    db = _mock_db_with_rack(
        rack={
            "rack_id": "R1",
            "floor": "Ground",
            "status": "paused",
            "claimed_by": "staff1",
            "session_id": "sess_1",
            "lock_expires_at": 123.0,
        }
    )

    with patch("backend.api.rack_api.get_db", return_value=db):
        result = await resume_rack(
            rack_id="R1",
            current_user={"username": "staff1"},
            pubsub_service=mock_pubsub,
        )

    assert result["success"] is True
    assert result["status"] == "active"
    db.verification_sessions.find_one.assert_not_called()
