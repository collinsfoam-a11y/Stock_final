"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.core.globals import websocket_manager
from backend.sql_server_connector import SQLServerConnector
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

ERP_REFRESH_MUTABLE_FIELDS = {
    "stock_qty",
    "sql_server_qty",
    "mrp",
    "sale_price",
    "last_purchase_price",
    "last_purchase_cost",
    "batch_no",
    "batch_id",
    "mfg_date",
    "expiry_date",
    "warehouse",
    "warehouse_id",
    "floor",
    "rack",
    "sql_last_checked_at",
    "last_synced",
    "qty_changed_at",
    "qty_change_delta",
    "sql_sync_status",
    "item_name",
    "uom_code",
    "uom_name",
    "category",
    "subcategory",
    "hsn_code",
    "gst_category",
    "gst_percent",
    "sgst_percent",
    "cgst_percent",
    "igst_percent",
    "brand_name",
    "location",
    "last_purchase_supplier",
    "purchase_type",
    "last_purchase_date",
    "last_purchase_qty",
}

ERP_REFRESH_FORBIDDEN_FIELDS = {
    "baseline_qty",
    "session_baseline",
    "verified_qty",
    "counted_qty",
    "variance",
    "verified",
    "verified_by",
    "verified_at",
    "session_id",
    "count_line_id",
    "approval_status",
}


class ERPProjectionPolicyError(Exception):
    pass


# ---------------------------------------------------------------------------
# Helpers for building item dicts - reduces cyclomatic complexity
# ---------------------------------------------------------------------------


def _normalize_date(value: Any) -> str | None:
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


def _numeric_or_none(value: Any) -> float | None:
    """Convert value to float, or None if not possible."""
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _coerce_qty(value: Any, default: float = 0.0) -> float:
    """Convert a SQL quantity to float, falling back for missing/invalid values."""
    numeric_value = _numeric_or_none(value)
    return numeric_value if numeric_value is not None else default


def _safe_optional_str(value: Any) -> str | None:
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


def _compute_erp_projection_hash(item: dict[str, Any]) -> str:
    """Compute a hash of the ERP projection fields for change detection."""
    import hashlib

    hash_fields = [
        "item_code",
        "item_name",
        "stock_qty",
        "mrp",
        "sale_price",
        "batch_id",
        "warehouse",
        "location",
        "floor",
        "rack",
        "uom",
        "uom_name",
        "category",
        "subcategory",
        "manufacturer",
        "expiry_date",
        "mfg_date",
        "batch_no",
        "last_purchase_price",
        "last_purchase_cost",
    ]
    hash_parts = []
    for field in hash_fields:
        value = item.get(field)
        if value is not None and value != "":
            hash_parts.append(f"{field}={value}")
    hash_str = "|".join(sorted(hash_parts))
    return hashlib.sha256(hash_str.encode()).hexdigest()[:16]


def _build_new_item_dict(sql_item: dict[str, Any], sql_qty: float, now: datetime) -> dict[str, Any]:
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

    # Compute ERP projection hash for change detection
    item["erp_projection_hash"] = _compute_erp_projection_hash(item)

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


