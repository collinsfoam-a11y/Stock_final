"""
Tests for ERP SQL item-master enrichment + GST/HSN/purchase-history
validation (BSR Step 8). All GST/HSN/category/purchase fields are read
read-only from the erp_items Mongo cache (itself already synced read-only
from SQL Server by the pre-existing sql_sync_service.py) -- this feature
never queries SQL Server directly, never writes to it, and never pushes to
ERPNext.

Scope notes (see docs/BSR_REMEDIATION_STATUS.md Step 8 for the full
rationale):
- The hard blockers this feature can raise (ITEM_CATEGORY_MISSING,
  HSN_SAC_MISSING, GST_PERCENTAGE_MISSING, HSN_SAC_INVALID,
  HSN_GST_RATE_MISMATCH, VALUATION_RATE_MISSING) are gated behind the new
  per-item `requires_item_master_validation` export flag (default False) so
  existing/legacy items are never retroactively blocked before their SQL
  master data has real GST/HSN values. When the flag is off, the same
  finding is still surfaced as a warning instead.
- HSN suggestions are always 6-digit (per explicit correction to the
  original requirement); there is no 4-digit HSN or "PE voucher type code"
  concept anywhere in this codebase's real SQL mapping (confirmed directly
  with the business owner) -- PI/PE are 2-letter strings meaning
  "Purchase Invoice" / "Purchase Estimate (non-GST local purchase)".
- HsnGstValidationService has no live official CBIC/GST source in this
  environment; it is an explicitly-labeled placeholder
  (LOCAL_SEED_PLACEHOLDER_PENDING_OFFICIAL_SOURCE), never claiming
  authority it doesn't have.
"""

from datetime import datetime, timezone

import pytest
from backend.services.erpnext_export_file_service import ErpNextExportFileService
from backend.services.erpnext_export_service import ErpNextExportService
from backend.services.erpnext_export_settings_service import ErpNextExportSettingsService
from backend.services.hsn_gst_validation_service import PLACEHOLDER_SOURCE
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


def _full_gst_item_kwargs(**overrides) -> dict:
    kwargs = dict(
        category="Hardware",
        subcategory="Fasteners",
        hsn_code="731815",
        gst_percent=18.0,
        sgst_percent=9.0,
        cgst_percent=9.0,
        igst_percent=18.0,
        last_purchase_cost=10.0,
        last_purchase_date=datetime.now(timezone.utc),
        supplier_id="SUP-1",
        supplier_name="Acme Supplies",
        purchase_voucher_type="PI",
    )
    kwargs.update(overrides)
    return kwargs


async def _generate_preview(db, session_id, item_code):
    return await ErpNextExportService(db).generate_preview(
        session_id=session_id,
        mode="STOCK_ADJUSTMENT",
        company=DEFAULT_COMPANY,
        current_user=CURRENT_USER,
    )


@pytest.mark.asyncio
async def test_sql_item_master_fields_fetched_and_added_to_preview_row():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s1")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-1", **_full_gst_item_kwargs())
    await _seed_approved_line(db, "s1", "ITM-1")

    preview = await _generate_preview(db, "s1", "ITM-1")
    row = preview["rows"][0]

    assert row["category"] == "Hardware"
    assert row["subcategory"] == "Fasteners"
    assert row["hsn_sac"] == "731815"
    assert row["gst_percentage"] == 18.0
    assert row["gst_source"] == "sql_item_master"
    assert row["last_purchase_cost"] == 10.0
    assert row["last_supplier_id"] == "SUP-1"
    assert row["purchase_mode"] == "PURCHASE_INVOICE"
    assert row["sql_item_master_refreshed_at"] is not None
    assert preview["status"] == "READY_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_missing_sql_item_master_creates_blocker():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s2")
    await _seed_default_mappings(db)
    # No erp_items doc at all for ITM-MISSING.
    await _seed_approved_line(db, "s2", "ITM-MISSING")

    preview = await _generate_preview(db, "s2", "ITM-MISSING")

    assert "SQL_ITEM_MASTER_MISSING" in preview["rows"][0]["blockers"]
    assert preview["status"] == "VALIDATION_FAILED"


