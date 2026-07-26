"""ERPNext Export Preview + Approval + File Download + Correction + Photo
Manifest API (BSR).

Preview + approval + file download: no direct ERPNext push. Approval
freezes the exact preview payload that was reviewed; file downloads are
generated exclusively from that frozen, hash-verified snapshot -- neither
ever recalculates rows or re-reads count_lines/erp_items. Corrections are
proposals only -- nothing is ever applied to an existing preview document.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import require_admin
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.erpnext_export_correction_service import (
    ErpNextExportCorrectionError,
    ErpNextExportCorrectionNotFoundError,
    ErpNextExportCorrectionService,
)
from backend.services.erpnext_export_file_service import (
    ErpNextExportFileError,
    ErpNextExportFileIntegrityError,
    ErpNextExportFileNotFoundError,
    ErpNextExportFileService,
)
from backend.services.erpnext_export_import_validation_service import (
    ErpNextImportValidationService,
)
from backend.services.erpnext_export_photo_manifest_service import (
    ErpNextExportPhotoManifestError,
    ErpNextExportPhotoManifestService,
)
from backend.services.erpnext_export_service import (
    ErpNextExportApprovalError,
    ErpNextExportNotFoundError,
    ErpNextExportPreviewError,
    ErpNextExportService,
)
from backend.services.hsn_suggestion_selection_service import (
    HsnSuggestionSelectionError,
    HsnSuggestionSelectionService,
)

logger = logging.getLogger(__name__)

_FILE_TYPE_BY_SLUG = {
    "stock-entry.csv": ("stock_entry", "csv"),
    "stock-reconciliation.csv": ("stock_reconciliation", "csv"),
    "serials.csv": ("serials", "csv"),
    "batches.csv": ("batches", "csv"),
    "photo-manifest.csv": ("photo_manifest", "csv"),
    "stock-entry.xlsx": ("stock_entry", "xlsx"),
    "stock-reconciliation.xlsx": ("stock_reconciliation", "xlsx"),
    "serials.xlsx": ("serials", "xlsx"),
    "batches.xlsx": ("batches", "xlsx"),
    "photo-manifest.xlsx": ("photo_manifest", "xlsx"),
}

router = APIRouter(prefix="/api/erpnext-exports", tags=["ERPNext Export"])


class ErpNextExportPreviewRequest(BaseModel):
    session_id: str
    mode: str
    company: Optional[str] = None


@router.post("/preview")
async def preview_erpnext_export(
    request: ErpNextExportPreviewRequest,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Generate a versioned, blocker/warning-annotated preview of an ERPNext
    opening-stock or stock-adjustment import for a finalized session.

    `company` is required context for warehouse mapping resolution. If
    omitted and exactly one active company is configured across warehouse
    mappings, it is derived; otherwise this returns 400 COMPANY_REQUIRED
    rather than guessing.

    Does not push to ERPNext and does not generate a final import file.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportService(db)
    try:
        return await service.generate_preview(
            session_id=request.session_id,
            mode=request.mode,
            company=request.company,
            current_user=current_user,
        )
    except ErpNextExportPreviewError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{export_id}/approve")
async def approve_erpnext_export(
    export_id: str,
    current_user: dict = Depends(require_admin),
):
    """Approve a READY_FOR_APPROVAL preview, freezing it immutably.

    Admin-only. Does not recalculate rows -- if session/count-line/conflict
    state has drifted since the preview was generated, this fails and the
    caller must regenerate the preview instead.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportService(db)
    try:
        return await service.approve_preview(export_id=export_id, current_user=current_user)
    except ErpNextExportNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportApprovalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{export_id}/download/{file_slug}")
