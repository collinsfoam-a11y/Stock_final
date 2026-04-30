from __future__ import annotations
import pytest
from backend.services.governance_guard import install_db_write_guards, GovernanceViolation
from backend.services.dynamic_fields_service import DynamicFieldsService
from backend.tests.utils.in_memory_db import InMemoryDatabase

@pytest.mark.asyncio
async def test_dynamic_fields_service_governance():
    db = InMemoryDatabase()
    
    # Seed item
    await db.erp_items.insert_one({
        "item_code": "ITEM-1",
        "item_name": "Test Item"
    })
    
    # Install guards
    install_db_write_guards(db)
    
    service = DynamicFieldsService(db)
    
    # 1. Authorized write should succeed
    await service.create_field_definition(
        field_name="warranty",
        field_type="text",
        display_label="Warranty",
        db_mapping="custom_warranty"
    )
    
    # Should succeed now
    await service.set_field_value(
        item_code="ITEM-1",
        field_name="warranty",
        value="1 year",
        set_by="admin"
    )
    
    # Verify the write happened
    item = await db.erp_items.find_one({"item_code": "ITEM-1"})
    assert item["custom_warranty"] == "1 year"

@pytest.mark.asyncio
async def test_dynamic_fields_service_unauthorized_write():
    db = InMemoryDatabase()
    install_db_write_guards(db)
    
    # Manually try to write to a guarded collection without authority
    with pytest.raises(GovernanceViolation, match="Direct DB write forbidden"):
        await db.dynamic_field_definitions.insert_one({"test": "data"})
