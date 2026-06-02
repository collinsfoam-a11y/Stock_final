from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from datetime import datetime

from backend.api import reconciliation_api
from backend.tenancy.scoping import org_scoped_filter


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
        org_scoped_filter(None, {"$or": [{"id": "session-123"}, {"session_id": "session-123"}]})
    )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_session_reconciliation_summary_includes_movements_and_snapshot(monkeypatch):
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(
        return_value={
            "id": "session-1",
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "status": "ACTIVE",
            "started_at": datetime(2024, 1, 1, 10, 0, 0),
        }
    )
    mock_db.session_snapshots.find_one = AsyncMock(
        return_value={
            "session_id": "session-1",
            "items": [{"item_code": "ITEM-1", "stock_qty": 10}],
        }
    )
    movement_cursor = MagicMock()
    movement_cursor.to_list = AsyncMock(return_value=[{"_id": "ITEM-1", "movement_qty": 2}])
    mock_db.inventory_movements.aggregate = MagicMock(return_value=movement_cursor)

    count_cursor = MagicMock()
    count_cursor.to_list = AsyncMock(
        return_value=[
            {
                "item_code": "ITEM-1",
                "item_name": "Item One",
                "barcode": "111",
                "total_counted": 11,
                "baseline_qty": 10,
                "baseline_values": [10],
                "baseline_conflict": False,
                "baseline_hash": "hash-1",
                "system_stock": 12,
                "count_variance": 1,
                "erp_drift": 2,
                "final_gap": -1,
                "locations": [],
                "last_counted_at": datetime(2024, 1, 1, 10, 5, 0),
            }
        ]
    )
    mock_db.count_lines.aggregate = MagicMock(return_value=count_cursor)

    monkeypatch.setattr(reconciliation_api, "_get_db", lambda: mock_db)

    result = await reconciliation_api.get_session_reconciliation_summary(
        "session-1",
        current_user={"username": "staff1", "role": "staff"},
    )
    assert result["success"] is True
    assert result["warehouse"] == "WH-1"
    assert result["stats"]["items_with_true_variance"] == 1
    assert result["stats"]["total_true_variance_qty"] == 1.0
    assert len(result["items"]) == 1
    item = result["items"][0]
    assert item["opening_qty"] == 10.0
    assert item["movement_qty"] == 2.0
    assert item["expected_qty"] == 12.0
    assert item["true_variance"] == 1.0
    assert item["true_status"] == "MISSING"


@pytest.mark.asyncio
async def test_get_session_reconciliation_summary_requires_snapshot(monkeypatch):
    mock_db = MagicMock()
    mock_db.sessions.find_one = AsyncMock(
        return_value={
            "id": "session-2",
            "warehouse": "WH-1",
            "staff_user": "staff1",
            "status": "ACTIVE",
            "started_at": datetime(2024, 1, 1, 10, 0, 0),
        }
    )
    mock_db.session_snapshots.find_one = AsyncMock(return_value=None)

    monkeypatch.setattr(reconciliation_api, "_get_db", lambda: mock_db)

    with pytest.raises(HTTPException) as exc:
        await reconciliation_api.get_session_reconciliation_summary(
            "session-2",
            current_user={"username": "staff1", "role": "staff"},
        )
    assert exc.value.status_code == 503
