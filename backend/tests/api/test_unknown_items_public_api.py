from unittest.mock import AsyncMock

import pytest

from backend.api.unknown_items_api import UnknownItemReportRequest, report_unknown_item


@pytest.mark.asyncio
async def test_report_unknown_item_sets_audit_fields():
    mock_db = AsyncMock()

    request = UnknownItemReportRequest(
        session_id="sess-1",
        barcode="510001",
        counted_qty=2.0,
        reported_by="spoofed",
    )

    current_user = {"username": "staff1", "role": "staff", "_id": "u1"}

    response = await report_unknown_item(request, db=mock_db, current_user=current_user)

    assert response["success"] is True
    assert "id" in response["data"]

    mock_db.unknown_items.insert_one.assert_called_once()
    inserted = mock_db.unknown_items.insert_one.call_args.args[0]

    assert inserted["session_id"] == "sess-1"
    assert inserted["barcode"] == "510001"
    assert inserted["counted_qty"] == 2.0

    # Server-side audit fields override any client-supplied values.
    assert inserted["reported_by"] == "staff1"
    assert "reported_at" in inserted
    assert "synced_at" in inserted


@pytest.mark.asyncio
async def test_report_unknown_item_defaults_counted_qty():
    mock_db = AsyncMock()

    request = UnknownItemReportRequest(session_id="sess-1", barcode="510001")
    current_user = {"username": "staff1", "role": "staff", "_id": "u1"}

    response = await report_unknown_item(request, db=mock_db, current_user=current_user)

    assert response["success"] is True

    inserted = mock_db.unknown_items.insert_one.call_args.args[0]
    assert inserted["counted_qty"] == 1.0
