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


class SQLSyncNightlyMixin:
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """










    def should_run_nightly_sync(self) -> bool:
        """
        Check if it's time for nightly full sync.
        Runs once per day at the configured hour (default 2 AM).
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Check if we're in the nightly sync hour
        if now.hour != self.nightly_sync_hour:
            return False

        # Check if we already ran today
        if self._last_nightly_sync is not None:
            last_sync_date = self._last_nightly_sync.date()
            if last_sync_date == now.date():
                return False  # Already ran today

        return True

    async def nightly_full_sync(self) -> dict[str, Any]:
        """
        Full data verification sync - runs every night.
        Fetches ALL items from SQL Server and ensures MongoDB is in sync.
        This is heavier than variance sync but ensures data integrity.

        Returns:
            Sync statistics
        """
        if not self.sql_connector.test_connection():
            logger.warning("SQL Server not connected, skipping nightly sync")
            return {"error": "SQL Server not connected", "items_synced": 0}

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        stats: dict[str, Any] = {
            "items_checked": 0,
            "qty_updated": 0,
            "items_created": 0,
            "variances_found": 0,
            "qty_changes_detected": 0,  # Required by _update_existing_item
            "errors": 0,
            "duration": 0,
        }

        try:
            logger.info("🌙 Starting nightly full data verification sync...")

            # Fetch ALL items from SQL Server
            sql_items = await asyncio.to_thread(self.sql_connector.get_all_items)
            # stats["items_checked"] = len(sql_items) -- Removed to avoid double counting, incremented in _sync_single_item
            logger.info(
                f"Retrieved {len(sql_items)} items from SQL Server for verification"
            )

            # Get all MongoDB items to cache
            mongo_items_cursor = self.mongo_db.erp_items.find({})
            mongo_items = {}
            async for item in mongo_items_cursor:
                item_code = item.get("item_code")
                if item_code:
                    mongo_items[item_code] = item

            # Process each SQL item
            batch_size = 100
            for i in range(0, len(sql_items), batch_size):
                batch = sql_items[i : i + batch_size]

                for sql_item in batch:
                    try:
                        await self._sync_single_item(
                            sql_item, stats, mongo_items_cache=mongo_items
                        )
                    except Exception as e:
                        logger.error(
                            f"Error syncing item {sql_item.get('item_code')}: {e}"
                        )
                        stats["errors"] += 1

            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            self._last_nightly_sync = datetime.now(timezone.utc).replace(tzinfo=None)
            self._sync_stats["last_nightly_sync"] = self._last_nightly_sync.isoformat()

            logger.info(
                f"🌙 Nightly sync completed: {stats['items_checked']} items verified, "
                f"{stats['qty_updated']} updated, {stats['items_created']} created, "
                f"in {stats['duration']:.2f}s"
            )

            # Update sync metadata
            await self._update_sync_metadata(stats)
            return stats

        except Exception as e:
            logger.error(f"Nightly sync failed: {str(e)}")
            stats["errors"] = 1
            return stats
















