"""
Router-level tests for the ERPNext export correction proposal and photo
evidence manifest endpoints (BSR). Preview/approve/download router-level
smoke coverage already lives in
backend/tests/services/test_erpnext_export_service.py and
test_erpnext_export_file_service.py; this file focuses on the new
corrections/photo-manifest endpoints added this step.
"""

from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from backend.api.erpnext_exports_api import (
    CorrectionProposalCreate,
    CorrectionProposalReview,
    HsnSuggestionSelectionRequest,
    approve_erpnext_export,
    approve_erpnext_export_correction,
    create_erpnext_export_correction,
    create_erpnext_export_photo_manifest,
    get_erpnext_export_photo_manifest,
    list_erpnext_export_corrections,
    reject_erpnext_export_correction,
    select_hsn_suggestion,
)
from backend.api.hsn_directory_api import (
    HsnDirectoryImportRequest,
    HsnSuggestionRequest,
    get_hsn_suggestions,
    import_hsn_directory_record,
    search_hsn_directory,
)
from backend.services.erpnext_export_service import ErpNextExportService
from backend.services.hsn_directory_service import HsnDirectoryService
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


async def _seed_draft_preview(db: InMemoryDatabase, session_id: str, item_code: str) -> dict:
    await _seed_finalized_session(db, session_id)
    await _seed_default_mappings(db)
    await _seed_erp_item(db, item_code)
    await _seed_approved_line(db, session_id, item_code, counted_qty=10.0, erp_qty=10.0)
    return await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )


