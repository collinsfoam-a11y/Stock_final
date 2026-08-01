from typing import Optional

"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging
from datetime import date, datetime, timezone
from typing import Any



logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers for building item dicts - reduces cyclomatic complexity
# ---------------------------------------------------------------------------


def _normalize_date(value: Any) -> Optional[str]:
    """Convert date/datetime to ISO string, or None."""
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).isoformat()
    try:
        return str(value)
    except Exception:
        return None


def _numeric_or_none(value: Any) -> Optional[float]:
    """Convert value to float, or None if not possible."""
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _coerce_qty(value: Any, default: float = 0.0) -> float:
    """Convert a SQL quantity to float, falling back for missing/invalid values."""
    numeric_value = _numeric_or_none(value)
    return numeric_value if numeric_value is not None else default


def _safe_optional_str(value: Any) -> Optional[str]:
    """Convert value to str, or None if empty/None."""
    if value in (None, ""):
        return None
    return str(value)


# Field definitions for building SQL item dictionaries
# Format: (sql_key, target_key, converter) where converter is one of:
#   "raw" - use value as-is
#   "str" - use _safe_optional_str
#   "num" - use _numeric_or_none
#   "date" - use _normalize_date
_NEW_ITEM_FIELDS: list[tuple[str, str, str]] = [
    # Core descriptive fields
    ("category", "category", "raw"),
    ("subcategory", "subcategory", "raw"),
    ("warehouse", "warehouse", "raw"),
    ("uom_code", "uom_code", "raw"),
    ("uom_name", "uom_name", "raw"),
    ("hsn_code", "hsn_code", "str"),
    ("gst_category", "gst_category", "str"),
    ("gst_percent", "gst_percent", "num"),
    ("sgst_percent", "sgst_percent", "num"),
    ("cgst_percent", "cgst_percent", "num"),
    ("igst_percent", "igst_percent", "num"),
    # Location / placement
    ("barcode", "barcode", "raw"),
    ("location", "location", "raw"),
    ("floor", "floor", "raw"),
    ("rack", "rack", "raw"),
    # Pricing / sales
    ("mrp", "mrp", "num"),
    ("sales_price", "sales_price", "num"),
    ("sale_price", "sale_price", "num"),
    ("standard_rate", "standard_rate", "num"),
    ("last_purchase_rate", "last_purchase_rate", "num"),
    ("last_purchase_price", "last_purchase_price", "num"),
    # Brand
    ("brand_id", "brand_id", "raw"),
    ("brand_name", "brand_name", "raw"),
    ("brand_code", "brand_code", "raw"),
    # Supplier
    ("supplier_id", "supplier_id", "str"),
    ("supplier_code", "supplier_code", "str"),
    ("supplier_name", "supplier_name", "str"),
    ("supplier_phone", "supplier_phone", "str"),
    ("supplier_city", "supplier_city", "str"),
    ("supplier_state", "supplier_state", "str"),
    ("supplier_gst", "supplier_gst", "str"),
    ("last_purchase_supplier", "last_purchase_supplier", "str"),
    # Purchase info
    ("purchase_price", "purchase_price", "num"),
    ("last_purchase_qty", "last_purchase_qty", "num"),
    ("purchase_qty", "purchase_qty", "num"),
    ("purchase_invoice_no", "purchase_invoice_no", "str"),
    ("purchase_reference", "purchase_reference", "str"),
    ("last_purchase_date", "last_purchase_date", "date"),
    ("last_purchase_cost", "last_purchase_cost", "num"),
    ("purchase_voucher_type", "purchase_voucher_type", "str"),
    ("purchase_type", "purchase_type", "str"),
    # Batch
    ("batch_id", "batch_id", "str"),
    ("batch_no", "batch_no", "str"),
    ("mfg_date", "manufacturing_date", "date"),
    ("expiry_date", "expiry_date", "date"),
]


def _apply_field_conversion(value: Any, converter: str) -> Any:
    """Apply the appropriate converter to a value."""
    if converter == "raw":
        return value
    if converter == "str":
        return _safe_optional_str(value)
    if converter == "num":
        return _numeric_or_none(value)
    if converter == "date":
        return _normalize_date(value)
    return value


def _build_new_item_dict(
    sql_item: dict[str, Any], sql_qty: float, now: datetime
) -> dict[str, Any]:
    """Build a new ERP item document from SQL data."""
    item = {
        "item_code": sql_item.get("item_code", ""),
        "item_name": sql_item.get("item_name", ""),
        "stock_qty": sql_qty,
        "sql_server_qty": sql_qty,
        # Enrichment fields (empty initially)
        "serial_number": None,
        "condition": None,
        # Tracking fields
        "data_complete": False,
        "completion_percentage": 0,
        "missing_fields": ["serial_number"],
        "enrichment_history": [],
        # Sync metadata
        "last_synced": now,
        "qty_changed_at": None,
        "created_at": now,
        "updated_at": now,
        "synced_from_sql": True,
    }
    # Apply defaults for category / warehouse
    item["category"] = sql_item.get("category", "General")
    item["warehouse"] = sql_item.get("warehouse", "Main")

    # Add optional fields via data-driven loop
    for sql_key, target_key, converter in _NEW_ITEM_FIELDS:
        if target_key in ("category", "warehouse"):
            continue  # Already handled with defaults
        value = sql_item.get(sql_key)
        item[target_key] = _apply_field_conversion(value, converter)

    return item


