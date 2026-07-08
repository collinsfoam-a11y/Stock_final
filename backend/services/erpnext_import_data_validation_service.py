"""ERPNext import item-master data validation (BSR).

Orchestrates ErpSqlItemMasterEnrichmentService, HsnGstValidationService, and
PurchaseHistoryLookupService to build the per-row "data snapshot" documented
in docs/BSR_REMEDIATION_STATUS.md Step 8, plus the blocker/warning codes it
contributes to an ERPNext export preview row. Never writes to SQL Server or
ERPNext; never fabricates a missing value.

Severity classification (blocker vs warning) follows the Required/
Recommended/Conditional distinctions in the original requirement's own field
tables, not a blanket "everything blocks" policy -- see the module-level
comments below for the reasoning behind each choice.
"""

from __future__ import annotations

from typing import Any, Optional

from backend.services.erp_sql_item_master_enrichment_service import ErpSqlItemMasterEnrichmentService
from backend.services.hsn_gst_validation_service import HsnGstValidationService
from backend.services.purchase_history_lookup_service import PurchaseHistoryLookupService

# --- Blocker codes -----------------------------------------------------
# Promoted to hard blockers only where the source requirement table marked
# the field "Required"/"Yes" (not "Recommended"/"Conditional"/"Optional").
SQL_ITEM_MASTER_MISSING = "SQL_ITEM_MASTER_MISSING"
ITEM_CATEGORY_MISSING = "ITEM_CATEGORY_MISSING"
HSN_SAC_MISSING = "HSN_SAC_MISSING"
HSN_SAC_INVALID = "HSN_SAC_INVALID"
HSN_GST_RATE_MISMATCH = "HSN_GST_RATE_MISMATCH"
GST_PERCENTAGE_MISSING = "GST_PERCENTAGE_MISSING"
VALUATION_RATE_MISSING = "VALUATION_RATE_MISSING"

# --- Warning codes -------------------------------------------------------
# Demoted from the original "blocker" list to warnings where the source
# requirement table itself marked the field "Recommended" rather than
# "Required" (last_purchase_cost, supplier, purchase_mode/voucher-history
# completeness) -- documented explicitly, not a silent downgrade.
CATEGORY_OR_SUBCATEGORY_MISSING = "CATEGORY_OR_SUBCATEGORY_MISSING"
MRP_USED_AS_VALUATION_PROXY = "MRP_USED_AS_VALUATION_PROXY"
LAST_PURCHASE_COST_USED_AS_VALUATION = "LAST_PURCHASE_COST_USED_AS_VALUATION"
ZERO_VALUATION_RATE_FALLBACK = "ZERO_VALUATION_RATE_FALLBACK"
LAST_PURCHASE_COST_MISSING = "LAST_PURCHASE_COST_MISSING"
SQL_PURCHASE_HISTORY_MISSING = "SQL_PURCHASE_HISTORY_MISSING"
SUPPLIER_MISSING = "SUPPLIER_MISSING"
OLD_PURCHASE_COST = "OLD_PURCHASE_COST"
SUPPLIER_NOT_RECENT = "SUPPLIER_NOT_RECENT"
PURCHASE_MODE_UNKNOWN = "PURCHASE_MODE_UNKNOWN"
NON_GST_ITEM = "NON_GST_ITEM"
HSN_6_DIGIT_SUGGESTION_AVAILABLE = "HSN_6_DIGIT_SUGGESTION_AVAILABLE"
# Defined for forward-compatibility but never emitted today: no source
# field distinguishes nil-rated/exempt from merely-missing GST data in the
# current SQL sync (see docs/BSR_REMEDIATION_STATUS.md Step 8 Open Gaps).
GST_EXEMPT_OR_NIL_RATED_ITEM = "GST_EXEMPT_OR_NIL_RATED_ITEM"


