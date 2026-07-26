from unittest.mock import AsyncMock, MagicMock

import pytest
from backend.api import reconciliation_api
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_get_session_reconciliation_summary_uses_canonical_session_lookup(
    monkeypatch,
):
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(return_value=None)

    monkeypatch.setattr(reconciliation_api, "_get_db", lambda: mock_db)

    with pytest.raises(HTTPException) as exc:
        await reconciliation_api.get_session_reconciliation_summary(
            "session-123",
            current_user={"username": "staff1"},
        )

    mock_db.sessions.find_one.assert_awaited_once_with(
        {"$or": [{"id": "session-123"}, {"session_id": "session-123"}]}
    )
    assert exc.value.status_code == 404
