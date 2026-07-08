"""
Tests for the BSR ERPNext export preview service (preview-only: no direct
ERPNext push, no final import file generation).

Exercises ErpNextExportService.generate_preview directly against
InMemoryDatabase -- the API router (backend/api/erpnext_exports_api.py) is a
thin pass-through already verified separately by importing app_factory and
confirming the route registers at /api/erpnext-exports/preview.

Warehouse/UOM mapping and item export-control flag CRUD/admin-gating/audit
tests live in test_erpnext_export_settings_service.py; this file only
exercises how the preview consumes them.
"""

from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from backend.api.erpnext_exports_api import ErpNextExportPreviewRequest, preview_erpnext_export
from backend.services.erpnext_export_service import (
    ErpNextExportApprovalError,
    ErpNextExportNotFoundError,
    ErpNextExportPreviewError,
    ErpNextExportService,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "supervisor1", "role": "supervisor"}
DEFAULT_WAREHOUSE = "WH-1"
DEFAULT_UOM = "PCS"
DEFAULT_COMPANY = "Default Co"


async def _seed_finalized_session(
    db: InMemoryDatabase, session_id: str, *, warehouse: str = DEFAULT_WAREHOUSE, finalized_at=None
) -> None:
    await db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "status": "COMPLETED",
            "warehouse": warehouse,
            "finalized_at": finalized_at or datetime.now(timezone.utc),
            "version": 1,
        }
    )


async def _seed_erp_item(db: InMemoryDatabase, item_code: str, **overrides) -> None:
    doc = {
        "item_code": item_code,
        "item_name": f"Item {item_code}",
        "warehouse": DEFAULT_WAREHOUSE,
        "uom_code": DEFAULT_UOM,
        "stock_qty": 100.0,
        "mrp": 10.0,
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
        "erp_qty": 100.0,  # frozen baseline
        "approval_status": "APPROVED",
        "status": "approved",
        "uom_code": DEFAULT_UOM,
    }
    doc.update(overrides)
    await db.count_lines.insert_one(doc)
    return doc


