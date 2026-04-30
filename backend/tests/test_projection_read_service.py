from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from backend.services.advanced_report_service import (
    AdvancedReportService,
    ReportConfig,
    ReportFilters,
    ReportSummary,
)
from backend.services.projection_read_service import ProjectionReadService
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_projection_verified_items_report_uses_projection_rows():
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db["verified_items_projection"].insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "warehouse": "Main",
            "floor": "F1",
            "rack_id": "R1",
            "erp_qty": 5,
            "counted_qty": 7,
            "variance": 2,
            "mrp_erp": 10,
            "verified": True,
            "status": "locked",
            "counted_at": now,
        }
    )

    config = ReportConfig(
        report_type="verified_items",
        filters=ReportFilters(warehouse="Main"),
        include_aggregations=True,
    )
    service = ProjectionReadService(db)

    result = await service.generate_verified_items_report(
        config,
        columns=AdvancedReportService.REPORT_COLUMNS["verified_items"],
        summary_model=ReportSummary,
    )

    assert result["success"] is True
    assert result["data"][0]["item_code"] == "ITEM-1"
    assert result["data"][0]["variance"] == 2
    assert result["summary"]["aggregations"]["verified_count"] == 1


@pytest.mark.asyncio
async def test_projection_read_service_fails_when_required_collection_missing():
    db = InMemoryDatabase()
    service = ProjectionReadService(db)

    with pytest.raises(HTTPException) as exc:
        await service.get_item_details("missing-line")

    assert exc.value.status_code == 404
