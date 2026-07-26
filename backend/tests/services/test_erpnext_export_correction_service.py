"""
Tests for the BSR ERPNext export correction proposal workflow: corrections
to export-facing preview row fields are proposals, never silent edits.
"""

from datetime import datetime, timezone

import pytest

from backend.services.erpnext_export_correction_service import (
    ErpNextExportCorrectionError,
    ErpNextExportCorrectionNotFoundError,
    ErpNextExportCorrectionService,
)
from backend.services.erpnext_export_service import ErpNextExportService
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
    """A READY_FOR_APPROVAL preview -- correctable, not yet approved."""
    await _seed_finalized_session(db, session_id)
    await _seed_default_mappings(db)
    await _seed_erp_item(db, item_code)
    await _seed_approved_line(db, session_id, item_code, counted_qty=10.0, erp_qty=10.0)
    return await ErpNextExportService(db).generate_preview(
        session_id=session_id, mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )


@pytest.mark.asyncio
async def test_create_valid_correction_proposal():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-1", "ITEM-1")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)

    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-CORRECTED"},
        reason="Batch was scanned incorrectly",
        current_user=CURRENT_USER,
    )

    assert proposal["status"] == "PENDING"
    assert proposal["original_values"] == {"batch_no": None}
    assert proposal["proposed_changes"] == {"batch_no": "BATCH-CORRECTED"}
    assert proposal["item_code"] == "ITEM-1"
    assert proposal["session_id"] == "sess-1"
    assert proposal["company"] == DEFAULT_COMPANY


@pytest.mark.asyncio
async def test_reject_forbidden_field_correction():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-2", "ITEM-2")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)

    for forbidden_field in ("counted_qty", "baseline_qty", "approval_hash", "item_code"):
        with pytest.raises(ErpNextExportCorrectionError):
            await service.create_proposal(
                export_id=preview["export_id"],
                row_key=row_key,
                proposed_changes={forbidden_field: "anything"},
                reason="Attempting a forbidden change",
                current_user=CURRENT_USER,
            )


@pytest.mark.asyncio
async def test_reject_missing_reason():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-3", "ITEM-3")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)

    with pytest.raises(ErpNextExportCorrectionError):
        await service.create_proposal(
            export_id=preview["export_id"],
            row_key=row_key,
            proposed_changes={"batch_no": "BATCH-X"},
            reason="",
            current_user=CURRENT_USER,
        )


@pytest.mark.asyncio
async def test_reject_correction_proposal_for_approved_preview():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-4", "ITEM-4")
    row_key = preview["rows"][0]["count_line_id"]
    await ErpNextExportService(db).approve_preview(
        export_id=preview["export_id"], current_user=ADMIN_USER
    )
    service = ErpNextExportCorrectionService(db)

    with pytest.raises(ErpNextExportCorrectionError):
        await service.create_proposal(
            export_id=preview["export_id"],
            row_key=row_key,
            proposed_changes={"batch_no": "BATCH-X"},
            reason="Too late, already approved",
            current_user=CURRENT_USER,
        )


@pytest.mark.asyncio
async def test_reject_preview_approval_if_pending_correction_proposals_exist():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-5", "ITEM-5")
    row_key = preview["rows"][0]["count_line_id"]
    correction_service = ErpNextExportCorrectionService(db)
    await correction_service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Needs review before approval",
        current_user=CURRENT_USER,
    )

    from backend.services.erpnext_export_service import ErpNextExportApprovalError

    with pytest.raises(ErpNextExportApprovalError):
        await ErpNextExportService(db).approve_preview(
            export_id=preview["export_id"], current_user=ADMIN_USER
        )


@pytest.mark.asyncio
async def test_approve_correction_proposal():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-6", "ITEM-6")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Correcting batch",
        current_user=CURRENT_USER,
    )

    approved = await service.approve_proposal(
        proposal["proposal_id"], current_user=ADMIN_USER, review_reason="Confirmed with warehouse team"
    )

    assert approved["status"] == "APPROVED"
    assert approved["reviewed_by"] == "admin1"
    assert approved["reviewed_at"] is not None
    assert approved["review_reason"] == "Confirmed with warehouse team"


@pytest.mark.asyncio
async def test_reject_correction_proposal():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-7", "ITEM-7")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Correcting batch",
        current_user=CURRENT_USER,
    )

    rejected = await service.reject_proposal(
        proposal["proposal_id"], current_user=ADMIN_USER, review_reason="Original batch was correct"
    )

    assert rejected["status"] == "REJECTED"
    assert rejected["reviewed_by"] == "admin1"
    assert rejected["review_reason"] == "Original batch was correct"
    # Remains auditable, not deleted.
    stored = await db.erpnext_export_correction_proposals.find_one(
        {"proposal_id": proposal["proposal_id"]}
    )
    assert stored is not None
    assert stored["status"] == "REJECTED"


@pytest.mark.asyncio
async def test_approved_correction_does_not_mutate_original_preview():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-8", "ITEM-8")
    row_key = preview["rows"][0]["count_line_id"]
    original_row_snapshot = dict(preview["rows"][0])
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Correcting batch",
        current_user=CURRENT_USER,
    )
    await service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)

    stored_preview = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert stored_preview["rows"][0]["batch_no"] == original_row_snapshot["batch_no"]
    assert stored_preview["rows"][0] == original_row_snapshot


