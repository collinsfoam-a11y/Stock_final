from unittest.mock import AsyncMock

import pytest

from backend.api.unknown_items_api import (
    CreateSKUFromUnknownRequest,
    UnknownItemReportRequest,
    create_sku_from_unknown,
    report_unknown_item,
)


@pytest.mark.asyncio
async def test_report_unknown_item_strips_client_audit_fields(monkeypatch):
    service = AsyncMock()
    service.register_unknown_item.return_value = {"id": "unknown-1"}

    request = UnknownItemReportRequest(
        session_id="sess-1",
        location_id="LOC-1",
        floor_id="F1",
        rack_id="R1",
        barcode="510001",
        counted_qty=2.0,
        reported_by="spoofed",
        reported_at="2026-01-01T00:00:00",
        synced_at="2026-01-01T00:00:00",
    )
    current_user = {"username": "staff1", "role": "staff", "_id": "u1"}

    response = await report_unknown_item(
        request,
        current_user=current_user,
        service=service,
    )

    assert response == {"success": True, "data": {"id": "unknown-1"}}
    service.register_unknown_item.assert_awaited_once()
    payload = service.register_unknown_item.await_args.kwargs["payload"]
    assert payload == {
        "session_id": "sess-1",
        "location_id": "LOC-1",
        "floor_id": "F1",
        "rack_id": "R1",
        "barcode": "510001",
        "counted_qty": 2.0,
    }


@pytest.mark.asyncio
async def test_create_sku_from_unknown_uses_transactional_service(monkeypatch):
    service = AsyncMock()
    service.create_manual_sku_and_resolve.return_value = {
        "unknown_item_id": "unknown-1",
        "target_item_code": "SKU-1",
        "count_line_id": "line-1",
        "manual_sku_created": True,
    }

    request = CreateSKUFromUnknownRequest(
        item_code="SKU-1",
        item_name="Widget",
        category="General",
        subcategory="Tools",
        mrp=12.5,
        uom_code="PCS",
        resolve_notes="create and map",
    )
    current_user = {"username": "admin1", "role": "admin"}

    response = await create_sku_from_unknown(
        "unknown-1",
        request,
        current_user=current_user,
        service=service,
    )

    assert response["success"] is True
    assert response["data"]["manual_sku_created"] is True
    service.create_manual_sku_and_resolve.assert_awaited_once_with(
        item_id="unknown-1",
        item_code="SKU-1",
        item_name="Widget",
        category="General",
        subcategory="Tools",
        mrp=12.5,
        uom_code="PCS",
        actor_id="admin1",
        resolve_notes="create and map",
    )