async def _seed_warehouse_mapping(
    db: InMemoryDatabase,
    *,
    stock_verify_warehouse_id: str = DEFAULT_WAREHOUSE,
    erpnext_warehouse: str = "ERPNext WH 1 - CO",
    company: str = "Default Co",
    is_active: bool = True,
) -> None:
    await db.erpnext_warehouse_mappings.insert_one(
        {
            "mapping_id": f"map-wh-{stock_verify_warehouse_id}-{company}-{is_active}",
            "stock_verify_warehouse_id": stock_verify_warehouse_id,
            "stock_verify_warehouse_name": stock_verify_warehouse_id,
            "erpnext_warehouse": erpnext_warehouse,
            "company": company,
            "is_active": is_active,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )


async def _seed_uom_mapping(
    db: InMemoryDatabase,
    *,
    stock_verify_uom: str = DEFAULT_UOM,
    erpnext_uom: str = "Nos",
    conversion_factor: float = 1.0,
    is_active: bool = True,
) -> None:
    await db.erpnext_uom_mappings.insert_one(
        {
            "mapping_id": f"map-uom-{stock_verify_uom}-{is_active}",
            "stock_verify_uom": stock_verify_uom,
            "erpnext_uom": erpnext_uom,
            "conversion_factor": conversion_factor,
            "is_active": is_active,
            "created_by": "admin1",
            "created_at": datetime.now(timezone.utc),
            "updated_by": None,
            "updated_at": None,
        }
    )


async def _seed_item_flags(db: InMemoryDatabase, item_code: str, **flags) -> None:
    doc = {
        "item_code": item_code,
        "is_serialized": None,
        "is_batch_controlled": None,
        "allow_negative_opening_qty": None,
        "requires_photo_for_export": None,
        "created_by": "admin1",
        "created_at": datetime.now(timezone.utc),
        "updated_by": None,
        "updated_at": None,
    }
    doc.update(flags)
    await db.erpnext_item_export_flags.insert_one(doc)


async def _seed_default_mappings(db: InMemoryDatabase) -> None:
    """Convenience for tests that aren't about mapping resolution itself."""
    await _seed_warehouse_mapping(db)
    await _seed_uom_mapping(db)


@pytest.mark.asyncio
async def test_preview_blocks_if_session_not_finalized():
    db = InMemoryDatabase()
    await db.sessions.insert_one(
        {"id": "sess-1", "session_id": "sess-1", "status": "ACTIVE", "warehouse": "WH-1"}
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-1", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert result["status"] == "VALIDATION_FAILED"
    assert "SESSION_NOT_FINALIZED" in result["blockers"]


@pytest.mark.asyncio
async def test_preview_blocks_if_no_approved_lines():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-2")
    await _seed_erp_item(db, "ITEM-2")
    await db.count_lines.insert_one(
        {
            "id": "line-2",
            "session_id": "sess-2",
            "item_code": "ITEM-2",
            "counted_qty": 5.0,
            "erp_qty": 5.0,
            "approval_status": "REJECTED",
            "status": "rejected",
        }
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-2", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert result["status"] == "VALIDATION_FAILED"
    assert "NO_APPROVED_LINES" in result["blockers"]


@pytest.mark.asyncio
async def test_preview_calculates_all_formulas_correctly():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-3")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-3", stock_qty=80.0)
    await _seed_approved_line(db, "sess-3", "ITEM-3", counted_qty=95.0, erp_qty=100.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-3", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    row = result["rows"][0]
    # baseline_qty=100 (frozen), existing_sql_qty=80 (fresh), counted_qty=95
    assert row["baseline_qty"] == 100.0
    assert row["existing_sql_qty"] == 80.0
    assert row["counted_qty"] == 95.0
    assert row["stock_verify_variance"] == 95.0 - 100.0  # counted - baseline
    assert row["erp_drift"] == 80.0 - 100.0  # existing_sql - baseline
    assert row["final_gap"] == 95.0 - 80.0  # counted - existing_sql
    assert row["erpnext_opening_qty"] == 95.0  # counted_qty
    assert row["erpnext_adjustment_qty"] == 95.0 - 80.0  # counted - existing_sql
    assert result["status"] == "READY_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_preview_never_uses_variance_as_erpnext_adjustment():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-4")
    await _seed_default_mappings(db)
    # baseline (100) and existing_sql (80) deliberately differ so variance
    # (counted - baseline) and adjustment (counted - existing_sql) diverge.
    await _seed_erp_item(db, "ITEM-4", stock_qty=80.0)
    await _seed_approved_line(db, "sess-4", "ITEM-4", counted_qty=95.0, erp_qty=100.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-4", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    row = result["rows"][0]
    assert row["stock_verify_variance"] != row["erpnext_adjustment_qty"]
    assert row["erpnext_adjustment_qty"] == row["counted_qty"] - row["existing_sql_qty"]


@pytest.mark.asyncio
async def test_unknown_unmapped_item_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-5")
    await _seed_default_mappings(db)
    # No erp_items document for ITEM-5 at all.
    await _seed_approved_line(db, "sess-5", "ITEM-5", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-5", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert result["status"] == "VALIDATION_FAILED"
    assert "UNKNOWN_ITEM_UNMAPPED" in result["blockers"]
    assert "UNKNOWN_ITEM_UNMAPPED" in result["rows"][0]["blockers"]


@pytest.mark.asyncio
async def test_serialized_item_without_serials_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-6")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-6", is_serialized=True)
    await _seed_approved_line(db, "sess-6", "ITEM-6", counted_qty=1.0, erp_qty=1.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-6", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "SERIAL_REQUIRED_MISSING" in result["blockers"]


@pytest.mark.asyncio
async def test_serial_count_mismatch_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-7")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-7", is_serialized=True)
    await _seed_approved_line(
        db,
        "sess-7",
        "ITEM-7",
        counted_qty=2.0,
        erp_qty=2.0,
        serial_numbers=["SN-1"],  # only 1 serial for counted_qty=2
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-7", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "SERIAL_COUNT_MISMATCH" in result["blockers"]


@pytest.mark.asyncio
async def test_duplicate_serial_in_export_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-8")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-8", is_serialized=True)
    await _seed_approved_line(
        db,
        "sess-8",
        "ITEM-8",
        counted_qty=1.0,
        erp_qty=1.0,
        serial_numbers=["SN-DUP"],
        id="line-8a",
    )
    await _seed_approved_line(
        db,
        "sess-8",
        "ITEM-8",
        counted_qty=1.0,
        erp_qty=1.0,
        serial_numbers=["SN-DUP"],
        id="line-8b",
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-8", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "SERIAL_DUPLICATE_IN_EXPORT" in result["blockers"]


@pytest.mark.asyncio
async def test_batch_controlled_item_without_batch_no_blocks_using_explicit_flag():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-9")
    await _seed_default_mappings(db)
    # Item master's own batch_no presence is intentionally NOT used to infer
    # batch control anymore -- only the explicit flag matters.
    await _seed_erp_item(db, "ITEM-9", batch_no="BATCH-MASTER-1")
    await _seed_item_flags(db, "ITEM-9", is_batch_controlled=True)
    await _seed_approved_line(db, "sess-9", "ITEM-9", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-9", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "BATCH_REQUIRED_MISSING" in result["blockers"]


@pytest.mark.asyncio
async def test_non_batch_controlled_item_without_batch_no_does_not_block():
    """Even though the item master itself carries a batch_no (which used to
    trigger the old inference-based blocker), an explicit
    is_batch_controlled=False flag must NOT block -- the flag is
    authoritative, not the historical presence of batch_no on the master."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-9b")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-9B", batch_no="BATCH-MASTER-2")
    await _seed_item_flags(db, "ITEM-9B", is_batch_controlled=False)
    await _seed_approved_line(db, "sess-9b", "ITEM-9B", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-9b", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "BATCH_REQUIRED_MISSING" not in result["blockers"]
    assert result["status"] == "READY_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_batch_controlled_item_with_no_flag_configured_does_not_block():
    """Safe default: no ERP-master source and no explicit flags row at all
    -> is_batch_controlled defaults to False, matching 'do not fabricate'."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-9c")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-9C", batch_no="BATCH-MASTER-3")
    await _seed_approved_line(db, "sess-9c", "ITEM-9C", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-9c", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "BATCH_REQUIRED_MISSING" not in result["blockers"]


@pytest.mark.asyncio
async def test_high_variance_without_photo_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-10")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-10")
    await _seed_approved_line(
        db,
        "sess-10",
        "ITEM-10",
        counted_qty=50.0,
        erp_qty=10.0,
        requires_supervisor_approval=True,
        violated_thresholds=[{"threshold_type": "quantity"}],
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-10", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "HIGH_VARIANCE_PHOTO_MISSING" in result["blockers"]


@pytest.mark.asyncio
async def test_requires_photo_for_export_flag_blocks_even_without_high_variance():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-10b")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-10B")
    await _seed_item_flags(db, "ITEM-10B", requires_photo_for_export=True)
    await _seed_approved_line(db, "sess-10b", "ITEM-10B", counted_qty=100.0, erp_qty=100.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-10b", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "HIGH_VARIANCE_PHOTO_MISSING" in result["blockers"]


@pytest.mark.asyncio
async def test_missing_warehouse_mapping_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-11", warehouse="")
    await _seed_uom_mapping(db)
    await _seed_erp_item(db, "ITEM-11", warehouse=None)
    await _seed_approved_line(db, "sess-11", "ITEM-11", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-11", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "WAREHOUSE_MAPPING_MISSING" in result["blockers"]
    assert result["rows"][0]["erpnext_warehouse"] is None


@pytest.mark.asyncio
async def test_active_warehouse_mapping_resolves_erpnext_warehouse_on_row():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-11b")
    await _seed_uom_mapping(db)
    await _seed_warehouse_mapping(
        db, stock_verify_warehouse_id="WH-1", erpnext_warehouse="Stores - ABC", company="ABC Co"
    )
    await _seed_erp_item(db, "ITEM-11B")
    await _seed_approved_line(db, "sess-11b", "ITEM-11B", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-11b", mode="STOCK_ADJUSTMENT", company="ABC Co", current_user=CURRENT_USER
    )

    assert "WAREHOUSE_MAPPING_MISSING" not in result["blockers"]
    assert result["rows"][0]["erpnext_warehouse"] == "Stores - ABC"


@pytest.mark.asyncio
async def test_inactive_warehouse_mapping_is_ignored():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-11c")
    await _seed_uom_mapping(db)
    await _seed_warehouse_mapping(
        db,
        stock_verify_warehouse_id="WH-1",
        erpnext_warehouse="Stores - Inactive",
        company="ABC Co",
        is_active=False,
    )
    await _seed_erp_item(db, "ITEM-11C")
    await _seed_approved_line(db, "sess-11c", "ITEM-11C", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-11c", mode="STOCK_ADJUSTMENT", company="ABC Co", current_user=CURRENT_USER
    )

    assert "WAREHOUSE_MAPPING_MISSING" in result["blockers"]
    assert result["rows"][0]["erpnext_warehouse"] is None


@pytest.mark.asyncio
async def test_missing_uom_mapping_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-12")
    await _seed_warehouse_mapping(db)
    await _seed_erp_item(db, "ITEM-12", uom_code=None)
    await _seed_approved_line(
        db, "sess-12", "ITEM-12", counted_qty=10.0, erp_qty=10.0, uom_code=None
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-12", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "UOM_MAPPING_MISSING" in result["blockers"]
    assert result["rows"][0]["erpnext_uom"] is None


@pytest.mark.asyncio
async def test_active_uom_mapping_resolves_erpnext_uom_and_conversion_factor_on_row():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-12b")
    await _seed_warehouse_mapping(db)
    await _seed_uom_mapping(
        db, stock_verify_uom="PCS", erpnext_uom="Nos", conversion_factor=1.0
    )
    await _seed_erp_item(db, "ITEM-12B")
    await _seed_approved_line(db, "sess-12b", "ITEM-12B", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-12b", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "UOM_MAPPING_MISSING" not in result["blockers"]
    row = result["rows"][0]
    assert row["erpnext_uom"] == "Nos"
    assert row["uom_conversion_factor"] == 1.0


@pytest.mark.asyncio
async def test_pending_offline_conflict_blocks_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-13")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-13")
    await _seed_approved_line(db, "sess-13", "ITEM-13", counted_qty=10.0, erp_qty=10.0)
    await db.sync_conflicts.insert_one(
        {"session_id": "sess-13", "status": "pending", "entity_type": "count_line"}
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-13", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert "OFFLINE_CONFLICT_PENDING" in result["blockers"]


@pytest.mark.asyncio
async def test_preview_creates_export_version_record():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-14")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-14")
    await _seed_approved_line(db, "sess-14", "ITEM-14", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-14", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    stored = await db.erpnext_export_previews.find_one({"export_id": result["export_id"]})
    assert stored is not None
    assert stored["export_version"] == 1
    assert stored["session_id"] == "sess-14"
    assert stored["status"] == result["status"]


@pytest.mark.asyncio
async def test_preview_writes_audit_event():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-15")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-15")
    await _seed_approved_line(db, "sess-15", "ITEM-15", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-15", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    audit_entry = await db.audit_logs.find_one({"entity_id": result["export_id"]})
    assert audit_entry is not None
    assert audit_entry["event_type"] == "EXPORT_PREVIEW_GENERATED"
    assert audit_entry["details"]["export_version"] == 1


@pytest.mark.asyncio
async def test_regenerating_preview_supersedes_previous_draft():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-16")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-16")
    await _seed_approved_line(db, "sess-16", "ITEM-16", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    first = await service.generate_preview(
        session_id="sess-16", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    second = await service.generate_preview(
        session_id="sess-16", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert second["export_version"] == first["export_version"] + 1
    first_stored = await db.erpnext_export_previews.find_one({"export_id": first["export_id"]})
    assert first_stored["status"] == "SUPERSEDED"


@pytest.mark.asyncio
async def test_historical_count_lines_without_new_metadata_do_not_crash_preview():
    """Historical count lines predating baseline_snapshot_id/erp_refreshed_at/
    uom_source/uom_resolved_at (and even predating erp_qty/uom_code in some
    very old records) must not crash the preview. No mappings/flags are
    seeded either, matching a real historical/unconfigured state."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-17")
    await _seed_erp_item(db, "ITEM-17")
    await db.count_lines.insert_one(
        {
            "id": "legacy-line-17",
            "session_id": "sess-17",
            "item_code": "ITEM-17",
            "counted_qty": 10.0,
            "approval_status": "APPROVED",
            "status": "approved",
            # No erp_qty, uom_code, baseline_snapshot_id, erp_refreshed_at,
            # uom_source, uom_resolved_at, serial_numbers, batch_id, etc.
        }
    )
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-17", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert len(result["rows"]) == 1
    row = result["rows"][0]
    assert row["baseline_qty"] == 0.0
    assert row["batch_no"] is None
    assert row["serial_numbers"] == []
    assert row["erpnext_warehouse"] is None
    assert row["erpnext_uom"] is None


@pytest.mark.asyncio
async def test_negative_opening_qty_blocked_unless_flag_allows_it():
    """Flag-driven (not mode-gated): the item's own export policy decides,
    regardless of which mode the preview targets."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-18")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-18", stock_qty=50.0)
    await _seed_approved_line(db, "sess-18", "ITEM-18", counted_qty=-5.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-18", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    assert "NEGATIVE_OPENING_QTY_NOT_ALLOWED" in result["blockers"]

    # OPENING_STOCK mode: still blocked, no flag configured.
    result_opening = await ErpNextExportService(db).generate_preview(
        session_id="sess-18", mode="OPENING_STOCK", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    assert "NEGATIVE_OPENING_QTY_NOT_ALLOWED" in result_opening["blockers"]


@pytest.mark.asyncio
async def test_negative_opening_qty_allowed_when_flag_set_regardless_of_mode():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-19")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-19", stock_qty=50.0)
    await _seed_item_flags(db, "ITEM-19", allow_negative_opening_qty=True)
    await _seed_approved_line(db, "sess-19", "ITEM-19", counted_qty=-5.0, erp_qty=10.0)

    adjustment_result = await ErpNextExportService(db).generate_preview(
        session_id="sess-19", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    assert "NEGATIVE_OPENING_QTY_NOT_ALLOWED" not in adjustment_result["blockers"]

    opening_result = await ErpNextExportService(db).generate_preview(
        session_id="sess-19", mode="OPENING_STOCK", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    assert "NEGATIVE_OPENING_QTY_NOT_ALLOWED" not in opening_result["blockers"]


@pytest.mark.asyncio
async def test_router_rejects_invalid_mode_with_400():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-20")
    with patch("backend.api.erpnext_exports_api.get_db", return_value=db):
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await preview_erpnext_export(
                ErpNextExportPreviewRequest(session_id="sess-20", mode="BOGUS_MODE"),
                current_user=CURRENT_USER,
            )
        assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_router_returns_preview_response_shape():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-21")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-21")
    await _seed_approved_line(db, "sess-21", "ITEM-21", counted_qty=10.0, erp_qty=10.0)

    with patch("backend.api.erpnext_exports_api.get_db", return_value=db):
        # No company supplied -- exactly one active company is configured
        # (Default Co, via _seed_default_mappings), so it is safely derived
        # rather than guessed among multiple.
        response = await preview_erpnext_export(
            ErpNextExportPreviewRequest(session_id="sess-21", mode="STOCK_ADJUSTMENT"),
            current_user=CURRENT_USER,
        )

    assert response["status"] == "READY_FOR_APPROVAL"
    assert response["session_id"] == "sess-21"
    assert response["export_version"] == 1
    assert response["company"] == DEFAULT_COMPANY
    assert "rows" in response and "summary" in response
    assert response["rows"][0]["erpnext_warehouse"] == "ERPNext WH 1 - CO"
    assert response["rows"][0]["erpnext_uom"] == "Nos"


# ==================== Company context (Step 3) ====================


@pytest.mark.asyncio
async def test_preview_requires_company_when_it_cannot_be_derived():
    """Zero active companies configured -- must not guess; must return a
    clear, distinct error rather than silently proceeding."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-30")
    await _seed_erp_item(db, "ITEM-30")
    await _seed_approved_line(db, "sess-30", "ITEM-30", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    with pytest.raises(ErpNextExportPreviewError, match="COMPANY_REQUIRED"):
        await service.generate_preview(
            session_id="sess-30", mode="STOCK_ADJUSTMENT", current_user=CURRENT_USER
        )


@pytest.mark.asyncio
async def test_preview_requires_company_when_multiple_companies_configured():
    """More than one active company exists -- must not guess which one
    applies; must return COMPANY_REQUIRED rather than picking one."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-31")
    await _seed_warehouse_mapping(db, stock_verify_warehouse_id="WH-1", company="Company A")
    await _seed_warehouse_mapping(db, stock_verify_warehouse_id="WH-2", company="Company B")
    await _seed_erp_item(db, "ITEM-31")
    await _seed_approved_line(db, "sess-31", "ITEM-31", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    with pytest.raises(ErpNextExportPreviewError, match="COMPANY_REQUIRED"):
        await service.generate_preview(
            session_id="sess-31", mode="STOCK_ADJUSTMENT", current_user=CURRENT_USER
        )


@pytest.mark.asyncio
async def test_preview_stores_company_on_record_and_in_response():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-32")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-32")
    await _seed_approved_line(db, "sess-32", "ITEM-32", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result = await service.generate_preview(
        session_id="sess-32",
        mode="STOCK_ADJUSTMENT",
        company="Explicit Co",
        current_user=CURRENT_USER,
    )

    assert result["company"] == "Explicit Co"
    stored = await db.erpnext_export_previews.find_one({"export_id": result["export_id"]})
    assert stored["company"] == "Explicit Co"


@pytest.mark.asyncio
async def test_warehouse_mapping_lookup_uses_company_to_disambiguate():
    """Same stock_verify_warehouse_id mapped differently under two
    companies -- the correct one must be picked based on the company
    supplied to generate_preview, not guessed."""
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-33")
    await _seed_uom_mapping(db)
    await _seed_warehouse_mapping(
        db, stock_verify_warehouse_id="WH-1", erpnext_warehouse="Stores - A", company="Company A"
    )
    await _seed_warehouse_mapping(
        db, stock_verify_warehouse_id="WH-1", erpnext_warehouse="Stores - B", company="Company B"
    )
    await _seed_erp_item(db, "ITEM-33")
    await _seed_approved_line(db, "sess-33", "ITEM-33", counted_qty=10.0, erp_qty=10.0)
    service = ErpNextExportService(db)

    result_a = await service.generate_preview(
        session_id="sess-33", mode="STOCK_ADJUSTMENT", company="Company A", current_user=CURRENT_USER
    )
    assert result_a["rows"][0]["erpnext_warehouse"] == "Stores - A"

    result_b = await ErpNextExportService(db).generate_preview(
        session_id="sess-33", mode="STOCK_ADJUSTMENT", company="Company B", current_user=CURRENT_USER
    )
    assert result_b["rows"][0]["erpnext_warehouse"] == "Stores - B"


# ==================== Approval workflow (Step 4/5) ====================


async def _generate_ready_preview(
    db: InMemoryDatabase, session_id: str, item_code: str, *, company: str = DEFAULT_COMPANY
) -> dict:
    await _seed_finalized_session(db, session_id)
    await _seed_default_mappings(db)
    await _seed_erp_item(db, item_code)
    await _seed_approved_line(db, session_id, item_code, counted_qty=10.0, erp_qty=10.0)
    return await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=company, current_user=CURRENT_USER
    )


@pytest.mark.asyncio
async def test_approve_requires_admin_or_permission():
    """Mirrors the settings API's admin gate: require_admin rejects a
    non-admin actor outright (the approval router endpoint uses the same
    dependency)."""
    from backend.auth.dependencies import require_admin
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await require_admin(current_user={"username": "staff1", "role": "staff"})
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_cannot_approve_missing_preview():
    db = InMemoryDatabase()
    service = ErpNextExportService(db)

    with pytest.raises(ErpNextExportNotFoundError):
        await service.approve_preview(export_id="does-not-exist", current_user=CURRENT_USER)


@pytest.mark.asyncio
async def test_cannot_approve_validation_failed_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "sess-34")
    await _seed_default_mappings(db)
    # No erp_items document -- UNKNOWN_ITEM_UNMAPPED blocker guarantees
    # VALIDATION_FAILED.
    await _seed_approved_line(db, "sess-34", "ITEM-34", counted_qty=10.0, erp_qty=10.0)
    preview = await ErpNextExportService(db).generate_preview(
        session_id="sess-34", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    assert preview["status"] == "VALIDATION_FAILED"

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user=CURRENT_USER
        )


@pytest.mark.asyncio
async def test_cannot_approve_preview_with_blockers_even_if_status_says_ready():
    """Defensive: the blockers check is independent of the status field, in
    case a preview record was ever created/edited outside the normal
    generate_preview path with an inconsistent status/blockers pairing."""
    db = InMemoryDatabase()
    await db.erpnext_export_previews.insert_one(
        {
            "export_id": "export-inconsistent",
            "export_version": 1,
            "session_id": "sess-inconsistent",
            "mode": "STOCK_ADJUSTMENT",
            "company": DEFAULT_COMPANY,
            "status": "READY_FOR_APPROVAL",
            "summary": {"approved_line_count": 0},
            "rows": [],
            "blockers": ["SOME_STALE_BLOCKER"],
            "warnings": [],
        }
    )
    service = ErpNextExportService(db)

    with pytest.raises(ErpNextExportApprovalError):
        await service.approve_preview(export_id="export-inconsistent", current_user=CURRENT_USER)


@pytest.mark.asyncio
async def test_cannot_approve_superseded_preview():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-35", "ITEM-35")
    # Regenerate to supersede the first (un-approved) draft.
    await ErpNextExportService(db).generate_preview(
        session_id="sess-35", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user=CURRENT_USER
        )


@pytest.mark.asyncio
async def test_cannot_approve_preview_without_company():
    """Simulates a legacy/malformed preview record with no company
    recorded -- approval must refuse rather than approve without company
    context."""
    db = InMemoryDatabase()
    await db.erpnext_export_previews.insert_one(
        {
            "export_id": "export-no-company",
            "export_version": 1,
            "session_id": "sess-no-company",
            "mode": "STOCK_ADJUSTMENT",
            "company": None,
            "status": "READY_FOR_APPROVAL",
            "summary": {"approved_line_count": 0},
            "rows": [],
            "blockers": [],
            "warnings": [],
        }
    )
    service = ErpNextExportService(db)

    with pytest.raises(ErpNextExportApprovalError, match="COMPANY_REQUIRED"):
        await service.approve_preview(export_id="export-no-company", current_user=CURRENT_USER)


@pytest.mark.asyncio
async def test_approving_ready_preview_sets_approved_fields():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-36", "ITEM-36")
    assert preview["status"] == "READY_FOR_APPROVAL"

    response = await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
    )

    assert response["status"] == "APPROVED"
    assert response["approved_by"] == "admin1"
    assert response["approved_at"] is not None
    assert response["approval_hash"]
    assert response["company"] == DEFAULT_COMPANY
    stored = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert stored["status"] == "APPROVED"
    assert stored["approval_hash"] == response["approval_hash"]


@pytest.mark.asyncio
async def test_approval_writes_audit_event():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-37", "ITEM-37")

    response = await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
    )

    audit_entry = await db.audit_logs.find_one(
        {"entity_id": preview["export_id"], "event_type": "EXPORT_PREVIEW_APPROVED"}
    )
    assert audit_entry is not None
    assert audit_entry["details"]["approval_hash"] == response["approval_hash"]
    assert audit_entry["details"]["company"] == DEFAULT_COMPANY
    assert audit_entry["details"]["line_count"] == 1


@pytest.mark.asyncio
async def test_regenerating_preview_after_approval_creates_new_version_and_does_not_mutate_approved():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-38", "ITEM-38")
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
    )
    approved_snapshot = await db.erpnext_export_previews.find_one(
        {"export_id": preview["export_id"]}
    )

    regenerated = await ErpNextExportService(db).generate_preview(
        session_id="sess-38", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert regenerated["export_id"] != preview["export_id"]
    assert regenerated["export_version"] == preview["export_version"] + 1
    unchanged = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert unchanged == approved_snapshot
    assert unchanged["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_new_preview_generation_supersedes_draft_but_never_approved():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-39", "ITEM-39")
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
    )

    await ErpNextExportService(db).generate_preview(
        session_id="sess-39", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    approved_doc = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert approved_doc["status"] == "APPROVED"  # never flipped to SUPERSEDED


@pytest.mark.asyncio
async def test_approval_fails_if_session_no_longer_finalized():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-40", "ITEM-40")
    await db.sessions.update_one(
        {"session_id": "sess-40"}, {"$set": {"status": "ACTIVE", "finalized_at": None}}
    )

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
        )


@pytest.mark.asyncio
async def test_approval_fails_if_approved_line_count_changed():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-41", "ITEM-41")
    # A second line gets approved after the preview snapshot was taken.
    await _seed_erp_item(db, "ITEM-41B")
    await _seed_approved_line(db, "sess-41", "ITEM-41B", counted_qty=5.0, erp_qty=5.0)

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
        )


@pytest.mark.asyncio
async def test_approval_fails_if_offline_conflict_appears_after_preview():
    db = InMemoryDatabase()
    preview = await _generate_ready_preview(db, "sess-42", "ITEM-42")
    await db.sync_conflicts.insert_one(
        {"session_id": "sess-42", "status": "pending", "entity_type": "count_line"}
    )

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user={"username": "admin1", "role": "admin"}
        )


@pytest.mark.asyncio
async def test_router_approve_endpoint_maps_errors_to_http_status(monkeypatch):
    from backend.api.erpnext_exports_api import approve_erpnext_export

    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await approve_erpnext_export("does-not-exist", current_user={"username": "admin1", "role": "admin"})
    assert exc_info.value.status_code == 404

    preview = await _generate_ready_preview(db, "sess-43", "ITEM-43")
    result = await approve_erpnext_export(
        preview["export_id"], current_user={"username": "admin1", "role": "admin"}
    )
    assert result["status"] == "APPROVED"


def test_bsr_remediation_status_doc_exists_and_documents_this_step():
    import pathlib

    doc_path = (
        pathlib.Path(__file__).resolve().parents[3] / "docs" / "BSR_REMEDIATION_STATUS.md"
    )
    assert doc_path.exists()
    content = doc_path.read_text()
    for section in (
        "## 1. Current Overall Status",
        "## 2. Non-Negotiable Rules",
        "## 3. Completed Work Log",
        "## 4. Current Verified Capabilities",
        "## 5. Open Gaps",
        "## 6. Step-by-Step Change History",
        "## 7. ERPNext Export Readiness",
        "## 8. Formula Reference",
        "## 9. Required Next Steps",
        "## 10. Agent Instructions",
    ):
        assert section in content, section
    assert "POST /api/erpnext-exports/preview" in content
