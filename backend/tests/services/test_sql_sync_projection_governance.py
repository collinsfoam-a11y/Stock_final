import pytest
from backend.services.sql_sync_service import (
    ERP_REFRESH_FORBIDDEN_FIELDS,
    ERPProjectionPolicyError,
    SQLSyncService,
)


@pytest.mark.asyncio
async def test_projection_governance_allows_valid_fields(test_db):
    svc = SQLSyncService(None, test_db)

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_GOV_OK", "stock_qty": 0.0, "mrp": None, "sale_price": None}
    )

    # Update with valid ERP metadata
    sql_item = {"item_code": "ITEM_GOV_OK", "stock_qty": 10.0, "mrp": 199.0, "sale_price": 180.0}
    stats = {"qty_changes_detected": 0, "qty_updated": 0}

    await svc._update_existing_item(
        "ITEM_GOV_OK", sql_item, 10.0, {"stock_qty": 0.0, "mrp": None, "sale_price": None}, stats
    )

    updated = await test_db.erp_items.find_one({"item_code": "ITEM_GOV_OK"})
    assert updated["stock_qty"] == 10.0
    assert updated["mrp"] == 199.0
    assert updated["sale_price"] == 180.0


@pytest.mark.asyncio
async def test_projection_governance_blocks_forbidden_fields(test_db):
    svc = SQLSyncService(None, test_db)

    await test_db.erp_items.insert_one(
        {"item_code": "ITEM_GOV_FORBIDDEN", "stock_qty": 5.0, "session_baseline": 5.0}
    )

    for forbidden_field in ERP_REFRESH_FORBIDDEN_FIELDS:
        sql_item = {"item_code": "ITEM_GOV_FORBIDDEN", forbidden_field: 99.0}
        stats = {"qty_changes_detected": 0, "qty_updated": 0}

        with pytest.raises(ERPProjectionPolicyError) as exc_info:
            await svc._update_existing_item(
                "ITEM_GOV_FORBIDDEN", sql_item, 10.0, {"stock_qty": 5.0}, stats
            )
        assert "forbidden counting fields" in str(exc_info.value)