@pytest.mark.asyncio
async def test_hsn_missing_blocks_only_when_item_opted_into_validation():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)

    # Not opted in (default False): missing HSN is a warning, never blocks.
    await _seed_finalized_session(db, "s3a")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-3A", **_full_gst_item_kwargs(hsn_code=None))
    await _seed_approved_line(db, "s3a", "ITM-3A")
    preview_a = await _generate_preview(db, "s3a", "ITM-3A")
    row_a = preview_a["rows"][0]
    assert "HSN_SAC_MISSING" not in row_a["blockers"]
    assert "HSN_SAC_MISSING" in row_a["warnings"]
    assert preview_a["status"] == "READY_FOR_APPROVAL"
    assert any(s["hsn_6_digit"] for s in row_a["hsn_suggestions"])

    # Opted in: missing HSN blocks.
    await _seed_finalized_session(db, "s3b")
    await settings.upsert_item_flags(
        "ITM-3B", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_erp_item(
        db,
        "ITM-3B",
        **_full_gst_item_kwargs(hsn_code=None, category="Hardware", subcategory="Fasteners"),
    )
    await _seed_approved_line(db, "s3b", "ITM-3B")
    preview_b = await _generate_preview(db, "s3b", "ITM-3B")
    row_b = preview_b["rows"][0]
    assert "HSN_SAC_MISSING" in row_b["blockers"]
    assert preview_b["status"] == "VALIDATION_FAILED"


@pytest.mark.asyncio
async def test_invalid_hsn_format_blocks_when_opted_in():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)
    await _seed_finalized_session(db, "s4")
    await settings.upsert_item_flags(
        "ITM-4", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-4", **_full_gst_item_kwargs(hsn_code="ABC12"))
    await _seed_approved_line(db, "s4", "ITM-4")

    preview = await _generate_preview(db, "s4", "ITM-4")
    row = preview["rows"][0]

    assert "HSN_SAC_INVALID" in row["blockers"]
    assert row["hsn_validation_status"] == "INVALID"


@pytest.mark.asyncio
async def test_gst_rate_mismatch_blocks_when_opted_in():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)
    await _seed_finalized_session(db, "s5")
    await settings.upsert_item_flags(
        "ITM-5", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_default_mappings(db)
    # gst_percent=18 but sgst+cgst=10 and igst=12 -- matches neither.
    await _seed_erp_item(
        db,
        "ITM-5",
        **_full_gst_item_kwargs(
            gst_percent=18.0, sgst_percent=5.0, cgst_percent=5.0, igst_percent=12.0
        ),
    )
    await _seed_approved_line(db, "s5", "ITM-5")

    preview = await _generate_preview(db, "s5", "ITM-5")
    row = preview["rows"][0]

    assert "HSN_GST_RATE_MISMATCH" in row["blockers"]


@pytest.mark.asyncio
async def test_non_gst_purchase_estimate_item_does_not_falsely_block_on_gst_fields():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)
    await _seed_finalized_session(db, "s6")
    await settings.upsert_item_flags(
        "ITM-6", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_default_mappings(db)
    # PE = Purchase Estimate (non-GST local purchase); no HSN/GST expected.
    await _seed_erp_item(
        db,
        "ITM-6",
        category="Hardware",
        subcategory="Fasteners",
        hsn_code=None,
        gst_percent=None,
        purchase_voucher_type="PE",
        last_purchase_cost=5.0,
        last_purchase_date=datetime.now(timezone.utc),
        supplier_id="SUP-2",
        supplier_name="Local Vendor",
    )
    await _seed_approved_line(db, "s6", "ITM-6")

    preview = await _generate_preview(db, "s6", "ITM-6")
    row = preview["rows"][0]

    assert "HSN_SAC_MISSING" not in row["blockers"]
    assert "GST_PERCENTAGE_MISSING" not in row["blockers"]
    assert "NON_GST_ITEM" in row["warnings"]
    assert row["purchase_mode"] == "PURCHASE_ESTIMATE_NON_GST_LOCAL_PURCHASE"
    assert preview["status"] == "READY_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_category_subcategory_missing_creates_appropriate_signals():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)
    await _seed_finalized_session(db, "s7")
    await settings.upsert_item_flags(
        "ITM-7", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-7", **_full_gst_item_kwargs(category=None, subcategory=None))
    await _seed_approved_line(db, "s7", "ITM-7")

    preview = await _generate_preview(db, "s7", "ITM-7")
    row = preview["rows"][0]

    assert "ITEM_CATEGORY_MISSING" in row["blockers"]  # Required field, opted-in item -> blocker
    assert (
        "CATEGORY_OR_SUBCATEGORY_MISSING" in row["warnings"]
    )  # Conditional field -> always a warning


@pytest.mark.asyncio
async def test_last_purchase_cost_used_as_valuation_only_when_present():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s8")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-8", **_full_gst_item_kwargs(last_purchase_cost=42.0, mrp=25.0))
    await _seed_approved_line(db, "s8", "ITM-8")

    preview = await _generate_preview(db, "s8", "ITM-8")
    row = preview["rows"][0]

    assert row["valuation_rate"] == 42.0
    assert row["valuation_rate_source"] == "LAST_PURCHASE_COST"
    assert "LAST_PURCHASE_COST_USED_AS_VALUATION" in row["warnings"]
    assert "MRP_USED_AS_VALUATION_PROXY" not in row["warnings"]


@pytest.mark.asyncio
async def test_mrp_proxy_used_and_warned_when_no_purchase_cost():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s9")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-9", **_full_gst_item_kwargs(last_purchase_cost=None, mrp=25.0))
    await _seed_approved_line(db, "s9", "ITM-9")

    preview = await _generate_preview(db, "s9", "ITM-9")
    row = preview["rows"][0]

    assert row["valuation_rate"] == 25.0
    assert row["valuation_rate_source"] == "MRP_PROXY"
    assert "MRP_USED_AS_VALUATION_PROXY" in row["warnings"]


