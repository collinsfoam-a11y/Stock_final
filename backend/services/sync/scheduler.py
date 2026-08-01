from typing import Optional

"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging
from datetime import date, datetime
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


class SQLSyncSchedulerMixin:
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """


















    async def _sync_loop(self):
        """
        Background sync loop with three sync modes:
        1. Variance-only sync (every 15 min) - minimal SQL load
        2. New item discovery (every 30 min) - finds new items
        3. Nightly full sync (at 2 AM) - complete data verification

        Uses async lock to prevent concurrent sync operations.
        """
        while self._running and self.enabled:
            # Use lock to ensure only one sync operation at a time
            async with self._sync_lock:
                try:
                    # Check connection before attempting sync
                    if not self.sql_connector.test_connection():
                        logger.warning(
                            "SQL Server connection not available, skipping sync. "
                            "Will retry in next interval."
                        )
                        self._sync_stats["failed_syncs"] += 1
                    else:
                        # Check if it's time for nightly full sync (2 AM)
                        if self.should_run_nightly_sync():
                            logger.info("🌙 Running nightly full data verification...")
                            await self.nightly_full_sync()
                            self._sync_stats["total_syncs"] += 1
                        else:
                            # Regular variance-only sync (minimal SQL load)
                            await self.sync_variance_only()
                            self._sync_stats["total_syncs"] += 1

                            # Check for new items every 30 minutes
                            # This runs AFTER variance sync completes (sequential)
                            if self.should_check_new_items():
                                logger.info(
                                    "🔍 Running new item discovery (every 30 min)..."
                                )
                                await self.discover_new_items(limit=200)

                except Exception as e:
                    logger.error(f"Sync loop error: {str(e)}")
                    self._sync_stats["failed_syncs"] += 1

            # Wait for next sync interval
            await asyncio.sleep(self.sync_interval)

    async def start(self):
        """Start background sync"""
        if self._running:
            logger.warning("SQL sync service already running")
            return

        if not self.enabled:
            logger.info("SQL sync service is disabled")
            return

        # Check if SQL Server connection is available (don't fail if not)
        is_connected = False
        try:
            # Test connection asynchronously to avoid blocking lifespan
            is_connected = await asyncio.wait_for(
                asyncio.to_thread(self.sql_connector.test_connection),
                timeout=3,
            )
        except Exception:
            is_connected = False

        if not is_connected:
            logger.warning(
                "SQL sync service started but SQL Server connection not available. "
                "Sync will retry periodically."
            )
        else:
            logger.info(
                f"SQL sync service started "
                f"(interval: {self.sync_interval}s = {self.sync_interval / 60:.1f} min)"
            )

        self._running = True
        self._task = asyncio.create_task(
            self._run_sync_loop()
            if hasattr(self, "_run_sync_loop")
            else self._sync_loop()
        )

    async def stop(self):
        """Stop background sync"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("SQL sync service stopped")





    def set_interval(self, interval: int):
        """Update sync interval"""
        self.sync_interval = interval
        logger.info(f"Sync interval updated to {interval}s ({interval / 60:.1f} min)")

    async def enable(self):
        """Enable sync service"""
        self.enabled = True
        if not self._running:
            await self.start()
        logger.info("SQL sync service enabled")

    def disable(self):
        """Disable sync service"""
        self.enabled = False
        logger.info("SQL sync service disabled")