async def download_erpnext_export_file(
    export_id: str,
    file_slug: str,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Download a CSV or XLSX generated exclusively from an APPROVED preview.

    Never re-reads count_lines/erp_items and never recalculates rows -- the
    file is built purely from the frozen, hash-verified preview snapshot.
    CSV and XLSX are generated from the exact same rows/columns.
    """
    file_type, file_format = _FILE_TYPE_BY_SLUG.get(file_slug, (None, None))
    if file_type is None:
        raise HTTPException(status_code=404, detail=f"Unknown export file {file_slug!r}")

    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportFileService(db)
    try:
        result = await service.generate_file(
            export_id=export_id,
            file_type=file_type,
            file_format=file_format,
            current_user=current_user,
        )
    except ErpNextExportFileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportFileIntegrityError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except ErpNextExportFileError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return Response(
        content=result["content"],
        media_type=result["media_type"],
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@router.get("/{export_id}/validate/{file_slug}")
async def validate_erpnext_export_file(
    export_id: str,
    file_slug: str,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Validate that a generated (or about-to-be-generated) CSV/XLSX file
    satisfies ERPNext's import-template expectations. Read-only -- never
    talks to ERPNext, never requires ERPNext credentials.
    """
    file_type, file_format = _FILE_TYPE_BY_SLUG.get(file_slug, (None, None))
    if file_type is None:
        raise HTTPException(status_code=404, detail=f"Unknown export file {file_slug!r}")

    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextImportValidationService(db)
    return await service.validate(export_id=export_id, file_type=file_type, file_format=file_format)


class CorrectionProposalCreate(BaseModel):
    row_key: str
    proposed_changes: dict[str, Any]
    reason: str


class CorrectionProposalReview(BaseModel):
    review_reason: Optional[str] = None


@router.post("/{export_id}/corrections")
async def create_erpnext_export_correction(
    export_id: str,
    payload: CorrectionProposalCreate,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Propose a correction to an export-facing field on a not-yet-approved
    preview row. Never edits the row directly -- creates a PENDING proposal
    that an admin/supervisor must approve or reject.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportCorrectionService(db)
    try:
        return await service.create_proposal(
            export_id=export_id,
            row_key=payload.row_key,
            proposed_changes=payload.proposed_changes,
            reason=payload.reason,
            current_user=current_user,
        )
    except ErpNextExportCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportCorrectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/{export_id}/corrections")
async def list_erpnext_export_corrections(
    export_id: str,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportCorrectionService(db)
    return await service.list_proposals(export_id)


@router.post("/corrections/{proposal_id}/approve")
async def approve_erpnext_export_correction(
    proposal_id: str,
    payload: CorrectionProposalReview,
    current_user: dict = Depends(require_admin),
):
    """Admin-only. Marks a PENDING proposal APPROVED; it takes effect the
    next time the preview is regenerated for the same scope -- this never
    mutates the preview the proposal was raised against.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportCorrectionService(db)
    try:
        return await service.approve_proposal(
            proposal_id, current_user=current_user, review_reason=payload.review_reason
        )
    except ErpNextExportCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportCorrectionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/corrections/{proposal_id}/reject")
async def reject_erpnext_export_correction(
    proposal_id: str,
    payload: CorrectionProposalReview,
    current_user: dict = Depends(require_admin),
):
    """Admin-only. Marks a PENDING proposal REJECTED; it remains stored and
    auditable, never deleted.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportCorrectionService(db)
    try:
        return await service.reject_proposal(
            proposal_id, current_user=current_user, review_reason=payload.review_reason
        )
    except ErpNextExportCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportCorrectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{export_id}/photo-manifest")
async def create_erpnext_export_photo_manifest(
    export_id: str,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Snapshot a durable, hash-verifiable photo evidence manifest for an
    APPROVED preview. Idempotent: re-snapshotting unchanged evidence
    returns the existing manifest rather than creating a duplicate version.
    """
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportPhotoManifestService(db)
    try:
        return await service.create_manifest(export_id=export_id, current_user=current_user)
    except ErpNextExportPhotoManifestError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{export_id}/photo-manifest")
async def get_erpnext_export_photo_manifest(
    export_id: str,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    db: AsyncIOMotorDatabase = get_db()
    service = ErpNextExportPhotoManifestService(db)
    manifest = await service.get_manifest(export_id)
    if manifest is None:
        raise HTTPException(
            status_code=404, detail=f"No photo manifest snapshot exists for {export_id!r}"
        )
    return manifest


class HsnSuggestionSelectionRequest(BaseModel):
    suggestion_id: str
    hsn_sac: str
    gst_percentage: Optional[float] = None
    reason: str


@router.post("/{export_id}/rows/{row_key}/hsn-suggestion-selection")
async def select_hsn_suggestion(
    export_id: str,
    row_key: str,
    payload: HsnSuggestionSelectionRequest,
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Selecting an HSN suggestion creates a PENDING export correction
    proposal -- it never mutates the preview row, the export, or the SQL
    item master directly. Admin approval (existing correction-approval
    endpoint) is still required, and the correction only takes effect on
    the next preview regeneration."""
    db: AsyncIOMotorDatabase = get_db()
    service = HsnSuggestionSelectionService(db)
    try:
        return await service.select_suggestion(
            export_id=export_id,
            row_key=row_key,
            suggestion_id=payload.suggestion_id,
            hsn_sac=payload.hsn_sac,
            gst_percentage=payload.gst_percentage,
            reason=payload.reason,
            current_user=current_user,
        )
    except HsnSuggestionSelectionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportCorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ErpNextExportCorrectionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
