from unittest.mock import AsyncMock, MagicMock

import pytest

import backend.app_factory as app_factory


@pytest.mark.asyncio
async def test_refresh_session_count_line_stats_updates_by_id_or_session_id(monkeypatch):
    cursor = AsyncMock()
    cursor.to_list.return_value = [{"total_items": 3, "total_variance": 7}]

    mock_db = MagicMock()
    mock_db.count_lines.aggregate.return_value = cursor
    mock_db.sessions.update_one = AsyncMock()

    monkeypatch.setattr(app_factory, "db", mock_db)

    await app_factory._refresh_session_count_line_stats("session-123")

    mock_db.sessions.update_one.assert_awaited_once_with(
        {"$or": [{"id": "session-123"}, {"session_id": "session-123"}]},
        {"$set": {"total_items": 3, "total_variance": 7}},
    )


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
