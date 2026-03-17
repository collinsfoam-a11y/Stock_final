from unittest.mock import AsyncMock

import pytest

from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.mark.asyncio
@pytest.mark.governance
async def test_sql_verification_conflict_forks_on_stale_write(monkeypatch):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    item_code = "ITEM-CONFLICT-1"
    await db.erp_items.insert_one({"item_code": item_code, "stock_qty": 10.0})

    from backend.services.sql_verification_service import sql_verification_service

    monkeypatch.setattr(sql_verification_service, "_get_sql_quantity", AsyncMock(return_value=15.0))

    original_find_one = db.erp_items.find_one
    mutated = {"done": False}

    async def find_one_wrapper(*args, **kwargs):
        doc = await original_find_one(*args, **kwargs)
        if doc and not mutated["done"]:
            mutated["done"] = True
            for record in db.erp_items._documents:
                if record.get("item_code") == item_code:
                    record["stock_qty"] = 999.0
        return doc

    db.erp_items.find_one = find_one_wrapper

    result = await sql_verification_service.verify_item_quantity(item_code)
    assert result["success"] is False
    assert result.get("status") == "conflict"

    conflict = await db.verification_conflicts.find_one({"item_code": item_code})
    assert conflict is not None

    current = await original_find_one({"item_code": item_code})
    assert current is not None
    assert "sql_verified_qty" not in current
