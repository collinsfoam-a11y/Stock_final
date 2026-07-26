"""
Tests for ERPNext import-template validation (BSR): a read-only pass that
checks a generated CSV/XLSX file (or the approved-preview data it would be
built from) against ERPNext's import-template expectations before a human
operator is handed the file for manual import. Never talks to ERPNext.
"""

from datetime import datetime, timezone

import pytest

from backend.services.erpnext_export_import_validation_service import (
    REQUIRED_COLUMNS,
    ErpNextImportValidationService,
)
from backend.services.erpnext_export_service import ErpNextExportService
from backend.services.erpnext_export_settings_service import ErpNextExportSettingsService
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "supervisor1", "role": "supervisor"}
ADMIN_USER = {"username": "admin1", "role": "admin"}
DEFAULT_WAREHOUSE = "WH-1"
DEFAULT_UOM = "PCS"
DEFAULT_COMPANY = "Default Co"


async def _seed_finalized_session(db: InMemoryDatabase, session_id: str) -> None:
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "COMPLETED",
            "warehouse": DEFAULT_WAREHOUSE,
            "finalized_at": datetime.now(timezone.utc),
            "version": 1,
        }
    )


async def _seed_default_mappings(db: InMemoryDatabase) -> None:
    await db.erpnext_warehouse_mappings.insert_one(
        {
            "mapping_id": "map-wh-1",
            "stock_verify_warehouse_id": DEFAULT_WAREHOUSE,
            "stock_verify_warehouse_name": DEFAULT_WAREHOUSE,
            "erpnext_warehouse": "Stores - CO",
            "company": DEFAULT_COMPANY,
            "is_active": True,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )
    await db.erpnext_uom_mappings.insert_one(
        {
            "mapping_id": "map-uom-1",
            "stock_verify_uom": DEFAULT_UOM,
            "erpnext_uom": "Nos",
            "conversion_factor": 1.0,
            "is_active": True,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )


async def _seed_erp_item(db: InMemoryDatabase, item_code: str, **overrides) -> None:
    doc = {
        "item_code": item_code,
        "item_name": f"Item {item_code}",
        "warehouse": DEFAULT_WAREHOUSE,
        "uom_code": DEFAULT_UOM,
        "stock_qty": 90.0,
        "mrp": 25.0,
        "last_synced": datetime.now(timezone.utc),
    }
    doc.update(overrides)
    await db.erp_items.insert_one(doc)


async def _seed_approved_line(db: InMemoryDatabase, session_id: str, item_code: str, **overrides):
    doc = {
        "id": f"line-{item_code}-{session_id}",
        "session_id": session_id,
        "item_code": item_code,
        "item_name": f"Item {item_code}",
        "counted_qty": 100.0,
        "erp_qty": 100.0,
        "approval_status": "APPROVED",
        "status": "approved",
        "uom_code": DEFAULT_UOM,
    }
    doc.update(overrides)
    await db.count_lines.insert_one(doc)
    return doc


async def _approve_ready_preview(
    db: InMemoryDatabase, session_id: str, item_code: str, *, line_overrides=None
) -> dict:
    await _seed_finalized_session(db, session_id)
    await _seed_default_mappings(db)
    await _seed_erp_item(db, item_code)
    await _seed_approved_line(db, session_id, item_code, **(line_overrides or {}))
    preview = await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    await ErpNextExportService(db).approve_preview(export_id=preview["export_id"], current_user=ADMIN_USER)
    return await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})


async def _tamper_first_row(db: InMemoryDatabase, export_id: str, row_updates: dict) -> None:
    """Simulates a row that (by some future regression) slipped through
    approval with a blocker it shouldn't have -- an APPROVED preview is
    guaranteed to have zero row-level blockers today, so this directly
    exercises the validation service's independent safety-net check rather
    than merely trusting that guarantee."""
    stored = await db.erpnext_export_previews.find_one({"export_id": export_id})
    rows = stored["rows"]
    rows[0].update(row_updates)
    tampered = dict(stored)
    tampered["rows"] = rows
    new_hash = ErpNextExportService.compute_approval_hash(tampered)
    await db.erpnext_export_previews.update_one(
        {"export_id": export_id}, {"$set": {"rows": rows, "approval_hash": new_hash}}
    )


