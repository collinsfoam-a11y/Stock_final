from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api import reconciliation_api
from backend.services.reconciliation_service import ReconciliationService


@pytest.mark.asyncio
async def test_get_session_reconciliation_summary_uses_canonical_session_lookup(
):
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await reconciliation_api.get_session_reconciliation_summary(
            "session-123",
            current_user={"username": "staff1"},
            reconciliation_service=ReconciliationService(mock_db),
        )

    mock_db.sessions.find_one.assert_awaited_once_with(
        {"$or": [{"id": "session-123"}, {"session_id": "session-123"}]}
    )
    assert exc.value.status_code == 404
