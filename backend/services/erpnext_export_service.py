"""ERPNext export preview service (BSR).

Preview-only: builds a versioned, blocker/warning-annotated view of what an
ERPNext opening-stock or stock-adjustment import *would* contain for a
finalized session. Never writes to ERPNext, never generates an importable
file, and never mutates a count_line or session document.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from backend.services.canonical_inventory import (
    find_session,
    get_effective_approval_status,
    is_session_finalized,
)
from backend.services.erpnext_export_correction_service import ErpNextExportCorrectionService
from backend.services.erpnext_export_settings_service import ErpNextExportSettingsService
from backend.services.erpnext_import_data_validation_service import ErpNextImportDataValidationService

# Correction fields that, once corrected, resolve these specific blocker
# codes (a bounded, explicit remediation -- not a general blocker
# recalculation engine). See ErpNextExportCorrectionService for the field
# allow-list this must stay in sync with.
_BLOCKER_CLEARED_BY_CORRECTED_FIELD = {
    "erpnext_warehouse": "WAREHOUSE_MAPPING_MISSING",
    "batch_no": "BATCH_REQUIRED_MISSING",
    "serial_numbers": "SERIAL_REQUIRED_MISSING",
    "photo_proofs": "HIGH_VARIANCE_PHOTO_MISSING",
    "hsn_sac": "HSN_SAC_MISSING",
    "gst_percentage": "GST_PERCENTAGE_MISSING",
}

logger = logging.getLogger(__name__)

VALID_EXPORT_MODES = ("OPENING_STOCK", "STOCK_ADJUSTMENT")

# No export-staleness/threshold configuration model exists yet (see
# docs/BSR_REMEDIATION_STATUS.md Open Gaps). These are explicit, documented
# defaults for warning-level signals only -- they never block an export.
_ERP_REFRESH_STALE_AFTER = timedelta(hours=24)
_HIGH_ADJUSTMENT_VALUE_THRESHOLD = 10000.0


class ErpNextExportPreviewError(ValueError):
    """Raised for request-level errors (bad session_id, bad mode, missing/
    ambiguous company)."""


class ErpNextExportNotFoundError(LookupError):
    """Raised when an export_id does not resolve to a preview record."""


class ErpNextExportApprovalError(ValueError):
    """Raised for approval-time validation failures (wrong status, stale
    data, missing company, blockers present)."""


def _as_naive_utc(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


class ErpNextExportService:
    """Builds and versions ERPNext export previews. Read-mostly: the only
    write is inserting a new erpnext_export_previews document (and marking
    a prior, not-yet-approved draft for the same session as superseded)."""

    def __init__(self, db: Any) -> None:
        self.db = db
        self.settings_service = ErpNextExportSettingsService(db)
        self.correction_service = ErpNextExportCorrectionService(db)
        self.item_master_validation_service = ErpNextImportDataValidationService(db)

    async def generate_preview(
        self,
        *,
        session_id: str,
        mode: str,
        current_user: dict[str, Any],
        company: Optional[str] = None,
    ) -> dict[str, Any]:
        if mode not in VALID_EXPORT_MODES:
            raise ErpNextExportPreviewError(
                f"mode must be one of {VALID_EXPORT_MODES}, got {mode!r}"
            )
        resolved_company = await self._resolve_company(company)

        session = await find_session(self.db, session_id)
        session_finalized = bool(session) and is_session_finalized(session)

        blockers: list[str] = []
        warnings: list[str] = []
        if not session_finalized:
            blockers.append("SESSION_NOT_FINALIZED")

        count_lines: list[dict[str, Any]] = []
        if session:
            count_lines = await self.db.count_lines.find(
                {"session_id": session_id}
            ).to_list(length=100000)

        approved_lines = [
            line for line in count_lines if get_effective_approval_status(line) == "APPROVED"
        ]
        if session_finalized and not approved_lines:
            blockers.append("NO_APPROVED_LINES")

        conflict_count = 0
        if session:
            conflict_count = await self.db.sync_conflicts.count_documents(
                {"session_id": session_id, "status": "pending"}
            )
        if conflict_count:
            blockers.append("OFFLINE_CONFLICT_PENDING")

        approved_corrections = await self.correction_service.get_approved_corrections_for_scope(
            session_id=session_id, mode=mode, company=resolved_company
        )
        applied_proposals: list[dict[str, Any]] = []

        rows: list[dict[str, Any]] = []
        serials_seen: dict[str, str] = {}
        blocked_line_count = 0
        warning_line_count = 0
        total_opening_qty = 0.0
        total_positive_adjustment = 0.0
        total_negative_adjustment = 0.0

        for line in approved_lines:
            row = await self._build_row(
                line,
                mode=mode,
                company=resolved_company,
                session=session,
                serials_seen=serials_seen,
                current_user=current_user,
            )
            correction = approved_corrections.get(row["count_line_id"])
            if correction:
                self._apply_correction_to_row(row, correction["proposed_changes"])
                applied_proposals.append(correction)
            rows.append(row)
            for code in row["blockers"]:
                if code not in blockers:
                    blockers.append(code)
            for code in row["warnings"]:
                if code not in warnings:
                    warnings.append(code)
            if row["blockers"]:
                blocked_line_count += 1
            if row["warnings"]:
                warning_line_count += 1
            total_opening_qty += row["erpnext_opening_qty"] or 0.0
            adjustment = row["erpnext_adjustment_qty"]
            if adjustment is not None:
                if adjustment > 0:
                    total_positive_adjustment += adjustment
                elif adjustment < 0:
                    total_negative_adjustment += adjustment

        status = "VALIDATION_FAILED" if blockers else "READY_FOR_APPROVAL"
        summary = {
            "line_count": len(count_lines),
            "approved_line_count": len(approved_lines),
            "blocked_line_count": blocked_line_count,
            "warning_line_count": warning_line_count,
            "total_opening_qty": total_opening_qty,
            "total_positive_adjustment": total_positive_adjustment,
            "total_negative_adjustment": total_negative_adjustment,
        }

        export_id, export_version = await self._create_version_record(
            session_id=session_id,
            mode=mode,
            company=resolved_company,
            status=status,
            generated_by=str(current_user.get("username") or "system"),
            summary=summary,
            rows=rows,
            blockers=blockers,
            warnings=warnings,
        )

        if applied_proposals:
            await self.correction_service.mark_applied(
                [p["proposal_id"] for p in applied_proposals], export_id=export_id
            )
            for proposal in applied_proposals:
                await self.correction_service.audit_applied(
                    current_user, proposal, export_id=export_id
                )

        response = {
            "export_id": export_id,
            "export_version": export_version,
            "session_id": session_id,
            "company": resolved_company,
            "status": status,
            "mode": mode,
            "summary": summary,
            "rows": rows,
            "blockers": blockers,
            "warnings": warnings,
        }

        await self._audit_preview_generated(current_user, response)
        return response

    async def _resolve_company(self, company: Optional[str]) -> str:
        """`company` is required context for warehouse mapping lookups (see
        docs/BSR_REMEDIATION_STATUS.md). Backward-compat allowance: if the
        caller omits it and exactly one active company is configured across
        erpnext_warehouse_mappings, derive it. Never guess when zero or more
        than one company is configured -- raise COMPANY_REQUIRED instead."""
        if company:
            return str(company).strip()
        companies = await self.settings_service.list_distinct_active_companies()
        if len(companies) == 1:
            return companies[0]
        raise ErpNextExportPreviewError("COMPANY_REQUIRED")

    @staticmethod
    def _apply_correction_to_row(row: dict[str, Any], proposed_changes: dict[str, Any]) -> None:
        """Applies an approved correction proposal's fields onto a freshly
        built row, then clears any blocker that field is specifically known
        to resolve. This is a bounded, explicit remediation over a fixed
        set of export-facing fields (see
        ErpNextExportCorrectionService.ALLOWED_CORRECTION_FIELDS) -- not a
        general blocker-recalculation engine."""
        for key, value in proposed_changes.items():
            row[key] = value
            cleared_blocker = _BLOCKER_CLEARED_BY_CORRECTED_FIELD.get(key)
            if not cleared_blocker:
                continue
            # gst_percentage=0.0 is a legitimate resolved value (e.g. a
            # nil-rated item), unlike every other correctable field here
            # where an empty/falsy value never represents "fixed" -- so it
            # needs "is not None" rather than a truthy check.
            resolved = value is not None if key == "gst_percentage" else bool(value)
            if resolved:
                row["blockers"] = [b for b in row["blockers"] if b != cleared_blocker]

    async def _build_row(
        self,
        line: dict[str, Any],
        *,
        mode: str,
        company: str,
        session: Optional[dict[str, Any]],
        serials_seen: dict[str, str],
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        blockers: list[str] = []
        warnings: list[str] = []
        line_id = str(line.get("id") or "")

        item_code = str(line.get("item_code") or "").strip()
        if not item_code:
            blockers.append("ITEM_CODE_MISSING")

        erp_item: Optional[dict[str, Any]] = None
        if item_code:
            erp_item = await self.db.erp_items.find_one({"item_code": item_code})
        if erp_item is None:
            blockers.append("UNKNOWN_ITEM_UNMAPPED")

        warehouse = (erp_item or {}).get("warehouse") or (session or {}).get("warehouse")
        warehouse_mapping = await self.settings_service.find_active_warehouse_mapping(
            stock_verify_warehouse_id=warehouse, company=company
        )
        erpnext_warehouse = warehouse_mapping.get("erpnext_warehouse") if warehouse_mapping else None
        if not erpnext_warehouse:
            blockers.append("WAREHOUSE_MAPPING_MISSING")

        uom = line.get("uom_code") or line.get("input_uom") or (erp_item or {}).get("uom_code")
        uom_mapping = await self.settings_service.find_active_uom_mapping(stock_verify_uom=uom)
        erpnext_uom = uom_mapping.get("erpnext_uom") if uom_mapping else None
        uom_conversion_factor = uom_mapping.get("conversion_factor") if uom_mapping else None
        if not erpnext_uom:
            blockers.append("UOM_MAPPING_MISSING")

        item_flags = await self.settings_service.resolve_item_export_flags(
            erp_item=erp_item, item_code=item_code
        )

        baseline_qty = float(line.get("erp_qty") or 0.0)
        counted_qty = float(line.get("counted_qty") or 0.0)

        existing_sql_qty: Optional[float] = None
        if erp_item is not None:
            raw_stock_qty = erp_item.get("stock_qty")
            if raw_stock_qty is None:
                blockers.append("CURRENT_ERP_QTY_MISSING")
            else:
                existing_sql_qty = float(raw_stock_qty)

        stock_verify_variance = counted_qty - baseline_qty
        erp_drift = (existing_sql_qty - baseline_qty) if existing_sql_qty is not None else None
        final_gap = (counted_qty - existing_sql_qty) if existing_sql_qty is not None else None
        erpnext_opening_qty = counted_qty
        # Critical rule: never derive the ERPNext adjustment from
        # stock_verify_variance. It is always counted_qty - existing_sql_qty.
        erpnext_adjustment_qty = (
            (counted_qty - existing_sql_qty) if existing_sql_qty is not None else None
        )

        # Flag-driven, not mode-gated: an item's own export policy decides
        # whether a negative opening quantity is acceptable, regardless of
        # which mode this preview is being generated in.
        if erpnext_opening_qty < 0 and not item_flags["allow_negative_opening_qty"]:
            blockers.append("NEGATIVE_OPENING_QTY_NOT_ALLOWED")

        serial_numbers = [str(s) for s in (line.get("serial_numbers") or []) if s]
        if not serial_numbers and line.get("serial_entries"):
            serial_numbers = [
                str(entry.get("serial_number"))
                for entry in line["serial_entries"]
                if entry.get("serial_number")
            ]

        if item_flags["is_serialized"] and not serial_numbers:
            blockers.append("SERIAL_REQUIRED_MISSING")
        if serial_numbers and float(len(serial_numbers)) != counted_qty:
            blockers.append("SERIAL_COUNT_MISMATCH")
        for serial in serial_numbers:
            owner = serials_seen.get(serial)
            if owner is not None and owner != line_id:
                if "SERIAL_DUPLICATE_IN_EXPORT" not in blockers:
                    blockers.append("SERIAL_DUPLICATE_IN_EXPORT")
            else:
                serials_seen[serial] = line_id

        batch_no = line.get("batch_id")
        # Explicit flag only -- batch_no presence on the item master is no
        # longer used to infer "batch required" (see docs/BSR_REMEDIATION_
        # STATUS.md Step 2 for why the old inference under-detected items).
        if item_flags["is_batch_controlled"] and not batch_no:
            blockers.append("BATCH_REQUIRED_MISSING")

        high_variance = bool(line.get("requires_supervisor_approval")) or bool(
            line.get("violated_thresholds")
        )
        has_photo = bool(line.get("photo_base64")) or bool(line.get("photo_proofs"))
        if (high_variance or item_flags["requires_photo_for_export"]) and not has_photo:
            blockers.append("HIGH_VARIANCE_PHOTO_MISSING")

        # No dedicated correction_proposal workflow exists (see Open Gaps);
        # inferred from correction_metadata being present but not approved.
        correction_metadata = line.get("correction_metadata")
        if isinstance(correction_metadata, dict) and not correction_metadata.get("approved_by"):
            blockers.append("PENDING_CORRECTION_PROPOSAL")

        finalized_at = _as_naive_utc((session or {}).get("finalized_at"))
        erp_last_synced = _as_naive_utc((erp_item or {}).get("last_synced"))
        if erp_item is not None:
            if erp_last_synced is None:
                warnings.append("ERP_REFRESH_STALE")
            else:
                if finalized_at is not None and erp_last_synced > finalized_at:
                    warnings.append("ERP_QTY_CHANGED_SINCE_FINALIZATION")
                if datetime.utcnow() - erp_last_synced > _ERP_REFRESH_STALE_AFTER:
                    warnings.append("ERP_REFRESH_STALE")

        photo_proofs = line.get("photo_proofs") or []
        if photo_proofs and any(not proof.get("url") for proof in photo_proofs):
            warnings.append("PHOTO_MANIFEST_INCOMPLETE")

        if not line.get("item_name") or line.get("item_name") == "Unknown":
            warnings.append("MISSING_OPTIONAL_METADATA")

        # Sourced once here so file generation (which must never re-read
        # erp_items) can use the exact same value that was reviewed at
        # preview time. No true "valuation_rate" field exists anywhere in
        # this codebase (see docs/BSR_REMEDIATION_STATUS.md); mrp is the
        # best available proxy, falling back to 0.0 -- never fabricated to
        # a nonzero guess.
        mrp = float((erp_item or {}).get("mrp") or line.get("mrp_erp") or 0.0)
        if erpnext_adjustment_qty is not None:
            if abs(erpnext_adjustment_qty * mrp) > _HIGH_ADJUSTMENT_VALUE_THRESHOLD:
                warnings.append("HIGH_ADJUSTMENT_VALUE")

        # SQL item-master enrichment + GST/HSN/purchase-history validation
        # (see docs/BSR_REMEDIATION_STATUS.md Step 8): sourced once here,
        # at preview-generation time, from the already-synced erp_items
        # cache -- never a second live read at file-generation time.
        item_master_result = await self.item_master_validation_service.build_snapshot(
            item_code=item_code,
            item_name=line.get("item_name"),
            current_user=current_user,
            require_validation=item_flags["requires_item_master_validation"],
        )
        blockers.extend(item_master_result["blockers"])
        warnings.extend(item_master_result["warnings"])

        return {
            "count_line_id": line_id,
            "item_code": item_code,
            "item_name": line.get("item_name") or (erp_item or {}).get("item_name"),
            "warehouse": warehouse,
            "erpnext_warehouse": erpnext_warehouse,
            "erpnext_uom": erpnext_uom,
            "uom_conversion_factor": uom_conversion_factor,
            "batch_no": batch_no,
            "serial_numbers": serial_numbers,
            "photo_refs": [proof.get("url") for proof in photo_proofs if proof.get("url")],
            # Structured photo evidence for file generation (id/url/
            # timestamp only -- never photo_base64/blob data).
            "photo_proofs": [
                {
                    "id": proof.get("id"),
                    "url": proof.get("url"),
                    "timestamp": proof.get("timestamp"),
                }
                for proof in photo_proofs
            ],
            "mrp": mrp,
            "manufacturing_date": line.get("manufacturing_date"),
            "expiry_date": line.get("expiry_date"),
            # Not auto-populated -- a correction proposal can set this; file
            # generation falls back to its own computed remarks otherwise.
            "remarks": None,
            "baseline_qty": baseline_qty,
            "existing_sql_qty": existing_sql_qty,
            "counted_qty": counted_qty,
            "stock_verify_variance": stock_verify_variance,
            "erp_drift": erp_drift,
            "final_gap": final_gap,
            "erpnext_opening_qty": erpnext_opening_qty,
            "erpnext_adjustment_qty": erpnext_adjustment_qty,
            **item_master_result["snapshot"],
            "blockers": blockers,
            "warnings": warnings,
        }

    async def _create_version_record(
        self,
        *,
        session_id: str,
        mode: str,
        company: str,
        status: str,
        generated_by: str,
        summary: dict[str, Any],
        rows: list[dict[str, Any]],
        blockers: list[str],
        warnings: list[str],
    ) -> tuple[str, int]:
        # Versioning/supersession is scoped to (session_id, mode, company):
        # regenerating a preview for a different mode or company must not
        # supersede an unrelated draft/approval.
        version_scope = {"session_id": session_id, "mode": mode, "company": company}
        existing = await self.db.erpnext_export_previews.find(
            version_scope
        ).sort("export_version", -1).to_list(length=1)

        next_version = 1
        if existing:
            latest = existing[0]
            next_version = int(latest.get("export_version") or 0) + 1
            # Approved/exported versions are immutable; only an un-approved
            # draft gets explicitly superseded by a regeneration.
            if latest.get("status") not in ("APPROVED", "EXPORTED"):
                await self.db.erpnext_export_previews.update_one(
                    {"export_id": latest.get("export_id")},
                    {
                        "$set": {
                            "status": "SUPERSEDED",
                            "superseded_at": datetime.now(timezone.utc),
                        }
                    },
                )

        export_id = str(uuid.uuid4())
        doc = {
            "export_id": export_id,
            "export_version": next_version,
            "session_id": session_id,
            "mode": mode,
            "company": company,
            "status": status,
            "generated_by": generated_by,
            "generated_at": datetime.now(timezone.utc),
            "summary": summary,
            "rows": rows,
            "blockers": blockers,
            "warnings": warnings,
            "file_hash": None,
            "approved_by": None,
            "approved_at": None,
            "approval_hash": None,
            "exported_at": None,
            "file_hashes": {},
            "file_generated_at": {},
            "file_generated_by": {},
        }
        await self.db.erpnext_export_previews.insert_one(doc)
        return export_id, next_version

    async def _audit_preview_generated(
        self, current_user: dict[str, Any], response: dict[str, Any]
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_PREVIEW_GENERATED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_preview",
                entity_id=response["export_id"],
                session_id=response["session_id"],
                details={
                    "export_id": response["export_id"],
                    "export_version": response["export_version"],
                    "session_id": response["session_id"],
                    "company": response["company"],
                    "mode": response["mode"],
                    "status": response["status"],
                    "blocker_count": len(response["blockers"]),
                    "warning_count": len(response["warnings"]),
                },
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit export preview generation: %s", exc)

    async def approve_preview(
        self,
        *,
        export_id: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        """Approve a previously-generated preview, freezing it immutably.

        Never recalculates rows -- approval only re-validates a small set of
        lightweight safety conditions against the *current* state (session
        still finalized, approved line count unchanged, no new offline
        conflicts) and, if all pass, stamps the existing frozen payload as
        approved. If anything has drifted, the caller must regenerate the
        preview instead.
        """
        preview = await self.db.erpnext_export_previews.find_one({"export_id": export_id})
        if preview is None:
            raise ErpNextExportNotFoundError(f"Export preview {export_id!r} not found")

        status = preview.get("status")
        if status in ("SUPERSEDED", "CANCELLED"):
            raise ErpNextExportApprovalError(f"Cannot approve a {status} preview")
        if status != "READY_FOR_APPROVAL":
            raise ErpNextExportApprovalError(
                f"Cannot approve preview with status {status!r}; only a "
                "READY_FOR_APPROVAL preview can be approved"
            )
        if preview.get("blockers"):
            raise ErpNextExportApprovalError(
                "Cannot approve a preview with unresolved blockers"
            )
        if await self.correction_service.has_pending_proposals(export_id):
            raise ErpNextExportApprovalError(
                "Cannot approve a preview with pending correction proposals; "
                "resolve them (approve or reject) before approving"
            )

        company = preview.get("company")
        if not company:
            raise ErpNextExportApprovalError(
                "COMPANY_REQUIRED: preview has no company context recorded"
            )

        session_id = preview.get("session_id")
        session = await find_session(self.db, session_id)
        if not (session and is_session_finalized(session)):
            raise ErpNextExportApprovalError(
                "Session is no longer finalized; regenerate the preview before approving"
            )

        current_lines = await self.db.count_lines.find(
            {"session_id": session_id}
        ).to_list(length=100000)
        current_approved_count = sum(
            1 for line in current_lines if get_effective_approval_status(line) == "APPROVED"
        )
        snapshot_approved_count = int((preview.get("summary") or {}).get("approved_line_count") or 0)
        if current_approved_count != snapshot_approved_count:
            raise ErpNextExportApprovalError(
                "Approved count-line count has changed since this preview was "
                "generated; regenerate the preview before approving"
            )

        conflict_count = await self.db.sync_conflicts.count_documents(
            {"session_id": session_id, "status": "pending"}
        )
        if conflict_count:
            raise ErpNextExportApprovalError(
                "Offline conflicts are now pending for this session; regenerate "
                "the preview before approving"
            )

        approved_at = datetime.now(timezone.utc)
        approved_by = str(current_user.get("username") or "system")
        approval_hash = self.compute_approval_hash(preview)

        await self.db.erpnext_export_previews.update_one(
            {"export_id": export_id},
            {
                "$set": {
                    "status": "APPROVED",
                    "approved_by": approved_by,
                    "approved_at": approved_at,
                    "approval_hash": approval_hash,
                }
            },
        )
        updated = await self.db.erpnext_export_previews.find_one({"export_id": export_id})

        response = {
            "export_id": updated["export_id"],
            "export_version": updated["export_version"],
            "session_id": updated["session_id"],
            "company": updated.get("company"),
            "mode": updated["mode"],
            "status": updated["status"],
            "approved_by": updated["approved_by"],
            "approved_at": updated["approved_at"],
            "approval_hash": updated["approval_hash"],
        }

        await self._audit_preview_approved(current_user, updated)
        return response

    @staticmethod
    def compute_approval_hash(preview: dict[str, Any]) -> str:
        """Hash of the frozen preview payload as it existed at approval time
        (before approval fields are stamped on) -- proves later file
        generation used exactly what was reviewed, not a drifted copy."""
        payload = {
            "export_id": preview.get("export_id"),
            "export_version": preview.get("export_version"),
            "session_id": preview.get("session_id"),
            "company": preview.get("company"),
            "mode": preview.get("mode"),
            "summary": preview.get("summary"),
            "rows": preview.get("rows"),
            "blockers": preview.get("blockers"),
            "warnings": preview.get("warnings"),
        }
        serialized = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    async def _audit_preview_approved(
        self, current_user: dict[str, Any], preview: dict[str, Any]
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_PREVIEW_APPROVED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_preview",
                entity_id=preview["export_id"],
                session_id=preview["session_id"],
                details={
                    "export_id": preview["export_id"],
                    "export_version": preview["export_version"],
                    "session_id": preview["session_id"],
                    "company": preview.get("company"),
                    "mode": preview["mode"],
                    "approval_hash": preview.get("approval_hash"),
                    "line_count": len(preview.get("rows") or []),
                },
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit export preview approval: %s", exc)
