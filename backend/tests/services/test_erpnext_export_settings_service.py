"""
Tests for the BSR ERPNext export settings service + admin API: warehouse
mappings, UOM mappings, and item export-control flags that replace
inference-based export blockers (see erpnext_export_service.py and
docs/BSR_REMEDIATION_STATUS.md).
"""

import pytest
from backend.api.erpnext_export_settings_api import (
    ItemExportFlagsCreate,
    ItemExportFlagsUpdate,
    UomMappingCreate,
    UomMappingUpdate,
    WarehouseMappingCreate,
    WarehouseMappingUpdate,
    create_item_flags,
    create_uom_mapping,
    create_warehouse_mapping,
    get_item_flags,
    list_uom_mappings,
    list_warehouse_mappings,
    update_item_flags,
    update_uom_mapping,
    update_warehouse_mapping,
)
from backend.auth.dependencies import require_admin
from backend.services.erpnext_export_settings_service import (
    ErpNextExportSettingsError,
    ErpNextExportSettingsService,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase
from fastapi import HTTPException

ADMIN_USER = {"username": "admin1", "role": "admin"}
STAFF_USER = {"username": "staff1", "role": "staff"}


# ---------------- Warehouse mappings ----------------


@pytest.mark.asyncio
async def test_create_warehouse_mapping_persists_and_is_active():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-1",
        stock_verify_warehouse_name="Main Warehouse",
        erpnext_warehouse="Stores - ABC",
        company="ABC Co",
        current_user=ADMIN_USER,
    )

    assert doc["is_active"] is True
    assert doc["created_by"] == "admin1"
    stored = await db.erpnext_warehouse_mappings.find_one({"mapping_id": doc["mapping_id"]})
    assert stored["erpnext_warehouse"] == "Stores - ABC"


@pytest.mark.asyncio
async def test_create_warehouse_mapping_rejects_duplicate_active_for_same_key():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-1",
        stock_verify_warehouse_name="Main Warehouse",
        erpnext_warehouse="Stores - ABC",
        company="ABC Co",
        current_user=ADMIN_USER,
    )

    with pytest.raises(ErpNextExportSettingsError):
        await service.create_warehouse_mapping(
            stock_verify_warehouse_id="WH-1",
            stock_verify_warehouse_name="Main Warehouse",
            erpnext_warehouse="Stores - Duplicate",
            company="ABC Co",
            current_user=ADMIN_USER,
        )


@pytest.mark.asyncio
async def test_update_warehouse_mapping_can_deactivate_not_delete():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-2",
        stock_verify_warehouse_name="Second Warehouse",
        erpnext_warehouse="Stores - XYZ",
        company="XYZ Co",
        current_user=ADMIN_USER,
    )

    updated = await service.update_warehouse_mapping(
        doc["mapping_id"], updates={"is_active": False}, current_user=ADMIN_USER
    )

    assert updated["is_active"] is False
    # Document still exists -- deactivated, not deleted.
    stored = await db.erpnext_warehouse_mappings.find_one({"mapping_id": doc["mapping_id"]})
    assert stored is not None
    assert stored["is_active"] is False
    assert stored["updated_by"] == "admin1"


@pytest.mark.asyncio
async def test_inactive_warehouse_mapping_not_returned_by_active_lookup():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-3",
        stock_verify_warehouse_name="Third Warehouse",
        erpnext_warehouse="Stores - DEF",
        company="DEF Co",
        current_user=ADMIN_USER,
    )
    await service.update_warehouse_mapping(
        doc["mapping_id"], updates={"is_active": False}, current_user=ADMIN_USER
    )

    found = await service.find_active_warehouse_mapping(
        stock_verify_warehouse_id="WH-3", company="DEF Co"
    )
    assert found is None


@pytest.mark.asyncio
async def test_list_distinct_active_companies_reflects_only_active_mappings():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    assert await service.list_distinct_active_companies() == []

    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-5",
        stock_verify_warehouse_name="Fifth",
        erpnext_warehouse="Stores - Fifth",
        company="Solo Co",
        current_user=ADMIN_USER,
    )
    assert await service.list_distinct_active_companies() == ["Solo Co"]

    await service.update_warehouse_mapping(
        doc["mapping_id"], updates={"is_active": False}, current_user=ADMIN_USER
    )
    assert await service.list_distinct_active_companies() == []


@pytest.mark.asyncio
async def test_find_active_warehouse_mapping_requires_matching_company():
    """Company now disambiguates the lookup key -- a mapping for the same
    warehouse id under a different company must not match."""
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-4",
        stock_verify_warehouse_name="Fourth Warehouse",
        erpnext_warehouse="Stores - GHI",
        company="GHI Co",
        current_user=ADMIN_USER,
    )

    found_wrong_company = await service.find_active_warehouse_mapping(
        stock_verify_warehouse_id="WH-4", company="Some Other Co"
    )
    assert found_wrong_company is None

    found_right_company = await service.find_active_warehouse_mapping(
        stock_verify_warehouse_id="WH-4", company="GHI Co"
    )
    assert found_right_company["erpnext_warehouse"] == "Stores - GHI"