class ErpNextImportDataValidationService:
    def __init__(self, db: Any) -> None:
        self.db = db
        self.item_master_service = ErpSqlItemMasterEnrichmentService(db)
        self.hsn_service = HsnGstValidationService(db)
        self.purchase_history_service = PurchaseHistoryLookupService()

    async def build_snapshot(
        self,
        *,
        item_code: str,
        item_name: Optional[str],
        current_user: dict[str, Any],
        require_validation: bool = False,
    ) -> dict[str, Any]:
        """Returns (snapshot_fields, blockers, warnings) for one preview row.
        snapshot_fields is merged additively onto the row at preview-
        generation time -- file generation never needs to re-derive it.

        `require_validation` is the per-item `requires_item_master_validation`
        export flag (default False, admin opt-in via
        ErpNextExportSettingsService). When False, every finding below is
        still computed and surfaced -- just as a warning instead of a
        blocker -- so existing/legacy items are never retroactively blocked
        by this new check before their SQL master data has actually been
        backfilled with GST/HSN/category values."""
        item_master = await self.item_master_service.fetch_item_master(item_code)
        blockers: list[str] = []
        warnings: list[str] = []

        def _report(code: str) -> None:
            (blockers if require_validation else warnings).append(code)

        if not item_master["found"]:
            blockers.append(SQL_ITEM_MASTER_MISSING)
            return {
                "snapshot": self._blank_snapshot(),
                "blockers": blockers,
                "warnings": warnings,
            }

        purchase = self.purchase_history_service.resolve(item_master)

        if not item_master.get("category"):
            _report(ITEM_CATEGORY_MISSING)
        if not item_master.get("subcategory"):
            warnings.append(CATEGORY_OR_SUBCATEGORY_MISSING)

        is_non_gst = purchase["is_non_gst"]
        if is_non_gst:
            warnings.append(NON_GST_ITEM)
        else:
            if not item_master.get("hsn_sac"):
                _report(HSN_SAC_MISSING)
            if item_master.get("gst_percentage") is None:
                _report(GST_PERCENTAGE_MISSING)

        hsn_result = await self.hsn_service.validate_hsn(
            hsn_sac=item_master.get("hsn_sac"),
            gst_percentage=item_master.get("gst_percentage"),
            sgst_percent=item_master.get("sgst_percent"),
            cgst_percent=item_master.get("cgst_percent"),
            igst_percent=item_master.get("igst_percent"),
            is_non_gst=is_non_gst,
            current_user=current_user,
        )
        if hsn_result["hsn_validation_status"] == "INVALID":
            _report(HSN_SAC_INVALID)
        if hsn_result["gst_rate_mismatch"]:
            _report(HSN_GST_RATE_MISMATCH)

        hsn_suggestions: list[dict[str, Any]] = []
        if hsn_result["hsn_validation_status"] in ("MISSING", "INVALID"):
            hsn_suggestions = self.hsn_service.suggest_hsn_candidates(
                item_name=item_name or "",
                category=item_master.get("category"),
                subcategory=item_master.get("subcategory"),
                brand=item_master.get("brand"),
            )
            if hsn_suggestions:
                warnings.append(HSN_6_DIGIT_SUGGESTION_AVAILABLE)

        valuation_rate, valuation_rate_source = self._resolve_valuation(item_master)
        if valuation_rate_source == "ZERO_FALLBACK":
            _report(VALUATION_RATE_MISSING)
            warnings.append(ZERO_VALUATION_RATE_FALLBACK)
        elif valuation_rate_source == "LAST_PURCHASE_COST":
            warnings.append(LAST_PURCHASE_COST_USED_AS_VALUATION)
        elif valuation_rate_source == "MRP_PROXY":
            warnings.append(MRP_USED_AS_VALUATION_PROXY)

        if item_master.get("last_purchase_cost") is None:
            warnings.append(LAST_PURCHASE_COST_MISSING)
        if not purchase["has_purchase_history"]:
            warnings.append(SQL_PURCHASE_HISTORY_MISSING)
        if not purchase["has_supplier"]:
            warnings.append(SUPPLIER_MISSING)
        if purchase["purchase_mode_unknown"]:
            warnings.append(PURCHASE_MODE_UNKNOWN)
        if purchase["supplier_not_recent"]:
            if item_master.get("last_purchase_cost") is not None:
                warnings.append(OLD_PURCHASE_COST)
            if purchase["has_supplier"]:
                warnings.append(SUPPLIER_NOT_RECENT)

        snapshot = {
            "barcode": item_master.get("barcode"),
            "brand": item_master.get("brand"),
            "category": item_master.get("category"),
            "subcategory": item_master.get("subcategory"),
            "item_group": item_master.get("item_group"),
            "hsn_sac": item_master.get("hsn_sac"),
            "gst_percentage": item_master.get("gst_percentage"),
            "gst_source": item_master.get("gst_source"),
            "hsn_validation_status": hsn_result["hsn_validation_status"],
            "hsn_validation_source": hsn_result["hsn_validation_source"],
            "hsn_validated_at": hsn_result["hsn_validated_at"],
            "hsn_suggestions": hsn_suggestions,
            "is_non_gst": is_non_gst,
            # Not derivable from any field currently synced from SQL Server
            # (see docs/BSR_REMEDIATION_STATUS.md Step 8 Open Gaps) -- left
            # None (unknown), never fabricated as False.
            "is_nil_rated": None,
            "is_exempt": None,
            "valuation_rate": valuation_rate,
            "valuation_rate_source": valuation_rate_source,
            "last_purchase_cost": purchase["last_purchase_cost"],
            "last_purchase_date": purchase["last_purchase_date"],
            "last_supplier_id": purchase["last_supplier_id"],
            "last_supplier_name": purchase["last_supplier_name"],
            "last_purchase_voucher_type": purchase["last_purchase_voucher_type"],
            "purchase_mode": purchase["purchase_mode"],
            "sql_item_master_refreshed_at": item_master.get("sql_item_master_refreshed_at"),
            "sql_purchase_history_refreshed_at": purchase["sql_purchase_history_refreshed_at"],
        }

        return {"snapshot": snapshot, "blockers": blockers, "warnings": warnings}

    @staticmethod
    def _resolve_valuation(item_master: dict[str, Any]) -> tuple[float, str]:
        # "REAL_VALUATION_RATE" is intentionally never selected: no such
        # field exists anywhere in this codebase's SQL sync today (see
        # docs/BSR_REMEDIATION_STATUS.md pre-existing Open Gaps). Kept as a
        # named source value only so a future real field can slot in
        # without changing this enum's shape.
        last_purchase_cost = item_master.get("last_purchase_cost")
        if last_purchase_cost:
            return float(last_purchase_cost), "LAST_PURCHASE_COST"
        mrp = item_master.get("mrp")
        if mrp:
            return float(mrp), "MRP_PROXY"
        return 0.0, "ZERO_FALLBACK"

    @staticmethod
    def _blank_snapshot() -> dict[str, Any]:
        return {
            "barcode": None,
            "brand": None,
            "category": None,
            "subcategory": None,
            "item_group": None,
            "hsn_sac": None,
            "gst_percentage": None,
            "gst_source": "missing",
            "hsn_validation_status": "MISSING",
            "hsn_validation_source": None,
            "hsn_validated_at": None,
            "hsn_suggestions": [],
            "is_non_gst": False,
            "is_nil_rated": None,
            "is_exempt": None,
            "valuation_rate": 0.0,
            "valuation_rate_source": "MISSING",
            "last_purchase_cost": None,
            "last_purchase_date": None,
            "last_supplier_id": None,
            "last_supplier_name": None,
            "last_purchase_voucher_type": None,
            "purchase_mode": None,
            "sql_item_master_refreshed_at": None,
            "sql_purchase_history_refreshed_at": None,
        }