@pytest.mark.asyncio
async def test_validation_passes_for_valid_stock_entry():
    db = InMemoryDatabase()
    approved = await _approve_ready_preview(db, "sess-v1", "ITEM-V1")

    result = await ErpNextImportValidationService(db).validate(
        export_id=approved["export_id"], file_type="stock_entry", file_format="csv"
    )

    assert result["valid"] is True
    assert result["errors"] == []
    assert result["file_type"] == "stock-entry"
    assert result["format"] == "csv"
    assert result["row_count"] == 1
    assert result["column_count"] == len(REQUIRED_COLUMNS["stock_entry"])


@pytest.mark.asyncio
async def test_validation_fails_for_missing_required_columns(monkeypatch):
    db = InMemoryDatabase()
    approved = await _approve_ready_preview(db, "sess-v2", "ITEM-V2")
    monkeypatch.setitem(
        REQUIRED_COLUMNS, "stock_entry", REQUIRED_COLUMNS["stock_entry"] + ["Nonexistent Column"]
    )

    result = await ErpNextImportValidationService(db).validate(
        export_id=approved["export_id"], file_type="stock_entry", file_format="csv"
    )

    assert result["valid"] is False
    assert any(e.startswith("MISSING_REQUIRED_COLUMNS:") and "Nonexistent Column" in e for e in result["errors"])


@pytest.mark.asyncio
async def test_validation_fails_for_serialized_item_without_serial_number():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-v3")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-V3", is_serialized=True)
    await _seed_approved_line(db, "sess-v3", "ITEM-V3", counted_qty=1.0, erp_qty=1.0, serial_numbers=["SN-1"])
    preview = await ErpNextExportService(db).generate_preview(
        session_id="sess-v3", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    await ErpNextExportService(db).approve_preview(export_id=preview["export_id"], current_user=ADMIN_USER)
    await _tamper_first_row(
        db, preview["export_id"], {"serial_numbers": [], "blockers": ["SERIAL_REQUIRED_MISSING"]}
    )

    result = await ErpNextImportValidationService(db).validate(
        export_id=preview["export_id"], file_type="serials", file_format="csv"
    )

    assert result["valid"] is False
    assert any(e.startswith("SERIALIZED_ITEM_WITHOUT_SERIAL:") for e in result["errors"])


@pytest.mark.asyncio
async def test_validation_fails_for_batched_item_without_batch_number():
    db = InMemoryDatabase()
    await ErpNextExportSettingsService(db).upsert_item_flags(
        "ITEM-V4", updates={"is_batch_controlled": True}, current_user=ADMIN_USER
    )
    approved = await _approve_ready_preview(
        db, "sess-v4", "ITEM-V4", line_overrides={"batch_id": "BATCH-1"}
    )
    await _tamper_first_row(
        db, approved["export_id"], {"batch_no": None, "blockers": ["BATCH_REQUIRED_MISSING"]}
    )

    result = await ErpNextImportValidationService(db).validate(
        export_id=approved["export_id"], file_type="stock_entry", file_format="csv"
    )

    assert result["valid"] is False
    assert any(e.startswith("BATCHED_ITEM_WITHOUT_BATCH:") for e in result["errors"])


@pytest.mark.asyncio
async def test_validation_fails_for_unmapped_warehouse_and_uom():
    db = InMemoryDatabase()
    approved = await _approve_ready_preview(db, "sess-v5", "ITEM-V5")
    await _tamper_first_row(
        db,
        approved["export_id"],
        {
            "erpnext_warehouse": None,
            "erpnext_uom": None,
            "blockers": ["WAREHOUSE_MAPPING_MISSING", "UOM_MAPPING_MISSING"],
        },
    )

    result = await ErpNextImportValidationService(db).validate(
        export_id=approved["export_id"], file_type="stock_entry", file_format="csv"
    )

    assert result["valid"] is False
    assert any(e.startswith("WAREHOUSE_NOT_MAPPED:") for e in result["errors"])
    assert any(e.startswith("UOM_NOT_MAPPED:") for e in result["errors"])
