from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
from typing import Any, Optional

from fastapi import HTTPException

from backend.services.governance_guard import (
    GovernanceViolation,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_reason(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_superseded_status(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return value.strip().lower() == "superseded"


def _is_superseded_count_line(line: Any) -> bool:
    if not isinstance(line, dict):
        return False
    if _is_superseded_status(line.get("status")):
        return True
    if line.get("superseded_by_version_id"):
        return True
    if line.get("superseded_at"):
        return True
    return False


def _resolve_unit_price(item: dict[str, Any]) -> float:
    for field_name in ("last_cost", "sale_price", "sales_price", "mrp"):
        value = _as_float(item.get(field_name), default=0.0)
        if value != 0.0 or item.get(field_name) not in (None, ""):
            return value
    return 0.0


def _build_semantic_hash(document: dict[str, Any]) -> str:
    payload = {
        "session_id": str(document.get("session_id") or ""),
        "item_id": str(document.get("item_code") or document.get("item_id") or ""),
        "location_id": str(document.get("location_id") or ""),
        "counted_qty": _as_float(document.get("counted_qty")),
        "version": int(document.get("version", 1) or 1),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _normalize_update_array_values(value: Any) -> list[Any]:
    if isinstance(value, dict) and isinstance(value.get("$each"), list):
        return list(value.get("$each") or [])
    if isinstance(value, list):
        return list(value)
    return [value]


def _apply_update_document_to_merged(
    merged_document: dict[str, Any],
    update_doc: dict[str, Any],
) -> None:
    # Replacement-style updates (no operators) behave like top-level key updates.
    if not any(str(key).startswith("$") for key in update_doc):
        merged_document.update(update_doc)
        return

    set_doc = update_doc.get("$set")
    if isinstance(set_doc, dict):
        merged_document.update(set_doc)

    inc_doc = update_doc.get("$inc")
    if isinstance(inc_doc, dict):
        for field_name, delta in inc_doc.items():
            current_value = merged_document.get(field_name)
            if isinstance(current_value, (int, float)) and isinstance(delta, (int, float)):
                merged_document[field_name] = current_value + delta
            elif isinstance(delta, (int, float)):
                merged_document[field_name] = delta

    unset_doc = update_doc.get("$unset")
    if isinstance(unset_doc, dict):
        for field_name in unset_doc.keys():
            merged_document.pop(field_name, None)

    for operator in ("$push", "$addToSet"):
        push_doc = update_doc.get(operator)
        if not isinstance(push_doc, dict):
            continue
        for field_name, raw_values in push_doc.items():
            values = _normalize_update_array_values(raw_values)
            existing = merged_document.get(field_name)
            if not isinstance(existing, list):
                existing = [] if existing is None else [existing]
            if operator == "$addToSet":
                for value in values:
                    if value not in existing:
                        existing.append(value)
            else:
                existing.extend(values)
            merged_document[field_name] = existing

    pull_doc = update_doc.get("$pull")
    if isinstance(pull_doc, dict):
        for field_name, raw_condition in pull_doc.items():
            existing = merged_document.get(field_name)
            if not isinstance(existing, list):
                continue
            if isinstance(raw_condition, dict) and isinstance(raw_condition.get("$in"), list):
                disallowed_values = list(raw_condition.get("$in") or [])
                merged_document[field_name] = [
                    value for value in existing if value not in disallowed_values
                ]
            else:
                merged_document[field_name] = [
                    value for value in existing if value != raw_condition
                ]


@dataclass(frozen=True)
class CountLineGovernanceDecision:
    approval_status: str
    approved_at: Optional[datetime]
    approved_by: Optional[str]
    requires_supervisor_approval: bool
    status: str
    variance: float
    variance_data: dict[str, Any]
    violated_thresholds: list[dict[str, Any]]


@dataclass(frozen=True)
class CountLineGovernanceModeProfile:
    require_active_session: bool
    require_full_context: bool


DEFAULT_GOVERNANCE_MODE = "active_session"
GOVERNANCE_MODE_PROFILES: dict[str, CountLineGovernanceModeProfile] = {
    "active_session": CountLineGovernanceModeProfile(
        require_active_session=True,
        require_full_context=True,
    ),
    "mutable_session": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=True,
    ),
    "finalization": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=False,
    ),
    "repair": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=False,
    ),
}
DEFAULT_VALIDATION_MODE = "enforce"
VALIDATION_MODES = {"enforce", "repair_skip"}


from backend.services.count_lines.base import CountLineServiceBase


class CountLineGovernanceMixin(CountLineServiceBase):
    """Authoritative write-side governance for count-line mutations."""






    @staticmethod
    def _resolve_governance_mode_profile(
        context: dict[str, Any],
    ) -> CountLineGovernanceModeProfile:
        if "require_active_session" in context or "require_full_context" in context:
            raise GovernanceViolation(
                "CRITICAL: free-form governance flags have been removed. Use governance_mode."
            )

        mode_name = str(context.get("governance_mode") or DEFAULT_GOVERNANCE_MODE).strip().lower()
        profile = GOVERNANCE_MODE_PROFILES.get(mode_name)
        if profile is None:
            raise GovernanceViolation(f"CRITICAL: Unsupported governance_mode '{mode_name}'")
        return profile


















    def _should_apply_governance(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> bool:
        if "skip_governance" in context:
            raise GovernanceViolation(
                "CRITICAL: skip_governance bypass has been removed from CountLineWriteService"
            )

        operation = str(payload.get("operation") or "").strip().lower()
        if operation == "insert_one":
            document = payload.get("document")
            return isinstance(document, dict) and "counted_qty" in document

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return False
            set_doc = update_doc.get("$set")
            return isinstance(set_doc, dict) and "counted_qty" in set_doc

        return bool(context.get("enforce_variance"))

    async def assert_session_integrity(
        self, *, session: Optional[dict[str, Any]] = None, session_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        if not hasattr(self.snapshot_service, "assert_session_snapshot_integrity"):
            return None
        try:
            result = self.snapshot_service.assert_session_snapshot_integrity(
                session, session_id=session_id
            )
            return await self._resolve_awaitable(result)
        except Exception as exc:
            if exc.__class__.__name__ != "SnapshotIntegrityError":
                raise
            raise HTTPException(
                status_code=409,
                detail="Snapshot integrity violated for this session",
            ) from exc


    async def evaluate_policy(
        self,
        *,
        item_code: str,
        counted_qty: float,
        expected_qty: float,
        item: dict[str, Any],
        location: Optional[str] = None,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        variance = float(counted_qty) - float(expected_qty)
        reason_present = bool(_normalize_reason(variance_reason)) or bool(correction_reason)
        if require_correction_reason_for_variance and abs(variance) > 0 and not reason_present:
            raise HTTPException(
                status_code=400,
                detail="Correction reason is mandatory when variance exists",
            )

        variance_data = await self.variance_service.calculate_variance(
            item_code=item_code,
            counted_qty=float(counted_qty),
            expected_qty=float(expected_qty),
            unit_price=_resolve_unit_price(item),
            valuation_basis="last_cost",
        )
        requires_approval, violated_thresholds = await self.variance_service.check_thresholds(
            variance_data,
            item_category=item.get("category"),
            location=location,
        )

        if (
            any(threshold.get("require_reason") for threshold in violated_thresholds)
            and not reason_present
        ):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Variance reason is required for this count",
                    "violated_thresholds": violated_thresholds,
                    "variance_data": variance_data,
                },
            )

        approved_at = None if requires_approval else _utc_now()
        approved_by = None if requires_approval else "system"
        return CountLineGovernanceDecision(
            approval_status="NEEDS_REVIEW" if requires_approval else "APPROVED",
            approved_at=approved_at,
            approved_by=approved_by,
            requires_supervisor_approval=requires_approval,
            status="pending" if requires_approval else "approved",
            variance=variance,
            variance_data=variance_data,
            violated_thresholds=violated_thresholds,
        )

    async def evaluate_new_count_line(
        self,
        *,
        session: dict[str, Any],
        item_code: str,
        counted_qty: float,
        erp_item: dict[str, Any],
        expected_qty: float,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        return await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=True,
        )

    async def evaluate_existing_count_line(
        self,
        *,
        session: dict[str, Any],
        count_line: dict[str, Any],
        counted_qty: float,
        erp_item: dict[str, Any],
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        expected_qty = float(count_line.get("erp_qty") or 0.0)
        return await self.evaluate_policy(
            item_code=str(count_line.get("item_code") or ""),
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=require_correction_reason_for_variance,
        )




        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.

    async def _evaluate_governance_for_document(
        self,
        document: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[CountLineGovernanceDecision, dict[str, Any], Optional[dict[str, Any]]]:
        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}
        item_code = str(document.get("item_code") or context.get("item_code") or "").strip()
        if not item_code:
            raise HTTPException(status_code=409, detail="Count line is missing item_code")

        counted_qty = float(document.get("counted_qty") or 0.0)
        if counted_qty < 0:
            raise HTTPException(status_code=400, detail="Negative quantity is not allowed")

        if not document.get("remark"):
            raise HTTPException(status_code=400, detail="Item remark is mandatory")

        expected_qty = float(document.get("erp_qty") or 0.0)
        session_id = str(document.get("session_id") or context.get("session_id") or "").strip()

        erp_item = context.get("erp_item")
        if not isinstance(erp_item, dict):
            erp_item = None
        if erp_item is None:
            barcode = str(document.get("barcode") or "").strip()
            if barcode:
                # FIX GROUP 9: Check all barcode fields, not just the primary one.
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one(
                        {
                            "$or": [
                                {"barcode": barcode},
                                {"manual_barcode": barcode},
                                {"carton_barcode": barcode},
                                {"pack_barcode": barcode},
                                {"unit_barcode": barcode},
                                {"alternate_barcodes": barcode},
                            ]
                        },
                        **kwargs,
                    )
                )
            if erp_item is None:
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one({"item_code": item_code}, **kwargs)
                )
            erp_item = erp_item or {}

        # Normalisation depends on the resolved ERP item, so it must run after
        # barcode/item_code resolution above.
        if isinstance(erp_item, dict) and erp_item:
            self.validation_service.normalize_quantity_for_item(item=erp_item, doc=document)

        if session_id:
            baseline_qty, baseline_hash = await self.resolve_baseline(
                session_id=session_id,
                item_code=item_code,
                username=str(context.get("username") or "system"),
                erp_item=erp_item,
                db_session=db_session,
            )
            expected_qty = baseline_qty
            document["erp_qty"] = baseline_qty
            document["baseline_hash"] = baseline_hash
        elif expected_qty == 0.0:
            expected_qty = float((erp_item or {}).get("stock_qty") or 0.0)
            document.setdefault("erp_qty", expected_qty)

        governance = await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=context.get("location") or document.get("floor_no"),
            variance_reason=context.get("variance_reason") or document.get("variance_reason"),
            correction_reason=(
                context.get("correction_reason")
                if "correction_reason" in context
                else document.get("correction_reason")
            ),
            require_correction_reason_for_variance=bool(
                context.get("require_correction_reason_for_variance", False)
            ),
        )
        session = await self._resolve_session_document(document, context)
        return governance, erp_item, session





