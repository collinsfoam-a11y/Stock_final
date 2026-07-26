"""HSN suggestion selection -> correction proposal (BSR Step 10).

When a supervisor/admin selects one of `HsnSuggestionService`'s candidates,
this creates a normal `PENDING` export correction proposal (see
erpnext_export_correction_service.py) -- it never mutates the preview row,
the export, or the SQL item master directly. Admin approval is still
required, and the correction only takes effect the next time the preview is
regenerated, exactly like any other correction proposal. The suggestion's
provenance (source, confidence, description, official-source flag) is
preserved on the proposal's `metadata` field so a reviewer can see exactly
what was selected and why.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.erpnext_export_correction_service import (
    ErpNextExportCorrectionError,
    ErpNextExportCorrectionNotFoundError,
    ErpNextExportCorrectionService,
)


class HsnSuggestionSelectionError(ValueError):
    """Request-level validation error (unknown suggestion_id)."""


class HsnSuggestionSelectionService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.correction_service = ErpNextExportCorrectionService(db)

    async def cache_suggestions(
        self, *, item_code: str, suggestions: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Assigns a `suggestion_id` to each suggestion and persists it
        transiently so a later selection call can look up its provenance.
        Never mutates anything else; suggestions remain plain data until a
        human selects one."""
        now = datetime.now(timezone.utc)
        enriched: list[dict[str, Any]] = []
        for suggestion in suggestions:
            suggestion_id = str(uuid.uuid4())
            doc = {**suggestion, "suggestion_id": suggestion_id, "item_code": item_code, "generated_at": now}
            await self.db.hsn_suggestion_cache.insert_one(doc)
            enriched.append({**suggestion, "suggestion_id": suggestion_id})
        return enriched

    async def select_suggestion(
        self,
        *,
        export_id: str,
        row_key: str,
        suggestion_id: str,
        hsn_sac: str,
        gst_percentage: Optional[float],
        reason: str,
        current_user: dict[str, Any],
    ) -> dict[str, Any]:
        cached = await self.db.hsn_suggestion_cache.find_one({"suggestion_id": suggestion_id})
        if cached is None:
            raise HsnSuggestionSelectionError(f"Suggestion {suggestion_id!r} not found or expired")

        try:
            proposal = await self.correction_service.create_proposal(
                export_id=export_id,
                row_key=row_key,
                proposed_changes={"hsn_sac": hsn_sac, "gst_percentage": gst_percentage},
                reason=reason,
                current_user=current_user,
            )
        except (ErpNextExportCorrectionError, ErpNextExportCorrectionNotFoundError):
            raise

        now = datetime.now(timezone.utc)
        selection_metadata = {
            "suggestion_id": suggestion_id,
            "suggestion_source": cached.get("source"),
            "suggestion_source_url": cached.get("source_url"),
            "suggestion_is_official_source": bool(cached.get("is_official_source")),
            "suggestion_confidence": cached.get("confidence"),
            "suggestion_description": cached.get("description"),
            "manual_verification_required": bool(cached.get("requires_manual_verification", True)),
            "selected_by": current_user.get("username"),
            "selected_at": now,
        }
        await self.db.erpnext_export_correction_proposals.update_one(
            {"proposal_id": proposal["proposal_id"]}, {"$set": {"metadata": selection_metadata}}
        )
        updated = await self.db.erpnext_export_correction_proposals.find_one(
            {"proposal_id": proposal["proposal_id"]}
        )

        await self._audit(current_user, updated)
        return self._strip(updated)

    @staticmethod
    def _strip(doc: dict[str, Any]) -> dict[str, Any]:
        doc = dict(doc)
        doc.pop("_id", None)
        return doc

    async def _audit(self, current_user: dict[str, Any], proposal: dict[str, Any]) -> None:
        try:
            from backend.models.audit import AuditEventType
            from backend.services.audit_service import AuditService

            await AuditService(self.db).log_event(
                event_type=AuditEventType.EXPORT_HSN_SUGGESTION_SELECTED,
                actor_id=current_user.get("username"),
                actor_username=current_user.get("username"),
                actor_role=current_user.get("role"),
                entity_type="erpnext_export_correction_proposal",
                entity_id=str(proposal.get("proposal_id") or ""),
                session_id=proposal.get("session_id"),
                details={
                    "proposal_id": proposal.get("proposal_id"),
                    "export_id": proposal.get("export_id"),
                    "row_key": proposal.get("row_key"),
                    "suggestion_id": (proposal.get("metadata") or {}).get("suggestion_id"),
                    "suggestion_source": (proposal.get("metadata") or {}).get("suggestion_source"),
                },
            )
        except Exception:  # pragma: no cover - best-effort by contract
            pass
