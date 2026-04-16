from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.app_factory import unverify_stock, verify_stock


@pytest.mark.asyncio
@pytest.mark.governance
async def test_verify_stock_rejects_non_supervisor():
    mock_db = MagicMock()
    mock_db.count_lines.update_one = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await verify_stock(
            "line-1",
            {"username": "staff1", "role": "staff"},
            db_override=mock_db,
        )

    assert exc.value.status_code == 403
    mock_db.count_lines.update_one.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.governance
async def test_unverify_stock_rejects_non_supervisor():
    mock_db = MagicMock()
    mock_db.count_lines.update_one = AsyncMock()

    with pytest.raises(HTTPException) as exc:
        await unverify_stock(
            "line-1",
            {"username": "staff1", "role": "staff"},
            db_override=mock_db,
        )

    assert exc.value.status_code == 403
    mock_db.count_lines.update_one.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.governance
async def test_verify_stock_allows_supervisor_and_updates(monkeypatch):
    mock_db = MagicMock()
    mock_db.count_lines.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

    import backend.app_factory as app_factory

    monkeypatch.setattr(app_factory, "activity_log_service", None)

    result = await verify_stock(
        "line-1",
        {"username": "supervisor1", "role": "supervisor"},
        db_override=mock_db,
    )

    assert result["verified"] is True
    mock_db.count_lines.update_one.assert_awaited_once()