@pytest.mark.asyncio
async def test_missing_supplier_and_purchase_history_creates_warnings_not_blockers():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s10")
    await _seed_default_mappings(db)
    await _seed_erp_item(
        db,
        "ITM-10",
        category="Hardware",
        subcategory="Fasteners",
        hsn_code="731815",
        gst_percent=18.0,
        sgst_percent=9.0,
        cgst_percent=9.0,
        # No last_purchase_cost/date/qty, no supplier, no voucher type at all.
    )
    await _seed_approved_line(db, "s10", "ITM-10")

    preview = await _generate_preview(db, "s10", "ITM-10")
    row = preview["rows"][0]

    assert "SQL_PURCHASE_HISTORY_MISSING" in row["warnings"]
    assert "SUPPLIER_MISSING" in row["warnings"]
    assert "SQL_PURCHASE_HISTORY_MISSING" not in row["blockers"]
    assert "SUPPLIER_MISSING" not in row["blockers"]
    assert preview["status"] == "READY_FOR_APPROVAL"


@pytest.mark.asyncio
async def test_purchase_mode_resolved_from_real_field_not_guessed():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s11")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-11", **_full_gst_item_kwargs(purchase_voucher_type="XX"))
    await _seed_approved_line(db, "s11", "ITM-11")

    preview = await _generate_preview(db, "s11", "ITM-11")
    row = preview["rows"][0]

    assert row["purchase_mode"] is None
    assert row["last_purchase_voucher_type"] == "XX"
    assert "PURCHASE_MODE_UNKNOWN" in row["warnings"]


@pytest.mark.asyncio
async def test_hsn_suggestion_requires_human_approval_and_never_mutates_row():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s12")
    await _seed_default_mappings(db)
    await _seed_erp_item(
        db,
        "ITM-12",
        **_full_gst_item_kwargs(hsn_code=None, category="Hardware", subcategory="Fasteners"),
    )
    await _seed_approved_line(db, "s12", "ITM-12")

    preview = await _generate_preview(db, "s12", "ITM-12")
    row = preview["rows"][0]

    assert row["hsn_sac"] is None  # never silently filled in from the suggestion
    assert len(row["hsn_suggestions"]) >= 1
    for suggestion in row["hsn_suggestions"]:
        assert "hsn_6_digit" in suggestion
        assert "hsn_4_digit" not in suggestion  # corrected rule: 6-digit only, never 4-digit
        assert suggestion["source"] == PLACEHOLDER_SOURCE


