"""ERP SQL item-master enrichment (BSR).

Reads item-master fields that are already synced read-only from SQL Server
into the `erp_items` Mongo cache (see backend/services/sql_sync_service.py)
and normalizes them for ERPNext export preview rows. Never queries SQL
Server directly -- SQL Server access is exclusively through the existing,
read-only-enforced sync path; this service only reads the Mongo cache that
sync already populates. Never writes to `erp_items`, SQL Server, or
ERPNext. Never fabricates a value: a field with no source data is left
`None`, not defaulted to a fabricated non-null value.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

# Fields aliased 1:1 from erp_items because no separately-tracked ERPNext
# "item_group" concept exists in the SQL sync today -- category IS the
# item_group equivalent here (documented, not fabricated as a second field).
_IDENTITY_FIELDS = ("barcode", "brand_name")
_CLASSIFICATION_FIELDS = ("category", "subcategory")


def _as_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return None


class ErpSqlItemMasterEnrichmentService:
    """Read-only lookups against the erp_items Mongo cache (itself a
    read-only projection of SQL Server via sql_sync_service.py)."""

    def __init__(self, db: Any) -> None:
        self.db = db

    async def fetch_item_master(self, item_code: str) -> dict[str, Any]:
        """Returns a normalized item-master snapshot for one item_code.

        `found=False` means no erp_items document exists for this
        item_code at all -- the caller should raise SQL_ITEM_MASTER_MISSING
        rather than silently proceeding with blank fields.
        """
        erp_item = await self.db.erp_items.find_one({"item_code": item_code}) if item_code else None
        if erp_item is None:
            return {
                "found": False,
                "barcode": None,
                "brand": None,
                "category": None,
                "subcategory": None,
                "item_group": None,
                "hsn_sac": None,
                "gst_percentage": None,
                "sgst_percent": None,
                "cgst_percent": None,
                "igst_percent": None,
                "gst_source": "missing",
                "mrp": None,
                "last_purchase_cost": None,
                "last_purchase_rate": None,
                "last_purchase_date": None,
                "last_purchase_qty": None,
                "last_supplier_id": None,
                "last_supplier_name": None,
                "purchase_voucher_type": None,
                "sql_item_master_refreshed_at": None,
            }

        category = erp_item.get("category")
        return {
            "found": True,
            "barcode": erp_item.get("barcode"),
            "brand": erp_item.get("brand_name"),
            "category": category,
            "subcategory": erp_item.get("subcategory"),
            # See module docstring: no distinct item_group source exists.
            "item_group": category,
            "hsn_sac": erp_item.get("hsn_code"),
            "gst_percentage": erp_item.get("gst_percent"),
            "sgst_percent": erp_item.get("sgst_percent"),
            "cgst_percent": erp_item.get("cgst_percent"),
            "igst_percent": erp_item.get("igst_percent"),
            "gst_source": (
                "sql_item_master" if erp_item.get("gst_percent") is not None else "missing"
            ),
            "mrp": erp_item.get("mrp"),
            "last_purchase_cost": erp_item.get("last_purchase_cost"),
            "last_purchase_rate": erp_item.get("last_purchase_rate"),
            "last_purchase_date": _as_iso(erp_item.get("last_purchase_date"))
            or erp_item.get("last_purchase_date"),
            "last_purchase_qty": erp_item.get("last_purchase_qty"),
            "last_supplier_id": erp_item.get("supplier_id")
            or erp_item.get("last_purchase_supplier"),
            "last_supplier_name": erp_item.get("supplier_name"),
            "purchase_voucher_type": erp_item.get("purchase_voucher_type"),
            "sql_item_master_refreshed_at": _as_iso(erp_item.get("last_synced")),
        }
