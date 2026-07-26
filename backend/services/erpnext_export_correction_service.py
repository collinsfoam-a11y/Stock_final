"""ERPNext export correction proposal workflow (BSR).

Corrections to export-facing preview row fields are proposals, never
silent edits: nothing is ever applied to an existing preview document.
An approved proposal only takes effect the next time a preview is
regenerated for the same (session, mode, company) scope, producing a new,
separately versioned preview -- the preview a proposal was raised against
is never mutated. Rejected proposals remain stored, never deleted.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# Only these export-facing fields may be corrected. Quantity/identity/
# integrity fields must go through recount/versioning, not export
# correction -- enforced as a strict allow-list (anything not listed here
# is rejected), which also covers every field explicitly called out as
# forbidden without needing a second, separately-maintained deny-list.
ALLOWED_CORRECTION_FIELDS = frozenset(
    {
        "erpnext_warehouse",
        "batch_no",
        "serial_numbers",
        "photo_proofs",
        "mrp",
        "manufacturing_date",
        "expiry_date",
        "remarks",
        "hsn_sac",
        "gst_percentage",
    }
)

_TERMINAL_PREVIEW_STATUSES_FOR_NEW_PROPOSAL = ("APPROVED", "SUPERSEDED", "CANCELLED", "EXPORTED")

_AUDIT_ACTION_EVENTS = (
    "EXPORT_CORRECTION_PROPOSED",
    "EXPORT_CORRECTION_APPROVED",
    "EXPORT_CORRECTION_REJECTED",
    "EXPORT_CORRECTION_APPLIED",
)


class ErpNextExportCorrectionError(ValueError):
    """Request-level validation error (bad field, missing reason, wrong preview/proposal status)."""


class ErpNextExportCorrectionNotFoundError(LookupError):
    """Raised when a proposal_id or export_id does not resolve."""


def _strip_id(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if doc is None:
        return None
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


class ErpNextExportCorrectionService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def create_proposal(
        self,
        *,
        export_id: str,
        row_key: str,
        proposed_changes: dict[str, Any],
        reason: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        reason = str(reason or "").strip()
        if not reason:
            raise ErpNextExportCorrectionError("reason is required")
        if not proposed_changes:
            raise ErpNextExportCorrectionError("proposed_changes must not be empty")

        forbidden_keys = set(proposed_changes) - ALLOWED_CORRECTION_FIELDS
        if forbidden_keys:
            raise ErpNextExportCorrectionError(
                f"Cannot propose changes to {sorted(forbidden_keys)}; only "
                f"{sorted(ALLOWED_CORRECTION_FIELDS)} may be corrected via an export "
                "correction proposal. Quantity fields must go through recount/"
                "versioning, not export correction."
            )

        preview = await self.db.erpnext_export_previews.find_one({"export_id": export_id})
        if preview is None:
            raise ErpNextExportCorrectionNotFoundError(f"Export preview {export_id!r} not found")
        if preview.get("status") in _TERMINAL_PREVIEW_STATUSES_FOR_NEW_PROPOSAL:
            raise ErpNextExportCorrectionError(
                f"Cannot propose a correction against a preview with status "
                f"{preview.get('status')!r}; corrections must be raised before approval"
            )

        row_key = str(row_key or "").strip()
        target_row = next(
            (r for r in (preview.get("rows") or []) if str(r.get("count_line_id")) == row_key),
            None,
        )
        if target_row is None:
            raise ErpNextExportCorrectionError(
                f"row_key {row_key!r} does not match any row on this preview"
            )

        original_values = {key: target_row.get(key) for key in proposed_changes}

        now = datetime.now(timezone.utc)
        doc = {
            "proposal_id": str(uuid.uuid4()),
            "export_id": export_id,
            "session_id": preview.get("session_id"),
            "company": preview.get("company"),
            "mode": preview.get("mode"),
            "row_key": row_key,
            "item_code": target_row.get("item_code"),
            "status": "PENDING",
            "proposed_changes": dict(proposed_changes),
            "original_values": original_values,
            "reason": reason,
            "created_by": str(current_user.get("username") or "system"),
            "created_at": now,
            "reviewed_by": None,
            "reviewed_at": None,
            "review_reason": None,
            "applied_to_export_id": None,
            "metadata": {},
        }
        await self.db.erpnext_export_correction_proposals.insert_one(doc)
        await self._audit("EXPORT_CORRECTION_PROPOSED", current_user, doc)
        return _strip_id(doc)

    async def list_proposals(self, export_id: str) -> list[dict[str, Any]]:
        docs = await self.db.erpnext_export_correction_proposals.find(
            {"export_id": export_id}
        ).to_list(length=10000)
        return [_strip_id(d) for d in docs]

    async def get_proposal(self, proposal_id: str) -> dict[str, Any] | None:
        doc = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal_id}
        )
        return _strip_id(doc)

    async def approve_proposal(
        self,
        proposal_id: str,
        *,
        current_user: dict[str, Any],
        review_reason: str | None = None,
    ) -> dict[str, Any]:
        proposal = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal_id}
        )
        if proposal is None:
            raise ErpNextExportCorrectionNotFoundError(
                f"Correction proposal {proposal_id!r} not found"
            )
        if proposal.get("status") != "PENDING":
            raise ErpNextExportCorrectionError(
                f"Cannot approve a proposal with status {proposal.get('status')!r}; "
                "only a PENDING proposal can be approved"
            )

        now = datetime.now(timezone.utc)
        username = str(current_user.get("username") or "system")
        await self.db.erpnext_export_correction_proposals.update_one(
            {"proposal_id": proposal_id},
            {
                "$set": {
                    "status": "APPROVED",
                    "reviewed_by": username,
                    "reviewed_at": now,
                    "review_reason": review_reason,
                }
            },
        )
        updated = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal_id}
        )
        await self._audit("EXPORT_CORRECTION_APPROVED", current_user, updated)
        return _strip_id(updated)

    async def reject_proposal(
        self,
        proposal_id: str,
        *,
        current_user: dict[str, Any],
        review_reason: str,
    ) -> dict[str, Any]:
        review_reason = str(review_reason or "").strip()
        if not review_reason:
            raise ErpNextExportCorrectionError("review_reason is required to reject a proposal")

        proposal = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal_id}
        )
        if proposal is None:
            raise ErpNextExportCorrectionNotFoundError(
                f"Correction proposal {proposal_id!r} not found"
            )
        if proposal.get("status") != "PENDING":
            raise ErpNextExportCorrectionError(
                f"Cannot reject a proposal with status {proposal.get('status')!r}; "
                "only a PENDING proposal can be rejected"
            )

        now = datetime.now(timezone.utc)
        username = str(current_user.get("username") or "system")
        await self.db.erpnext_export_correction_proposals.update_one(
            {"proposal_id": proposal_id},
            {
                "$set": {
                    "status": "REJECTED",
                    "reviewed_by": username,
                    "reviewed_at": now,
                    "review_reason": review_reason,
                }
            },
        )
        updated = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal_id}
        )
        await self._audit("EXPORT_CORRECTION_REJECTED", current_user, updated)
        return _strip_id(updated)

    async def has_pending_proposals(self, export_id: str) -> bool:
        count = await self.db.erpnext_export_correction_proposals.count_documents(
            {"export_id": export_id, "status": "PENDING"}
        )
        return bool(count)

    async def get_approved_corrections_for_scope(
        self, *, session_id: str, mode: str, company: str
    ) -> dict[str, dict[str, Any]]:
        """Approved proposals to apply during the next preview generation
        for this (session, mode, company) scope, keyed by row_key.

        Applied regardless of which earlier export_id they were raised
        against, so an approved correction keeps taking effect on every
        future regeneration of this scope -- it never mutates the preview
        it was originally raised against.
        """
        docs = await self.db.erpnext_export_correction_proposals.find(
            {
                "session_id": session_id,
                "mode": mode,
                "company": company,
                "status": "APPROVED",
            }
        ).to_list(length=10000)
        by_row_key: dict[str, dict[str, Any]] = {}
        for doc in docs:
            by_row_key[str(doc.get("row_key"))] = doc
        return by_row_key

    async def mark_applied(self, proposal_ids: list[str], *, export_id: str) -> None:
        for proposal_id in proposal_ids:
            await self.db.erpnext_export_correction_proposals.update_one(
                {"proposal_id": proposal_id},
                {"$set": {"applied_to_export_id": export_id}},
            )

    async def audit_applied(
        self, current_user: dict[str, Any], proposal: dict[str, Any], *, export_id: str
    ) -> None:
        enriched = dict(proposal)
        enriched["applied_to_export_id"] = export_id
        await self._audit("EXPORT_CORRECTION_APPLIED", current_user, enriched)

    async def _audit(
        self,
        action: str,
        current_user: dict[str, Any],
        proposal: dict[str, Any],
    ) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            event_type = getattr(AuditEventType, action)
            details = {
                "proposal_id": proposal.get("proposal_id"),
                "export_id": proposal.get("export_id"),
                "row_key": proposal.get("row_key"),
                "item_code": proposal.get("item_code"),
                "status": proposal.get("status"),
            }
            if action == "EXPORT_CORRECTION_APPLIED":
                details["applied_to_export_id"] = proposal.get("applied_to_export_id")
            await AuditService(self.db).log_event(
                event_type=event_type,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_correction_proposal",
                entity_id=str(proposal.get("proposal_id") or ""),
                session_id=proposal.get("session_id"),
                details=details,
            )
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Failed to audit ERPNext export correction change (%s): %s", action, exc)