class SQLSyncService:
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates ERP projection fields from SQL Server
    - Preserves ALL counting session data (baseline, variance, approvals)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered counting data
    - Broadcasts ERP projection changes to connected WebSocket clients
    """

    def __init__(
        self,
        sql_connector: SQLServerConnector,
        mongo_db: AsyncIOMotorDatabase,
        sync_interval: int = 900,  # 15 minutes default (was 1 hour)
        enabled: bool = True,
        nightly_sync_hour: int = 2,  # Run full sync at 2 AM
        qty_sync_interval: int = 60,  # Sync quantities every 60 seconds
        master_sync_interval: int = 1800,  # Sync master data every 30 minutes
    ):
        self.sql_connector = sql_connector
        self.mongo_db = mongo_db
        self.sync_interval = sync_interval
        self.enabled = enabled
        self.nightly_sync_hour = nightly_sync_hour
        self.qty_sync_interval = qty_sync_interval
        self.master_sync_interval = master_sync_interval
        self._running = False
        self._task: asyncio.Task[Any] | None = None
        self._last_sync: datetime | None = None
        self._last_new_item_check: datetime | None = None
        self._last_nightly_sync: datetime | None = None
        self._last_qty_sync: datetime | None = None
        self._last_master_sync: datetime | None = None
        self._new_item_check_interval: int = 1800  # Check for new items every 30 minutes
        self._sync_lock = asyncio.Lock()  # Prevent concurrent sync operations
        self._sync_stats: dict[str, Any] = {
            "total_syncs": 0,
            "successful_syncs": 0,
            "failed_syncs": 0,
            "last_sync": None,
            "last_nightly_sync": None,
            "last_qty_sync": None,
            "last_master_sync": None,
            "items_synced": 0,
            "qty_changes_detected": 0,
            "master_changes_detected": 0,
            "new_items_discovered": 0,
        }

    async def sync_single_item_by_barcode(self, barcode: str) -> dict[str, Any] | None:
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
            logger.warning("SQL Server connection check timed out, skipping single item sync")
            return None

        if not is_connected:
            logger.warning("SQL Server not connected, skipping single item sync")
            return None

        try:
            # Run synchronous SQL query in thread pool
            sql_item = await asyncio.to_thread(
                self.sql_connector.get_item_by_barcode_aggregate, barcode
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

    async def sync_single_item_by_code(self, item_code: str) -> dict[str, Any] | None:
        """
        Sync a single item from SQL Server to MongoDB by item code.
        Returns the updated item if found, None otherwise.
        """
        try:
            is_connected = await asyncio.wait_for(
                asyncio.to_thread(self.sql_connector.test_connection),
                timeout=3,
            )
        except asyncio.TimeoutError:
            logger.warning("SQL Server connection check timed out, skipping single item sync")
            return None

        if not is_connected:
            logger.warning("SQL Server not connected, skipping single item sync")
            return None

        try:
            # Run synchronous SQL query in thread pool
            sql_item = await asyncio.to_thread(
                self.sql_connector.get_item_by_code_aggregate, item_code
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
            updated_code = sql_item.get("item_code")
            if updated_code:
                return await self.mongo_db.erp_items.find_one({"item_code": updated_code})
            return None

        except Exception as e:
            logger.error(f"Error syncing single item {item_code}: {e}")
            return None

    async def sync_variance_only(self) -> dict[str, Any]:
        """
        Sync ONLY items with quantity variances from SQL Server to MongoDB.
        This is much more efficient than full sync as it:
        1. Gets item codes from MongoDB (fast local query)
        2. Fetches only quantities from SQL Server (minimal data transfer)
        3. Updates only items with actual differences

        Returns:
            Sync statistics
        """
        if not await asyncio.to_thread(self.sql_connector.test_connection):
            from backend.exceptions import SQLServerConnectionError

            raise SQLServerConnectionError("SQL Server connection not available")

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        stats: dict[str, Any] = {
            "items_checked": 0,
            "qty_updated": 0,
            "variances_found": 0,
            "qty_changes_detected": 0,  # Backwards-compatible alias
            "items_created": 0,
            "errors": 0,
            "duration": 0,
            "sql_queries": 0,
        }

        try:
            logger.info("Starting variance-only sync from SQL Server...")

            # Step 1: Get all item codes from MongoDB (fast local query)
            mongo_items_cursor = self.mongo_db.erp_items.find({}, {"item_code": 1, "stock_qty": 1})
            mongo_items = {}
            async for item in mongo_items_cursor:
                item_code = item.get("item_code")
                if item_code:
                    mongo_items[item_code] = float(item.get("stock_qty", 0.0))

            if not mongo_items:
                logger.info("No items in MongoDB to sync")
                stats["duration"] = (
                    datetime.now(timezone.utc).replace(tzinfo=None) - start_time
                ).total_seconds()
                return stats

            stats["items_checked"] = len(mongo_items)
            logger.info(f"Found {len(mongo_items)} items in MongoDB to check")

            # Step 2: Batch fetch quantities from SQL Server (minimal load)
            item_codes = list(mongo_items.keys())
            batch_size = 500  # SQL Server handles this well with IN clause

            for i in range(0, len(item_codes), batch_size):
                batch_codes = item_codes[i : i + batch_size]

                try:
                    # Fetch only quantities - minimal SQL load
                    sql_quantities = await self.sql_connector.get_item_quantities_only_async(
                        batch_codes, db=self.mongo_db
                    )
                    stats["sql_queries"] += 1

                    # Step 3: Compare and update only variances
                    for item_code, sql_qty in sql_quantities.items():
                        mongo_qty = mongo_items.get(item_code, 0.0)

                        # M9 fix: Use tolerance-based comparison for floats
                        if abs(sql_qty - mongo_qty) > 0.001:
                            # Variance found - update MongoDB
                            stats["variances_found"] += 1
                            stats["qty_changes_detected"] += 1  # Backwards-compatible
                            now = datetime.now(timezone.utc).replace(tzinfo=None)

                            await self.mongo_db.erp_items.update_one(
                                {"item_code": item_code},
                                {
                                    "$set": {
                                        "stock_qty": sql_qty,
                                        "sql_server_qty": sql_qty,
                                        "last_synced": now,
                                        "qty_changed_at": now,
                                        "qty_change_delta": sql_qty - mongo_qty,
                                        "updated_at": now,
                                    }
                                },
                            )
                            stats["qty_updated"] += 1

                            logger.debug(
                                f"Variance sync: {item_code}: {mongo_qty} → {sql_qty} "
                                f"(Δ {sql_qty - mongo_qty})"
                            )

                except Exception as e:
                    logger.error(f"Error syncing batch starting at index {i}: {e}")
                    stats["errors"] += 1

            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            self._finalize_sync_stats(stats)

            logger.info(
                f"Variance sync completed: {stats['items_checked']} items checked, "
                f"{stats['variances_found']} variances found, "
                f"{stats['qty_updated']} updated, "
                f"{stats['sql_queries']} SQL queries, "
                f"in {stats['duration']:.2f}s"
            )

            await self._update_sync_metadata(stats)
            return stats

        except Exception as e:
            logger.error(f"Variance sync failed: {e!s}")
            self._sync_stats["failed_syncs"] += 1
            stats["errors"] = 1
            raise

    async def _collect_mongo_item_codes(self) -> set[str]:
        mongo_item_codes_cursor = self.mongo_db.erp_items.find({}, {"item_code": 1})
        mongo_item_codes: set[str] = set()
        async for item in mongo_item_codes_cursor:
            item_code = item.get("item_code")
            if item_code:
                mongo_item_codes.add(item_code)
        return mongo_item_codes

    @staticmethod
    def _select_new_items(
        sql_items: list[dict[str, Any]], mongo_item_codes: set[str], limit: int
    ) -> list[dict[str, Any]]:
        new_items: list[dict[str, Any]] = []
        for sql_item in sql_items:
            item_code = sql_item.get("item_code")
            if not item_code or item_code in mongo_item_codes:
                continue
            new_items.append(sql_item)
            if len(new_items) >= limit:
                break
        return new_items

    async def _create_discovered_items(
        self, new_items: list[dict[str, Any]], stats: dict[str, Any], now: datetime
    ) -> None:
        for sql_item in new_items:
            item_code = sql_item.get("item_code")
            try:
                sql_qty = _coerce_qty(sql_item.get("stock_qty"))
                new_item = _build_new_item_dict(sql_item, sql_qty, now)
                await self.mongo_db.erp_items.insert_one(new_item)
                stats["items_discovered"] += 1
                logger.debug(f"Created new item: {item_code}")
            except Exception as exc:
                logger.error(f"Error creating item {item_code}: {exc}")
                stats["errors"] += 1

            # Sync batch-level data to erp_item_batches
            try:
                await self._sync_item_batches(item_code, sql_item.get("item_id"))
            except Exception as exc:
                logger.warning(f"Error syncing batches for new item {item_code}: {exc}")

    async def _sync_item_batches(self, item_code: str, item_id: Any = None) -> None:
        """Sync batch-level data from SQL Server to erp_item_batches collection."""
        try:
            batches = await asyncio.to_thread(
                self.sql_connector.get_item_batches, item_id or item_code, item_code
            )
            if not batches:
                return

            now = datetime.now(timezone.utc).replace(tzinfo=None)
            for batch in batches:
                batch["item_code"] = item_code
                batch["synced_at"] = now
                await self.mongo_db.erp_item_batches.update_one(
                    {"batch_id": batch.get("batch_id")},
                    {"$set": batch},
                    upsert=True,
                )
        except Exception as exc:
            logger.warning(f"Error syncing batches for {item_code}: {exc}")

    def _finish_discovery_stats(self, stats: dict[str, Any], start_time: datetime) -> None:
        stats["duration"] = (
            datetime.now(timezone.utc).replace(tzinfo=None) - start_time
        ).total_seconds()
        self._last_new_item_check = datetime.now(timezone.utc).replace(tzinfo=None)

    @staticmethod
    def _finish_discovery_stats(self, stats: dict[str, Any], start_time: datetime) -> None:
        stats["duration"] = (
            datetime.now(timezone.utc).replace(tzinfo=None) - start_time
        ).total_seconds()
        self._last_new_item_check = datetime.now(timezone.utc).replace(tzinfo=None)

    async def discover_new_items(self, limit: int = 100) -> dict[str, Any]:
        """
        Discover and create NEW items from SQL Server that don't exist in MongoDB.
        This runs less frequently than variance sync to minimize SQL load.

        Args:
            limit: Maximum number of new items to create per run (default 100)

        Returns:
            Discovery statistics
        """
        if not await asyncio.to_thread(self.sql_connector.test_connection):
            logger.warning("SQL Server not connected, skipping new item discovery")
            return {"items_discovered": 0, "error": "SQL Server not connected"}

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        stats: dict[str, Any] = {
            "items_discovered": 0,
            "items_checked": 0,
            "errors": 0,
            "duration": 0,
        }

        try:
            logger.info("Starting new item discovery from SQL Server...")

            # Step 1: Get all item codes from MongoDB
            mongo_item_codes = await self._collect_mongo_item_codes()

            logger.debug(f"Found {len(mongo_item_codes)} existing item codes in MongoDB")

            # Step 2: Fetch all items from SQL Server (this is the heavy query)
            # Only run this periodically
            sql_items = await asyncio.to_thread(self.sql_connector.get_all_items_aggregate)
            stats["items_checked"] = len(sql_items)

            # Step 3: Find items that exist in SQL but not in MongoDB
            new_items = self._select_new_items(sql_items, mongo_item_codes, limit)

            if not new_items:
                logger.info("No new items found in SQL Server")
                self._finish_discovery_stats(stats, start_time)
                return stats

            logger.info(f"Found {len(new_items)} new items to create")

            # Step 4: Create new items in MongoDB
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            await self._create_discovered_items(new_items, stats, now)
            self._finish_discovery_stats(stats, start_time)
            self._sync_stats["new_items_discovered"] += stats["items_discovered"]

            logger.info(
                f"New item discovery completed: {stats['items_discovered']} items created "
                f"in {stats['duration']:.2f}s"
            )

            return stats

        except Exception as e:
            logger.error(f"New item discovery failed: {e!s}")
            stats["errors"] = 1
            return stats

    def should_check_new_items(self) -> bool:
        """Check if it's time to discover new items (every 30 minutes)."""
        if self._last_new_item_check is None:
            return True
        elapsed = (
            datetime.now(timezone.utc).replace(tzinfo=None) - self._last_new_item_check
        ).total_seconds()
        return elapsed >= self._new_item_check_interval

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
        if not await asyncio.to_thread(self.sql_connector.test_connection):
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
            sql_items = await asyncio.to_thread(self.sql_connector.get_all_items_aggregate)
            logger.info(f"Retrieved {len(sql_items)} items from SQL Server for verification")

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
                        await self._sync_single_item(sql_item, stats, mongo_items_cache=mongo_items)
                    except Exception as e:
                        logger.error(f"Error syncing item {sql_item.get('item_code')}: {e}")
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
            logger.error(f"Nightly sync failed: {e!s}")
            stats["errors"] = 1
            return stats

    async def sync_quantities_only(self) -> dict[str, Any]:
        """
        Sync ONLY quantity changes from SQL Server to MongoDB
        Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)

        Returns:
            Sync statistics
        """
        if not await asyncio.to_thread(self.sql_connector.test_connection):
            from backend.exceptions import SQLServerConnectionError

            raise SQLServerConnectionError("SQL Server connection not available")

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        stats: dict[str, Any] = {
            "items_checked": 0,
            "qty_updated": 0,
            "items_created": 0,
            "qty_changes_detected": 0,
            "errors": 0,
            "duration": 0,
        }

        try:
            # H13 fix: Run synchronous SQL call in thread pool to avoid blocking the event loop
            logger.info("Starting SQL Server quantity sync...")
            sql_items = await asyncio.to_thread(self.sql_connector.get_all_items_aggregate)

            # Pre-fetch MongoDB items to cache (Avoids N+1 queries)
            mongo_items_cursor = self.mongo_db.erp_items.find({})
            mongo_items = {}
            async for item in mongo_items_cursor:
                item_code = item.get("item_code")
                if item_code:
                    mongo_items[item_code] = item

            # Batch process items
            batch_size = 100
            for i in range(0, len(sql_items), batch_size):
                batch = sql_items[i : i + batch_size]

                for sql_item in batch:
                    try:
                        await self._sync_single_item(sql_item, stats, mongo_items_cache=mongo_items)
                    except Exception as e:
                        logger.error(f"Error syncing item {sql_item.get('item_code')}: {e!s}")
                        stats["errors"] += 1

            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            self._finalize_sync_stats(stats)

            logger.info(
                f"SQL qty sync completed: {stats['items_checked']} items checked, "
                f"{stats['qty_changes_detected']} qty changes detected, "
                f"{stats['items_created']} new items, "
                f"in {stats['duration']:.2f}s"
            )

            await self._update_sync_metadata(stats)
            return stats

        except Exception as e:
            logger.error(f"SQL qty sync failed: {e!s}")
            self._sync_stats["failed_syncs"] += 1
            stats["errors"] = 1
            raise

    async def _sync_single_item(
        self,
        sql_item: dict[str, Any],
        stats: dict[str, Any],
        mongo_items_cache: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        """Process a single item from SQL Server for sync."""
        sql_qty = _coerce_qty(sql_item.get("stock_qty"))
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Get current MongoDB record
        item_code = sql_item.get("item_code", "")
        if mongo_items_cache is not None:
            mongo_item = mongo_items_cache.get(item_code)
        else:
            mongo_item = await self.mongo_db.erp_items.find_one({"item_code": item_code})

        if not mongo_item:
            # New item - create with basic data
            new_item = _build_new_item_dict(sql_item, sql_qty, now)
            await self.mongo_db.erp_items.insert_one(new_item)
            stats["items_created"] += 1
            logger.debug(f"Created new item: {item_code}")

            # Broadcast ERP projection change for new item
            await self._broadcast_erp_change(
                item_code=item_code,
                changed_fields=set(new_item.keys()),
                update_fields=new_item,
            )
        else:
            # Existing item - update ONLY quantity if changed
            await self._update_existing_item(item_code, sql_item, sql_qty, mongo_item, stats)

        # Sync batch-level data to erp_item_batches (fire-and-forget)
        try:
            await self._sync_item_batches(item_code, sql_item.get("item_id"))
        except Exception as exc:
            logger.debug(f"Batch sync skipped for {item_code}: {exc}")

        stats["items_checked"] += 1

    async def _update_existing_item(
        self,
        item_code: str,
        sql_item: dict[str, Any],
        sql_qty: float,
        mongo_item: dict[str, Any],
        stats: dict[str, Any],
    ) -> None:
        """Update an existing MongoDB item with SQL data."""
        mongo_qty = float(mongo_item.get("stock_qty", 0.0))
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Prepare backfill for optional metadata
        metadata_candidates = _build_metadata_candidates(sql_item)
        metadata_updates = _compute_metadata_updates(metadata_candidates, mongo_item)

        update_fields: dict[str, Any] = {
            "last_synced": now,
            "updated_at": now,
            "sql_sync_status": "MATCH",
            "sql_last_checked_at": now,
            # "last_verified_at": now, # Removed to distinguish Sync from Verification
        }

        # M9 fix: Use tolerance-based comparison for floats
        if abs(sql_qty - mongo_qty) > 0.001:
            update_fields.update(
                {
                    "stock_qty": sql_qty,
                    "sql_server_qty": sql_qty,
                    # GOVERNANCE FIX: Do NOT update sql_verified_qty blindly (Rule 2)
                    # "sql_verified_qty": sql_qty,  <-- REMOVED
                    "sql_sync_status": "MISMATCH",
                    "sql_last_checked_at": now,
                    "qty_changed_at": now,
                    "qty_change_delta": sql_qty - mongo_qty,
                }
            )
            stats["qty_changes_detected"] += 1
            stats["qty_updated"] += 1

            logger.info(
                f"Qty updated for item_code {item_code}: {mongo_qty} → {sql_qty} (Δ {sql_qty - mongo_qty})"
            )

        if metadata_updates:
            update_fields.update(metadata_updates)

        # GOVERNANCE CHECK
        forbidden_present = (
            set(update_fields.keys()) | set(sql_item.keys())
        ) & ERP_REFRESH_FORBIDDEN_FIELDS
        if forbidden_present:
            raise ERPProjectionPolicyError(
                f"Attempted to update forbidden counting fields: {forbidden_present}"
            )

        unexpected = set(update_fields.keys()) - ERP_REFRESH_MUTABLE_FIELDS
        if "updated_at" in unexpected:
            unexpected.remove("updated_at")

        if unexpected:
            raise ERPProjectionPolicyError(
                f"Attempted to update forbidden or unexpected fields: {unexpected}"
            )

        # Compute new ERP projection hash
        new_hash = _compute_erp_projection_hash(
            {**mongo_item, **update_fields, "item_code": item_code}
        )
        old_hash = mongo_item.get("erp_projection_hash")

        # Always set the hash (handles items created before this field existed)
        if old_hash is None:
            old_hash = ""

        await self.mongo_db.erp_items.update_one(
            {"item_code": item_code},
            {"$set": {**update_fields, "erp_projection_hash": new_hash}},
        )

        # Broadcast ERP projection change to connected WebSocket clients
        # Only broadcast if the hash changed (actual data changed)
        if update_fields and old_hash != new_hash:
            changed_fields = set(update_fields.keys()) - {
                "last_synced",
                "updated_at",
                "sql_last_checked_at",
            }
            if changed_fields:
                await self._broadcast_erp_change(
                    item_code=item_code,
                    changed_fields=changed_fields,
                    update_fields=update_fields,
                )

    async def _broadcast_erp_change(
        self,
        item_code: str,
        changed_fields: set[str],
        update_fields: dict[str, Any],
    ) -> None:
        """Broadcast an ERP projection change to all connected WebSocket clients."""
        if websocket_manager is None:
            return

        try:
            message = {
                "type": "erp_projection_update",
                "item_code": item_code,
                "changed_fields": sorted(changed_fields),
                "updated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            }
            await websocket_manager.broadcast_all(message)
            logger.debug(
                "Broadcast ERP projection update for %s: fields=%s",
                item_code,
                sorted(changed_fields),
            )
        except Exception as e:
            logger.warning(
                "Failed to broadcast ERP projection update for %s: %s",
                item_code,
                sanitize_for_logging(str(e)),
            )

    def _finalize_sync_stats(self, stats: dict[str, Any]) -> None:
        """Update backwards-compatible stats and internal tracking."""
        # Backwards-compatible stats keys for older callers/tests
        if "items_updated" not in stats:
            stats["items_updated"] = stats.get("qty_updated", 0)

        if "items_unchanged" not in stats:
            checked = stats.get("items_checked", 0)
            updated = stats.get("qty_updated", 0)
            created = stats.get("items_created", 0)
            stats["items_unchanged"] = max(0, checked - updated - created)

        self._last_sync = datetime.now(timezone.utc).replace(tzinfo=None)
        self._sync_stats["successful_syncs"] += 1
        # L5+MM11 fix: Track both cumulative totals and last-run values
        self._sync_stats["items_synced"] += stats["items_checked"]
        self._sync_stats["qty_changes_detected"] += stats["qty_changes_detected"]
        self._sync_stats["last_run_items_synced"] = stats["items_checked"]
        self._sync_stats["last_run_qty_changes"] = stats["qty_changes_detected"]
        self._sync_stats["last_sync"] = self._last_sync.isoformat()

    async def _update_sync_metadata(self, stats: dict[str, Any]) -> None:
        """Update sync metadata collection (best-effort)."""
        sync_metadata_collection = getattr(self.mongo_db, "sync_metadata", None)
        if sync_metadata_collection is not None:
            try:
                await sync_metadata_collection.update_one(
                    {"_id": "sql_qty_sync"},
                    {
                        "$set": {
                            "last_sync": self._last_sync,
                            "stats": stats,
                            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        },
                        "$inc": {"total_syncs": 1},
                    },
                    upsert=True,
                )
            except Exception:
                logger.warning(
                    "Failed to update sync_metadata collection during qty sync",
                    exc_info=True,
                )
        else:
            logger.debug(
                "MongoDB sync_metadata collection not configured; skipping metadata update",
            )

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
                    self.sql_connector.get_item_by_code_aggregate, item_code
                )
                if sql_item:
                    sql_qty = _coerce_qty(sql_item.get("stock_qty"))

                    # Get current MongoDB record
                    mongo_item = await self.mongo_db.erp_items.find_one({"item_code": item_code})
                    mongo_qty = float(mongo_item.get("stock_qty", 0.0)) if mongo_item else 0.0

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
                        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
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
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
            }
        else:
            raise ValueError(f"Item {item_code} not found in SQL or Cache")

    async def _sync_loop(self):
        """
        Background sync loop with configurable intervals:
        1. Quantity sync (every qty_sync_interval seconds) - minimal SQL load
        2. Master data sync (every master_sync_interval seconds) - full item data
        3. New item discovery (every 30 min) - finds new items
        4. Nightly full sync (at nightly_sync_hour) - complete data verification

        Uses async lock to prevent concurrent sync operations.
        """
        while self._running and self.enabled:
            # Use lock to ensure only one sync operation at a time
            async with self._sync_lock:
                try:
                    # Check connection before attempting sync
                    if not await asyncio.to_thread(self.sql_connector.test_connection):
                        logger.warning(
                            "SQL Server connection not available, skipping sync. "
                            "Will retry in next interval."
                        )
                        self._sync_stats["failed_syncs"] += 1
                    else:
                        now = datetime.now(timezone.utc).replace(tzinfo=None)

                        # Check if it's time for nightly full sync
                        if self.should_run_nightly_sync():
                            logger.info("🌙 Running nightly full data verification...")
                            await self.nightly_full_sync()
                            self._sync_stats["total_syncs"] += 1
                            self._last_nightly_sync = now
                        else:
                            # Quantity sync (most frequent - minimal SQL load)
                            await self.sync_variance_only()
                            self._sync_stats["total_syncs"] += 1
                            self._last_qty_sync = now

                            # Master data sync (less frequent - full item data)
                            if self.should_check_new_items():
                                logger.info("🔍 Running new item discovery (every 30 min)...")
                                await self.discover_new_items(limit=200)
                                self._last_master_sync = now

                except Exception as e:
                    logger.error(f"Sync loop error: {e!s}")
                    self._sync_stats["failed_syncs"] += 1

            # Wait for next sync interval (use the shortest interval)
            await asyncio.sleep(self.qty_sync_interval)

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
            self._run_sync_loop() if hasattr(self, "_run_sync_loop") else self._sync_loop()
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

    async def sync_now(self) -> dict[str, Any]:
        """Trigger immediate variance-only sync"""
        return await self.sync_variance_only()

    async def sync_items(self) -> dict[str, Any]:
        """Alias for sync_variance_only - backward compatibility"""
        return await self.sync_variance_only()

    async def sync_all_items(self) -> dict[str, Any]:
        """Alias for sync_variance_only - backward compatibility for tests"""
        return await self.sync_variance_only()

    def get_stats(self) -> dict[str, Any]:
        """Get sync statistics"""
        return {
            **self._sync_stats,
            "running": self._running,
            "enabled": self.enabled,
            "sync_interval": self.sync_interval,
            "sync_interval_minutes": round(self.sync_interval / 60, 1),
            "qty_sync_interval": self.qty_sync_interval,
            "qty_sync_interval_minutes": round(self.qty_sync_interval / 60, 1),
            "master_sync_interval": self.master_sync_interval,
            "master_sync_interval_minutes": round(self.master_sync_interval / 60, 1),
            "next_sync": (
                (self._last_sync + timedelta(seconds=self.sync_interval)).isoformat()
                if self._last_sync
                else None
            ),
        }

    def set_interval(self, interval: int):
        """Update sync interval (backward-compatible, sets qty_sync_interval)"""
        self.sync_interval = interval
        self.qty_sync_interval = interval
        logger.info(f"Sync interval updated to {interval}s ({interval / 60:.1f} min)")

    def set_intervals(
        self,
        qty_sync_interval: int | None = None,
        master_sync_interval: int | None = None,
    ):
        """Update sync intervals for different sync modes."""
        if qty_sync_interval is not None:
            self.qty_sync_interval = qty_sync_interval
            logger.info(
                "Qty sync interval updated to %ss (%s min)",
                qty_sync_interval,
                qty_sync_interval / 60,
            )
        if master_sync_interval is not None:
            self.master_sync_interval = master_sync_interval
            logger.info(
                "Master sync interval updated to %ss (%s min)",
                master_sync_interval,
                master_sync_interval / 60,
            )

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
