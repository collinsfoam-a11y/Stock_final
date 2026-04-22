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