@pytest.mark.asyncio
async def test_regenerated_preview_applies_approved_correction():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-9", "ITEM-9")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-CORRECTED"},
        reason="Correcting batch",
        current_user=CURRENT_USER,
    )
    await service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)

    regenerated = await ErpNextExportService(db).generate_preview(
        session_id="sess-9", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    assert regenerated["export_id"] != preview["export_id"]
    assert regenerated["rows"][0]["batch_no"] == "BATCH-CORRECTED"

    # The original preview remains unchanged.
    original_stored = await db.erpnext_export_previews.find_one({"export_id": preview["export_id"]})
    assert original_stored["rows"][0]["batch_no"] is None

    proposal_after = await service.get_proposal(proposal["proposal_id"])
    assert proposal_after["applied_to_export_id"] == regenerated["export_id"]


@pytest.mark.asyncio
async def test_file_generation_blocks_when_pending_proposals_exist():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-10", "ITEM-10")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Needs review",
        current_user=CURRENT_USER,
    )

    # Approve the preview itself would also fail (tested separately); here
    # we directly flip status to APPROVED to isolate file-generation's own
    # pending-proposal guard from the approval guard.
    await db.erpnext_export_previews.update_one(
        {"export_id": preview["export_id"]},
        {
            "$set": {
                "status": "APPROVED",
                "approved_by": "admin1",
                "approved_at": datetime.now(timezone.utc),
                "approval_hash": ErpNextExportService.compute_approval_hash(preview),
            }
        },
    )

    from backend.services.erpnext_export_file_service import (
        ErpNextExportFileError,
        ErpNextExportFileService,
    )

    with pytest.raises(ErpNextExportFileError):
        await ErpNextExportFileService(db).generate_file(
            export_id=preview["export_id"], file_type="stock_entry", current_user=ADMIN_USER
        )


@pytest.mark.asyncio
async def test_audit_events_are_written_for_create_approve_reject():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-11", "ITEM-11")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)

    proposal_a = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-A"},
        reason="Correction A",
        current_user=CURRENT_USER,
    )
    await service.approve_proposal(proposal_a["proposal_id"], current_user=ADMIN_USER)

    proposal_b = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"mrp": 99.0},
        reason="Correction B",
        current_user=CURRENT_USER,
    )
    await service.reject_proposal(
        proposal_b["proposal_id"], current_user=ADMIN_USER, review_reason="Not needed"
    )

    proposed_events = await db.audit_logs.find(
        {"event_type": "EXPORT_CORRECTION_PROPOSED"}
    ).to_list(length=10)
    approved_events = await db.audit_logs.find(
        {"event_type": "EXPORT_CORRECTION_APPROVED"}
    ).to_list(length=10)
    rejected_events = await db.audit_logs.find(
        {"event_type": "EXPORT_CORRECTION_REJECTED"}
    ).to_list(length=10)

    assert len(proposed_events) == 2
    assert len(approved_events) == 1
    assert len(rejected_events) == 1


@pytest.mark.asyncio
async def test_applied_audit_event_written_on_regeneration():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-12", "ITEM-12")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-Z"},
        reason="Correcting",
        current_user=CURRENT_USER,
    )
    await service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)

    await ErpNextExportService(db).generate_preview(
        session_id="sess-12", mode="STOCK_ADJUSTMENT", company=DEFAULT_COMPANY, current_user=CURRENT_USER
    )

    applied_events = await db.audit_logs.find(
        {"event_type": "EXPORT_CORRECTION_APPLIED"}
    ).to_list(length=10)
    assert len(applied_events) == 1
    assert applied_events[0]["details"]["proposal_id"] == proposal["proposal_id"]


@pytest.mark.asyncio
async def test_cannot_approve_or_reject_non_pending_proposal():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-13", "ITEM-13")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Correcting",
        current_user=CURRENT_USER,
    )
    await service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)

    with pytest.raises(ErpNextExportCorrectionError):
        await service.approve_proposal(proposal["proposal_id"], current_user=ADMIN_USER)
    with pytest.raises(ErpNextExportCorrectionError):
        await service.reject_proposal(
            proposal["proposal_id"], current_user=ADMIN_USER, review_reason="too late"
        )


@pytest.mark.asyncio
async def test_reject_requires_review_reason():
    db = InMemoryDatabase()
    preview = await _seed_draft_preview(db, "sess-14", "ITEM-14")
    row_key = preview["rows"][0]["count_line_id"]
    service = ErpNextExportCorrectionService(db)
    proposal = await service.create_proposal(
        export_id=preview["export_id"],
        row_key=row_key,
        proposed_changes={"batch_no": "BATCH-X"},
        reason="Correcting",
        current_user=CURRENT_USER,
    )

    with pytest.raises(ErpNextExportCorrectionError):
        await service.reject_proposal(
            proposal["proposal_id"], current_user=ADMIN_USER, review_reason=""
        )


@pytest.mark.asyncio
async def test_correction_not_found_errors():
    db = InMemoryDatabase()
    service = ErpNextExportCorrectionService(db)

    with pytest.raises(ErpNextExportCorrectionNotFoundError):
        await service.approve_proposal("does-not-exist", current_user=ADMIN_USER)
    with pytest.raises(ErpNextExportCorrectionNotFoundError):
        await service.reject_proposal(
            "does-not-exist", current_user=ADMIN_USER, review_reason="n/a"
        )
    with pytest.raises(ErpNextExportCorrectionNotFoundError):
        await service.create_proposal(
            export_id="does-not-exist",
            row_key="row-1",
            proposed_changes={"batch_no": "X"},
            reason="test",
            current_user=CURRENT_USER,
        )
