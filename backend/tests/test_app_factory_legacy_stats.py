from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId

import backend.app_factory as app_factory
from backend.services.canonical_inventory import build_session_lookup


def test_build_session_lookup_matches_id_and_session_id():
    assert build_session_lookup("session-123") == {
        "$or": [{"id": "session-123"}, {"session_id": "session-123"}]
    }


def test_build_session_lookup_supports_legacy_object_id():
    session_id = "64c13ab08edf48a008793cac"

    assert build_session_lookup(session_id) == {
        "$or": [
            {"id": session_id},
            {"session_id": session_id},
            {"_id": ObjectId(session_id)},
        ]
    }


@pytest.mark.asyncio
async def test_get_session_by_id_supports_canonical_session_lookup(monkeypatch):
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(
        return_value={
            "id": "session-123",
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "staff_name": "Staff One",
        }
    )

    monkeypatch.setattr(app_factory, "db", mock_db)

    session = await app_factory.get_session_by_id(
        "session-123",
        {"username": "staff1", "role": "staff"},
    )

    mock_db.sessions.find_one.assert_awaited_once_with(
        {"$or": [{"id": "session-123"}, {"session_id": "session-123"}]}
    )
    assert session.id == "session-123"
