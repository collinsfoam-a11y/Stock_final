from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from backend.api.count_lines_routes import unverify_stock, verify_stock


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
async def test_verify_stock_allows_supervisor_and_updates():
    from backend.tests.utils.in_memory_db import InMemoryDatabase

    mock_db = InMemoryDatabase()
    mock_db.count_lines._documents.append(
        {
            "id": "line-1",
            "_id": "mongo-line-1",
            "session_id": "sess-1",
            "location_id": "LOC-1",
            "floor_id": "F1",
            "rack_id": "R1",
            "variance": 1,
        }
    )
    mock_db.sessions._documents.append({"id": "sess-1", "status": "ACTIVE"})

    result = await verify_stock(
        "line-1",
        {"username": "supervisor1", "role": "supervisor"},
        db_override=mock_db,
    )

    assert result["verified"] is True
    updated = await mock_db.count_lines.find_one({"id": "line-1"})
    assert updated["verified"] is True