# ---------------- UOM mappings ----------------


@pytest.mark.asyncio
async def test_create_uom_mapping_persists_and_is_active():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    doc = await service.create_uom_mapping(
        stock_verify_uom="PCS", erpnext_uom="Nos", conversion_factor=1.0, current_user=ADMIN_USER
    )

    assert doc["is_active"] is True
    found = await service.find_active_uom_mapping(stock_verify_uom="PCS")
    assert found["erpnext_uom"] == "Nos"


@pytest.mark.asyncio
async def test_create_uom_mapping_rejects_non_positive_conversion_factor():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    with pytest.raises(ErpNextExportSettingsError):
        await service.create_uom_mapping(
            stock_verify_uom="BOX",
            erpnext_uom="Box",
            conversion_factor=0,
            current_user=ADMIN_USER,
        )
    with pytest.raises(ErpNextExportSettingsError):
        await service.create_uom_mapping(
            stock_verify_uom="BOX",
            erpnext_uom="Box",
            conversion_factor=-5,
            current_user=ADMIN_USER,
        )


@pytest.mark.asyncio
async def test_update_uom_mapping_rejects_non_positive_conversion_factor():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    doc = await service.create_uom_mapping(
        stock_verify_uom="KG", erpnext_uom="Kg", conversion_factor=1.0, current_user=ADMIN_USER
    )

    with pytest.raises(ErpNextExportSettingsError):
        await service.update_uom_mapping(
            doc["mapping_id"], updates={"conversion_factor": -1.0}, current_user=ADMIN_USER
        )


@pytest.mark.asyncio
async def test_create_uom_mapping_rejects_duplicate_active_for_same_uom():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    await service.create_uom_mapping(
        stock_verify_uom="LTR", erpnext_uom="Litre", conversion_factor=1.0, current_user=ADMIN_USER
    )

    with pytest.raises(ErpNextExportSettingsError):
        await service.create_uom_mapping(
            stock_verify_uom="LTR",
            erpnext_uom="Ltr Duplicate",
            conversion_factor=1.0,
            current_user=ADMIN_USER,
        )


# ---------------- Item export-control flags ----------------


@pytest.mark.asyncio
async def test_upsert_item_flags_creates_then_updates():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    created = await service.upsert_item_flags(
        "ITEM-100", updates={"is_serialized": True}, current_user=ADMIN_USER
    )
    assert created["is_serialized"] is True
    assert created["is_batch_controlled"] is None

    updated = await service.upsert_item_flags(
        "ITEM-100", updates={"is_batch_controlled": True}, current_user=ADMIN_USER
    )
    assert updated["is_serialized"] is True  # unchanged
    assert updated["is_batch_controlled"] is True
    assert updated["updated_by"] == "admin1"


@pytest.mark.asyncio
async def test_resolve_item_export_flags_prefers_erp_master_for_is_serialized():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    await service.upsert_item_flags(
        "ITEM-101", updates={"is_serialized": False}, current_user=ADMIN_USER
    )

    resolved = await service.resolve_item_export_flags(
        erp_item={"is_serialized": True}, item_code="ITEM-101"
    )

    assert resolved["is_serialized"] is True  # ERP master wins over the flag doc


@pytest.mark.asyncio
async def test_resolve_item_export_flags_defaults_to_false_when_nothing_configured():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    resolved = await service.resolve_item_export_flags(erp_item={}, item_code="ITEM-NEVER-SEEN")

    assert resolved == {
        "is_serialized": False,
        "is_batch_controlled": False,
        "allow_negative_opening_qty": False,
        "requires_photo_for_export": False,
        "requires_item_master_validation": False,
    }


# ---------------- Admin gating ----------------


@pytest.mark.asyncio
async def test_require_admin_rejects_non_admin_role():
    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user=STAFF_USER)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_accepts_admin_role():
    result = await require_admin(current_user=ADMIN_USER)
    assert result == ADMIN_USER


# ---------------- Router-level CRUD (admin already resolved) ----------------


@pytest.mark.asyncio
async def test_router_create_and_list_warehouse_mapping(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)

    created = await create_warehouse_mapping(
        WarehouseMappingCreate(
            stock_verify_warehouse_id="WH-9",
            stock_verify_warehouse_name="Ninth",
            erpnext_warehouse="Stores - Ninth",
            company="Ninth Co",
        ),
        current_user=ADMIN_USER,
    )
    assert created["erpnext_warehouse"] == "Stores - Ninth"

    listed = await list_warehouse_mappings(active_only=True, current_user=ADMIN_USER)
    assert any(m["mapping_id"] == created["mapping_id"] for m in listed)


