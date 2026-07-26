"""Purchase-history / supplier / purchase-mode lookup (BSR).

Normalizes the last-purchase and supplier fields already synced read-only
from SQL Server into `erp_items` (see erp_sql_item_master_enrichment_service.py
for the actual field reads). Never queries SQL Server or writes anywhere.

Purchase voucher type meaning (confirmed directly with the business owner,
not guessed -- see docs/BSR_REMEDIATION_STATUS.md Step 8):
  PI = Purchase Invoice (a normal, GST-applicable purchase)
  PE = Purchase Estimate (a non-GST local purchase)
"SI"/"SE" do not exist anywhere in this codebase's SQL mapping and are not
implemented. There is no 4-digit voucher-type-code list in this system's
schema -- `purchase_voucher_type` is the 2-letter string SQL Server already
returns, used as-is.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

_PURCHASE_MODE_BY_VOUCHER_TYPE = {
    "PI": "PURCHASE_INVOICE",
    "PE": "PURCHASE_ESTIMATE_NON_GST_LOCAL_PURCHASE",
}

# No staleness-threshold configuration model exists for purchase history
# (mirrors the same documented-default pattern already used for ERP-qty
# staleness in erpnext_export_service.py). Warning-level only, never blocks.
_PURCHASE_STALE_AFTER = timedelta(days=180)


def _parse_iso(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


class PurchaseHistoryLookupService:
    """Pure, read-only normalization -- takes the item-master snapshot dict
    already fetched by ErpSqlItemMasterEnrichmentService and derives
    purchase_mode/staleness/completeness from it. Does not itself touch the
    database."""

    def resolve(self, item_master: dict[str, Any]) -> dict[str, Any]:
        voucher_type_raw = item_master.get("purchase_voucher_type")
        purchase_mode = _PURCHASE_MODE_BY_VOUCHER_TYPE.get(voucher_type_raw) if voucher_type_raw else None
        purchase_mode_unknown = bool(voucher_type_raw) and purchase_mode is None
        is_non_gst = purchase_mode == "PURCHASE_ESTIMATE_NON_GST_LOCAL_PURCHASE"

        has_purchase_history = any(
            item_master.get(key) is not None
            for key in ("last_purchase_cost", "last_purchase_rate", "last_purchase_date", "last_purchase_qty")
        )
        has_supplier = bool(item_master.get("last_supplier_id") or item_master.get("last_supplier_name"))

        last_purchase_date = _parse_iso(item_master.get("last_purchase_date"))
        is_stale = False
        if last_purchase_date is not None:
            reference = last_purchase_date if last_purchase_date.tzinfo else last_purchase_date.replace(tzinfo=timezone.utc)
            is_stale = (datetime.now(timezone.utc) - reference) > _PURCHASE_STALE_AFTER

        return {
            "last_purchase_cost": item_master.get("last_purchase_cost"),
            "last_purchase_date": item_master.get("last_purchase_date"),
            "last_supplier_id": item_master.get("last_supplier_id"),
            "last_supplier_name": item_master.get("last_supplier_name"),
            "last_purchase_voucher_type": voucher_type_raw,
            "purchase_mode": purchase_mode,
            "purchase_mode_unknown": purchase_mode_unknown,
            "is_non_gst": is_non_gst,
            "has_purchase_history": has_purchase_history,
            "has_supplier": has_supplier,
            "supplier_not_recent": bool(has_purchase_history and is_stale),
            "sql_purchase_history_refreshed_at": item_master.get("sql_item_master_refreshed_at"),
        }
