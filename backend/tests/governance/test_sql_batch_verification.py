from unittest.mock import Mock

import pytest

from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.mark.asyncio
@pytest.mark.governance
async def test_batch_verification_rejects_incomplete_quantity_results(monkeypatch):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    await db.erp_items.insert_one({"item_code": "ITEM-BATCH-1", "stock_qty": 10.0})
    await db.erp_items.insert_one({"item_code": "ITEM-BATCH-2", "stock_qty": 5.0})

    from backend.services.sql_verification_service import sql_verification_service

    monkeypatch.setattr(
        sql_verification_service.sql_connector,
        "get_item_quantities_only",
        Mock(return_value={"ITEM-BATCH-1": 12.0}),
    )

    response = await sql_verification_service.batch_verify_items(
        ["ITEM-BATCH-1", "ITEM-BATCH-2"]
    )

    assert response["success"] is False
    assert response["error_code"] == "ERP_AMBIGUOUS_BATCH_RESULT"
    assert response["error_count"] == 2