def _build_metadata_candidates(sql_item: dict[str, Any]) -> dict[str, Any]:
    """Build metadata candidates dict for backfill updates."""
    candidates: dict[str, Any] = {}
    for sql_key, target_key, converter in _NEW_ITEM_FIELDS:
        value = sql_item.get(sql_key)
        candidates[target_key] = _apply_field_conversion(value, converter)
    return candidates


def _compute_metadata_updates(
    candidates: dict[str, Any], mongo_item: dict[str, Any]
) -> dict[str, Any]:
    """
    Determine which metadata fields should be updated.

    - Numeric fields: update only if existing is None
    - Location field: always sync if changed
    - Other fields: update if existing is None or empty string
    """
    updates: dict[str, Any] = {}
    for field, new_value in candidates.items():
        if new_value is None:
            continue
        existing_value = mongo_item.get(field)

        # For numeric fields we treat only None as missing
        if isinstance(new_value, (int, float)):
            if existing_value is None:
                updates[field] = new_value
            continue

        # Location should always be synced from SQL if it changes
        if field == "location" and new_value != existing_value:
            updates[field] = new_value
            continue

        # For strings / other types update when missing or empty
        if existing_value in (None, ""):
            updates[field] = new_value

    return updates


from backend.services.sync.base import SyncServiceBase


class SQLSyncRealtimeMixin(SyncServiceBase):
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """


    async def sync_single_item_by_barcode(
        self, barcode: str
    ) -> Optional[dict[str, Any]]:
        """
        Sync a single item from SQL Server to MongoDB by barcode.
        Returns the updated item if found, None otherwise.
        """
        try:
            is_connected = await asyncio.wait_for(
                asyncio.to_thread(self.sql_connector.test_connection),
                timeout=3,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "SQL Server connection check timed out, skipping single item sync"
            )
            return None

        if not is_connected:
            logger.warning("SQL Server not connected, skipping single item sync")
            return None

        try:
            # Run synchronous SQL query in thread pool
            sql_item = await asyncio.to_thread(
                self.sql_connector.get_item_by_barcode, barcode
            )

            if not sql_item:
                return None

            # Use existing logic to update/create item
            stats = {
                "items_created": 0,
                "qty_updated": 0,
                "qty_changes_detected": 0,
                "items_checked": 0,
            }
            await self._sync_single_item(sql_item, stats)

            # Return the updated item from MongoDB
            item_code = sql_item.get("item_code")
            if item_code:
                return await self.mongo_db.erp_items.find_one({"item_code": item_code})
            return None

        except Exception as e:
            logger.error(f"Error syncing single item {barcode}: {e}")
            return None















    async def check_item_qty_realtime(self, item_code: str) -> dict[str, Any]:
        """
        Get quantity from SQL Server in real-time and update MongoDB cache.
        Falls back to MongoDB cache if SQL Server is unavailable.
        """
        # Try SQL Server first
        try:
            is_connected = await asyncio.to_thread(self.sql_connector.test_connection)
            if is_connected:
                sql_item = await asyncio.to_thread(
                    self.sql_connector.get_item_by_code, item_code
                )
                if sql_item:
                    sql_qty = _coerce_qty(sql_item.get("stock_qty"))

                    # Get current MongoDB record
                    mongo_item = await self.mongo_db.erp_items.find_one(
                        {"item_code": item_code}
                    )
                    mongo_qty = (
                        float(mongo_item.get("stock_qty", 0.0)) if mongo_item else 0.0
                    )

                    updated = False
                    if sql_qty != mongo_qty:
                        # Update MongoDB cache
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
                        await self.mongo_db.erp_items.update_one(
                            {"item_code": item_code},
                            {
                                "$set": {
                                    "stock_qty": sql_qty,
                                    "sql_server_qty": sql_qty,
                                    "last_synced": now,
                                    "qty_changed_at": now,
                                    "updated_at": now,
                                }
                            },
                            upsert=True,
                        )
                        updated = True

                    return {
                        "item_code": item_code,
                        "stock_qty": sql_qty,
                        "sql_qty": sql_qty,
                        "previous_qty": mongo_qty,
                        "delta": sql_qty - mongo_qty,
                        "updated": updated,
                        "source": "sql_server",
                        "timestamp": datetime.now(timezone.utc)
                        .replace(tzinfo=None)
                        .isoformat(),
                    }
        except Exception as e:
            logger.warning(f"Real-time SQL check failed for {item_code}: {e}")

        # Fallback to MongoDB cache
        mongo_item = await self.mongo_db.erp_items.find_one({"item_code": item_code})
        if mongo_item:
            return {
                "item_code": item_code,
                "stock_qty": mongo_item.get("stock_qty"),
                "sql_qty": mongo_item.get("stock_qty"),
                "updated": False,
                "source": "mongodb_cache",
                "message": "Using cached value (SQL Server unavailable)",
                "timestamp": datetime.now(timezone.utc)
                .replace(tzinfo=None)
                .isoformat(),
            }
        else:
            raise ValueError(f"Item {item_code} not found in SQL or Cache")