@pytest.mark.asyncio
async def test_no_4_digit_hsn_suggestion_ever_returned():
    from backend.services.hsn_gst_validation_service import HsnGstValidationService

    db = InMemoryDatabase()
    service = HsnGstValidationService(db)
    suggestions = service.suggest_hsn_candidates(
        item_name="Steel Screw Pack", category="Hardware", subcategory="Fasteners", brand="Acme"
    )
    assert suggestions
    for s in suggestions:
        assert len(s["hsn_6_digit"]) == 6
        assert "hsn_4_digit" not in s


@pytest.mark.asyncio
async def test_hsn_and_purchase_mode_validation_are_independent():
    db = InMemoryDatabase()
    settings = ErpNextExportSettingsService(db)
    await _seed_finalized_session(db, "s13")
    await settings.upsert_item_flags(
        "ITM-13", updates={"requires_item_master_validation": True}, current_user=ADMIN_USER
    )
    await _seed_default_mappings(db)
    # Valid HSN/GST but unknown purchase voucher type -- one should not
    # affect the other's outcome.
    await _seed_erp_item(db, "ITM-13", **_full_gst_item_kwargs(purchase_voucher_type="ZZ"))
    await _seed_approved_line(db, "s13", "ITM-13")

    preview = await _generate_preview(db, "s13", "ITM-13")
    row = preview["rows"][0]

    assert row["hsn_validation_status"] == "VALID"
    assert "HSN_SAC_MISSING" not in row["blockers"]
    assert "HSN_SAC_INVALID" not in row["blockers"]
    assert "PURCHASE_MODE_UNKNOWN" in row["warnings"]


@pytest.mark.asyncio
async def test_existing_csv_xlsx_generation_unaffected_by_new_enrichment_fields():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s14")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-14", **_full_gst_item_kwargs())
    await _seed_approved_line(db, "s14", "ITM-14")
    preview = await _generate_preview(db, "s14", "ITM-14")
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user=ADMIN_USER
    )

    file_service = ErpNextExportFileService(db)
    csv_result = await file_service.generate_file(
        export_id=preview["export_id"],
        file_type="stock_entry",
        file_format="csv",
        current_user=ADMIN_USER,
    )
    xlsx_result = await file_service.generate_file(
        export_id=preview["export_id"],
        file_type="stock_entry",
        file_format="xlsx",
        current_user=ADMIN_USER,
    )

    assert b"ITM-14" in csv_result["content"]
    assert xlsx_result["file_hash"]


@pytest.mark.asyncio
async def test_hsn_validation_is_cached_and_audited_with_source_and_timestamp():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s15")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-15", **_full_gst_item_kwargs())
    await _seed_approved_line(db, "s15", "ITM-15")

    await _generate_preview(db, "s15", "ITM-15")

    cached = await db.hsn_validation_cache.find_one({"hsn_sac": "731815"})
    assert cached is not None
    assert cached["source"] == PLACEHOLDER_SOURCE
    assert cached["validated_at"] is not None

    audit_entries = await db.audit_logs.find({"details.hsn_sac": "731815"}).to_list(length=10)
    assert len(audit_entries) == 1  # first-time only

    # Regenerating (same item, new session) must not write a second audit
    # entry for the same (hsn_sac, gst_percentage) pair.
    await _seed_finalized_session(db, "s15b")
    await _seed_approved_line(db, "s15b", "ITM-15")
    await _generate_preview(db, "s15b", "ITM-15")
    audit_entries_after = await db.audit_logs.find({"details.hsn_sac": "731815"}).to_list(length=10)
    assert len(audit_entries_after) == 1