@pytest.mark.asyncio
async def test_router_update_warehouse_mapping_rejects_bad_mapping_id(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)

    with pytest.raises(HTTPException) as exc_info:
        await update_warehouse_mapping(
            "does-not-exist",
            WarehouseMappingUpdate(is_active=False),
            current_user=ADMIN_USER,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_router_create_and_list_uom_mapping(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)

    created = await create_uom_mapping(
        UomMappingCreate(stock_verify_uom="EA", erpnext_uom="Each", conversion_factor=1.0),
        current_user=ADMIN_USER,
    )
    assert created["erpnext_uom"] == "Each"

    listed = await list_uom_mappings(active_only=True, current_user=ADMIN_USER)
    assert any(m["mapping_id"] == created["mapping_id"] for m in listed)


@pytest.mark.asyncio
async def test_router_update_uom_mapping_rejects_non_positive_factor(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)
    created = await create_uom_mapping(
        UomMappingCreate(stock_verify_uom="DZ", erpnext_uom="Dozen", conversion_factor=12.0),
        current_user=ADMIN_USER,
    )

    with pytest.raises(HTTPException) as exc_info:
        await update_uom_mapping(
            created["mapping_id"],
            UomMappingUpdate(conversion_factor=0),
            current_user=ADMIN_USER,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_router_create_get_update_item_flags(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)

    created = await create_item_flags(
        ItemExportFlagsCreate(item_code="ITEM-200", is_batch_controlled=True),
        current_user=ADMIN_USER,
    )
    assert created["is_batch_controlled"] is True

    fetched = await get_item_flags("ITEM-200", current_user=ADMIN_USER)
    assert fetched["item_code"] == "ITEM-200"

    updated = await update_item_flags(
        "ITEM-200",
        ItemExportFlagsUpdate(allow_negative_opening_qty=True),
        current_user=ADMIN_USER,
    )
    assert updated["allow_negative_opening_qty"] is True
    assert updated["is_batch_controlled"] is True  # unchanged by the update


@pytest.mark.asyncio
async def test_router_get_item_flags_404_when_not_configured(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_export_settings_api.get_db", lambda: db)

    with pytest.raises(HTTPException) as exc_info:
        await get_item_flags("ITEM-NEVER-CONFIGURED", current_user=ADMIN_USER)
    assert exc_info.value.status_code == 404


# ---------------- Audit ----------------


@pytest.mark.asyncio
async def test_warehouse_mapping_create_writes_audit_event():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-AUDIT",
        stock_verify_warehouse_name="Audit Warehouse",
        erpnext_warehouse="Stores - Audit",
        company="Audit Co",
        current_user=ADMIN_USER,
    )

    entry = await db.audit_logs.find_one({"entity_id": doc["mapping_id"]})
    assert entry is not None
    assert entry["event_type"] == "EXPORT_MAPPING_CHANGED"
    assert entry["details"]["action"] == "WAREHOUSE_MAPPING_CREATED"
    assert entry["actor_username"] == "admin1"


@pytest.mark.asyncio
async def test_warehouse_mapping_update_writes_audit_event_with_before_after():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)
    doc = await service.create_warehouse_mapping(
        stock_verify_warehouse_id="WH-AUDIT-2",
        stock_verify_warehouse_name="Audit Warehouse 2",
        erpnext_warehouse="Stores - Audit 2",
        company="Audit Co 2",
        current_user=ADMIN_USER,
    )

    await service.update_warehouse_mapping(
        doc["mapping_id"], updates={"is_active": False}, current_user=ADMIN_USER
    )

    entries = await db.audit_logs.find(
        {"entity_id": doc["mapping_id"], "details.action": "WAREHOUSE_MAPPING_UPDATED"}
    ).to_list(length=10)
    assert len(entries) == 1
    assert entries[0]["before"]["is_active"] is True
    assert entries[0]["after"]["is_active"] is False


@pytest.mark.asyncio
async def test_uom_mapping_create_writes_audit_event():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    doc = await service.create_uom_mapping(
        stock_verify_uom="MTR", erpnext_uom="Meter", conversion_factor=1.0, current_user=ADMIN_USER
    )

    entry = await db.audit_logs.find_one({"entity_id": doc["mapping_id"]})
    assert entry is not None
    assert entry["event_type"] == "EXPORT_MAPPING_CHANGED"
    assert entry["details"]["action"] == "UOM_MAPPING_CREATED"


@pytest.mark.asyncio
async def test_item_flags_create_and_update_write_audit_events():
    db = InMemoryDatabase()
    service = ErpNextExportSettingsService(db)

    await service.upsert_item_flags(
        "ITEM-AUDIT", updates={"is_serialized": True}, current_user=ADMIN_USER
    )
    await service.upsert_item_flags(
        "ITEM-AUDIT", updates={"is_batch_controlled": True}, current_user=ADMIN_USER
    )

    entries = await db.audit_logs.find({"entity_id": "ITEM-AUDIT"}).to_list(length=10)
    actions = {entry["details"]["action"] for entry in entries}
    assert actions == {"ITEM_EXPORT_FLAGS_CREATED", "ITEM_EXPORT_FLAGS_UPDATED"}