@pytest.mark.asyncio
async def test_create_list_approve_correction_via_router(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    preview = await _seed_draft_preview(db, "sess-1", "ITEM-1")
    row_key = preview["rows"][0]["count_line_id"]

    created = await create_erpnext_export_correction(
        preview["export_id"],
        CorrectionProposalCreate(
            row_key=row_key, proposed_changes={"batch_no": "BATCH-X"}, reason="Wrong batch"
        ),
        current_user=CURRENT_USER,
    )
    assert created["status"] == "PENDING"

    listed = await list_erpnext_export_corrections(preview["export_id"], current_user=CURRENT_USER)
    assert len(listed) == 1
    assert listed[0]["proposal_id"] == created["proposal_id"]

    approved = await approve_erpnext_export_correction(
        created["proposal_id"],
        CorrectionProposalReview(review_reason="Confirmed"),
        current_user=ADMIN_USER,
    )
    assert approved["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_create_and_reject_correction_via_router(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    preview = await _seed_draft_preview(db, "sess-2", "ITEM-2")
    row_key = preview["rows"][0]["count_line_id"]

    created = await create_erpnext_export_correction(
        preview["export_id"],
        CorrectionProposalCreate(
            row_key=row_key, proposed_changes={"mrp": 42.0}, reason="Wrong MRP"
        ),
        current_user=CURRENT_USER,
    )

    rejected = await reject_erpnext_export_correction(
        created["proposal_id"],
        CorrectionProposalReview(review_reason="MRP was already correct"),
        current_user=ADMIN_USER,
    )
    assert rejected["status"] == "REJECTED"


@pytest.mark.asyncio
async def test_create_correction_rejects_forbidden_field_with_422(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    preview = await _seed_draft_preview(db, "sess-3", "ITEM-3")
    row_key = preview["rows"][0]["count_line_id"]

    with pytest.raises(HTTPException) as exc_info:
        await create_erpnext_export_correction(
            preview["export_id"],
            CorrectionProposalCreate(
                row_key=row_key, proposed_changes={"counted_qty": 999.0}, reason="Trying to cheat"
            ),
            current_user=CURRENT_USER,
        )
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_approve_preview_router_blocks_on_pending_correction(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    preview = await _seed_draft_preview(db, "sess-4", "ITEM-4")
    row_key = preview["rows"][0]["count_line_id"]

    await create_erpnext_export_correction(
        preview["export_id"],
        CorrectionProposalCreate(
            row_key=row_key, proposed_changes={"batch_no": "BATCH-X"}, reason="Needs review"
        ),
        current_user=CURRENT_USER,
    )

    with pytest.raises(HTTPException) as exc_info:
        await approve_erpnext_export(preview["export_id"], current_user=ADMIN_USER)
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_photo_manifest_router_create_and_get(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    await _seed_finalized_session(db, "sess-5")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITEM-5")
    await _seed_approved_line(
        db,
        "sess-5",
        "ITEM-5",
        photo_proofs=[
            {"id": "photo-1", "url": "https://example.com/p.jpg", "timestamp": "2026-01-01T00:00:00Z"}
        ],
    )
    preview = await ErpNextExportService(db).generate_preview(
        session_id="sess-5", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user=ADMIN_USER
    )

    created = await create_erpnext_export_photo_manifest(
        preview["export_id"], current_user=CURRENT_USER
    )
    assert created["status"] == "EXTERNAL_REFERENCES_ONLY"

    fetched = await get_erpnext_export_photo_manifest(preview["export_id"], current_user=CURRENT_USER)
    assert fetched["photo_manifest_id"] == created["photo_manifest_id"]


@pytest.mark.asyncio
async def test_photo_manifest_router_get_404_when_not_created(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)

    with pytest.raises(HTTPException) as exc_info:
        await get_erpnext_export_photo_manifest("does-not-exist", current_user=CURRENT_USER)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_hsn_directory_import_and_search_via_router(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.hsn_directory_api.get_db", lambda: db)

    await import_hsn_directory_record(
        HsnDirectoryImportRequest(
            hsn_sac="853950",
            description="Light-emitting diode lamps",
            source="GST_PORTAL_DIRECTORY",
            gst_percentage=12.0,
            keywords=["led", "lamp"],
        ),
        current_user=ADMIN_USER,
    )

    results = await search_hsn_directory("led", current_user=CURRENT_USER)
    assert any(r["hsn_sac"] == "853950" for r in results["results"])


@pytest.mark.asyncio
async def test_hsn_suggestions_router_caches_suggestion_ids(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.hsn_directory_api.get_db", lambda: db)
    await HsnDirectoryService(db).import_record(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        gst_percentage=12.0,
        source="GST_PORTAL_DIRECTORY",
        keywords=["led", "lamp"],
        current_user=ADMIN_USER,
    )

    result = await get_hsn_suggestions(
        "ITM-1",
        HsnSuggestionRequest(item_name="LED Bulb", category="Lighting", limit=5),
        current_user=CURRENT_USER,
    )

    assert result["suggestions"]
    assert all(s.get("suggestion_id") for s in result["suggestions"])


@pytest.mark.asyncio
async def test_select_hsn_suggestion_via_router(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.erpnext_exports_api.get_db", lambda: db)
    monkeypatch.setattr("backend.api.hsn_directory_api.get_db", lambda: db)
    await HsnDirectoryService(db).import_record(
        hsn_sac="853950",
        description="Light-emitting diode lamps",
        gst_percentage=12.0,
        source="GST_PORTAL_DIRECTORY",
        keywords=["led", "lamp"],
        current_user=ADMIN_USER,
    )
    preview = await _seed_draft_preview(db, "sess-hsn-1", "ITM-1")
    row_key = preview["rows"][0]["count_line_id"]

    suggestions_result = await get_hsn_suggestions(
        "ITM-1",
        HsnSuggestionRequest(item_name="LED Bulb", category="Lighting", limit=5),
        current_user=CURRENT_USER,
    )
    official_suggestion = next(
        s for s in suggestions_result["suggestions"] if s["source"] == "GST_PORTAL_DIRECTORY"
    )
    suggestion_id = official_suggestion["suggestion_id"]

    proposal = await select_hsn_suggestion(
        preview["export_id"],
        row_key,
        HsnSuggestionSelectionRequest(
            suggestion_id=suggestion_id, hsn_sac="853950", gst_percentage=12.0,
            reason="Selected from HSN suggestion list after manual review",
        ),
        current_user=CURRENT_USER,
    )

    assert proposal["status"] == "PENDING"
    assert proposal["metadata"]["suggestion_source"] == "GST_PORTAL_DIRECTORY"
