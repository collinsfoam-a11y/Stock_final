"""
Tests for HSN suggestion selection -> correction proposal (BSR Step 10):
selecting a suggestion creates a PENDING correction proposal, never mutates
the preview/export/SQL item master directly, requires admin approval, and
only takes effect on the next preview regeneration -- exactly like every
other export correction.
"""

from datetime import datetime, timezone

import pytest

from backend.services.erpnext_export_service import ErpNextExportService
from backend.services.hsn_suggestion_selection_service import (
    HsnSuggestionSelectionError,
    HsnSuggestionSelectionService,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "supervisor1", "role": "supervisor"}
ADMIN_USER = {"username": "admin1", "role": "admin"}
DEFAULT_WAREHOUSE = "WH-1"
DEFAULT_UOM = "PCS"
DEFAULT_COMPANY = "Default Co"


async def _seed_finalized_session(db, session_id):
    await db.sessions.insert_one({
        "id": session_id, "session_id": session_id, "status": "COMPLETED",
        "warehouse": DEFAULT_WAREHOUSE, "finalized_at": datetime.now(timezone.utc), "version": 1,
    })


async def _seed_default_mappings(db):
    await db.erpnext_warehouse_mappings.insert_one({
        "mapping_id": "map-wh-1", "stock_verify_warehouse_id": DEFAULT_WAREHOUSE,
        "stock_verify_warehouse_name": DEFAULT_WAREHOUSE, "erpnext_warehouse": "Stores - CO",
        "company": DEFAULT_COMPANY, "is_active": True, "created_by": "admin1",
        "created_at": datetime.now(timezone.utc), "updated_by": None, "updated_at": None,
    })
    await db.erpnext_uom_mappings.insert_one({
        "mapping_id": "map-uom-1", "stock_verify_uom": DEFAULT_UOM, "erpnext_uom": "Nos",
        "conversion_factor": 1.0, "is_active": True, "created_by": "admin1",
        "created_at": datetime.now(timezone.utc), "updated_by": None, "updated_at": None,
    })


async def _seed_erp_item(db, item_code, **overrides):
    doc = {
        "item_code": item_code, "item_name": f"Item {item_code}", "warehouse": DEFAULT_WAREHOUSE,
        "uom_code": DEFAULT_UOM, "stock_qty": 90.0, "mrp": 25.0, "last_synced": datetime.now(timezone.utc),
    }
    doc.update(overrides)
    await db.erp_items.insert_one(doc)


async def _seed_approved_line(db, session_id, item_code, **overrides):
    doc = {
        "id": f"line-{item_code}-{session_id}", "session_id": session_id, "item_code": item_code,
        "item_name": f"Item {item_code}", "counted_qty": 100.0, "erp_qty": 100.0,
        "approval_status": "APPROVED", "status": "approved", "uom_code": DEFAULT_UOM,
    }
    doc.update(overrides)
    await db.count_lines.insert_one(doc)
    return doc


async def _generate_preview(db, session_id, item_code):
    return await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )


async def _cached_suggestion(selection_service, item_code="ITM-1"):
    suggestions = [
        {
            "hsn_sac": "853950",
            "description": "Light-emitting diode lamps",
            "gst_percentage": 12.0,
            "source": "MCP_INDIA_STACK_SEED",
            "source_url": "https://github.com/rehan1020/MCP-India-Stack",
            "is_official_source": False,
            "confidence": 0.82,
            "match_reason": "Matched LED, bulb, lighting category",
            "verification_status": "SUGGESTED_NOT_VERIFIED",
            "requires_manual_verification": True,
        }
    ]
    cached = await selection_service.cache_suggestions(item_code=item_code, suggestions=suggestions)
    return cached[0]


@pytest.mark.asyncio
async def test_selection_creates_pending_correction_proposal():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s1")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-1")
    await _seed_approved_line(db, "s1", "ITM-1")
    preview = await _generate_preview(db, "s1", "ITM-1")
    row_key = preview["rows"][0]["count_line_id"]

    selection_service = HsnSuggestionSelectionService(db)
    suggestion = await _cached_suggestion(selection_service)

    proposal = await selection_service.select_suggestion(
        export_id=preview["export_id"],
        row_key=row_key,
        suggestion_id=suggestion["suggestion_id"],
        hsn_sac="853950",
        gst_percentage=12.0,
        reason="Selected from HSN suggestion list after manual review",
        current_user=CURRENT_USER,
    )

    assert proposal["status"] == "PENDING"
    assert proposal["proposed_changes"] == {"hsn_sac": "853950", "gst_percentage": 12.0}


@pytest.mark.asyncio
async def test_selection_does_not_mutate_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s2")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-2")
    await _seed_approved_line(db, "s2", "ITM-2")
    preview = await _generate_preview(db, "s2", "ITM-2")
    row_key = preview["rows"][0]["count_line_id"]

    selection_service = HsnSuggestionSelectionService(db)
    suggestion = await _cached_suggestion(selection_service, item_code="ITM-2")
    await selection_service.select_suggestion(
        export_id=preview["export_id"], row_key=row_key, suggestion_id=suggestion["suggestion_id"],
        hsn_sac="853950", gst_percentage=12.0, reason="test", current_user=CURRENT_USER,
    )

    stored_preview = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert stored_preview["rows"][0].get("hsn_sac") != "853950"  # original preview row untouched


@pytest.mark.asyncio
async def test_selection_does_not_mutate_sql_item_master():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s3")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-3", hsn_code=None)
    await _seed_approved_line(db, "s3", "ITM-3")
    preview = await _generate_preview(db, "s3", "ITM-3")
    row_key = preview["rows"][0]["count_line_id"]

    selection_service = HsnSuggestionSelectionService(db)
    suggestion = await _cached_suggestion(selection_service, item_code="ITM-3")
    await selection_service.select_suggestion(
        export_id=preview["export_id"], row_key=row_key, suggestion_id=suggestion["suggestion_id"],
        hsn_sac="853950", gst_percentage=12.0, reason="test", current_user=CURRENT_USER,
    )

    erp_item = await db.erp_items.find_one({"item_code": "ITM-3"})
    assert erp_item["hsn_code"] is None  # SQL item master never touched


@pytest.mark.asyncio
async def test_approved_correction_applies_only_on_regenerated_preview():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s4")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-4", hsn_code=None, gst_percent=None)
    await _seed_approved_line(db, "s4", "ITM-4")
    preview = await _generate_preview(db, "s4", "ITM-4")
    row_key = preview["rows"][0]["count_line_id"]
    assert preview["rows"][0]["hsn_sac"] is None

    selection_service = HsnSuggestionSelectionService(db)
    suggestion = await _cached_suggestion(selection_service, item_code="ITM-4")
    proposal = await selection_service.select_suggestion(
        export_id=preview["export_id"], row_key=row_key, suggestion_id=suggestion["suggestion_id"],
        hsn_sac="853950", gst_percentage=12.0, reason="test", current_user=CURRENT_USER,
    )

    # Original preview's row is still unchanged before approval.
    stored_before = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert stored_before["rows"][0]["hsn_sac"] is None

    await selection_service.correction_service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)

    # Regenerate the preview (same scope) -- the approved correction should apply to the NEW version only.
    new_preview = await _generate_preview(db, "s4", "ITM-4")
    assert new_preview["export_id"] != preview["export_id"]
    assert new_preview["rows"][0]["hsn_sac"] == "853950"
    assert new_preview["rows"][0]["gst_percentage"] == 12.0

    # The original preview (now SUPERSEDED) remains byte-for-byte unchanged.
    original_after = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert original_after["rows"][0]["hsn_sac"] is None


@pytest.mark.asyncio
async def test_source_and_confidence_preserved_in_correction_metadata():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s5")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-5")
    await _seed_approved_line(db, "s5", "ITM-5")
    preview = await _generate_preview(db, "s5", "ITM-5")
    row_key = preview["rows"][0]["count_line_id"]

    selection_service = HsnSuggestionSelectionService(db)
    suggestion = await _cached_suggestion(selection_service, item_code="ITM-5")
    proposal = await selection_service.select_suggestion(
        export_id=preview["export_id"], row_key=row_key, suggestion_id=suggestion["suggestion_id"],
        hsn_sac="853950", gst_percentage=12.0, reason="test", current_user=CURRENT_USER,
    )

    assert proposal["metadata"]["suggestion_source"] == "MCP_INDIA_STACK_SEED"
    assert proposal["metadata"]["suggestion_source_url"] == "https://github.com/rehan1020/MCP-India-Stack"
    assert proposal["metadata"]["suggestion_confidence"] == 0.82
    assert proposal["metadata"]["suggestion_is_official_source"] is False
    assert proposal["metadata"]["manual_verification_required"] is True
    assert proposal["metadata"]["selected_by"] == "supervisor1"

    audit_entries = await db.audit_logs.find({"details.proposal_id": proposal["proposal_id"]}).to_list(length=10)
    assert any(e["event_type"] == "EXPORT_HSN_SUGGESTION_SELECTED" for e in audit_entries)


@pytest.mark.asyncio
async def test_selection_rejects_unknown_suggestion_id():
    db = InMemoryDatabase()
    await _seed_finalized_session(db, "s6")
    await _seed_default_mappings(db)
    await _seed_erp_item(db, "ITM-6")
    await _seed_approved_line(db, "s6", "ITM-6")
    preview = await _generate_preview(db, "s6", "ITM-6")
    row_key = preview["rows"][0]["count_line_id"]

    selection_service = HsnSuggestionSelectionService(db)
    with pytest.raises(HsnSuggestionSelectionError):
        await selection_service.select_suggestion(
            export_id=preview["export_id"], row_key=row_key, suggestion_id="does-not-exist",
            hsn_sac="853950", gst_percentage=12.0, reason="test", current_user=CURRENT_USER,
        )
