"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import contextlib
import logging
import os
import socket
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from backend.sql_server_connector import SQLServerConnector
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

# Identifies which process produced a sync audit event. Two backend replicas
# syncing the same mirror are otherwise indistinguishable in sync_audit.
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"


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
    ("item_name", "item_name", "raw"),
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

        # ERP owns identity/display fields and location; propagate actual changes.
        if field in {"item_name", "barcode", "location"} and new_value != existing_value:
            updates[field] = new_value
            continue

        # For strings / other types update when missing or empty
        if existing_value in (None, ""):
            updates[field] = new_value

    return updates


from backend.services.sync.base import SyncServiceBase


class SQLSyncCoreSyncMixin(SyncServiceBase):
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """

    def __init__(
        self,
        sql_connector: SQLServerConnector,
        mongo_db: AsyncIOMotorDatabase,
        sync_interval: int = 900,  # 15 minutes default (was 1 hour)
        enabled: bool = True,
        nightly_sync_hour: int = 2,  # Run full sync at 2 AM
    ):
        self.sql_connector = sql_connector
        self.mongo_db = mongo_db
        self.sync_interval = sync_interval
        self.enabled = enabled
        self.nightly_sync_hour = nightly_sync_hour
        self._running = False
        self._task: asyncio.Task[Any] | None = None
        self._last_sync: datetime | None = None
        self._last_new_item_check: datetime | None = None
        self._last_nightly_sync: datetime | None = None
        self._new_item_check_interval: int = 1800  # Check for new items every 30 minutes
        self._sync_lock = asyncio.Lock()  # Prevent concurrent sync operations
        self._sync_stats: dict[str, Any] = {
            "total_syncs": 0,
            "successful_syncs": 0,
            "failed_syncs": 0,
            "last_sync": None,
            "last_nightly_sync": None,
            "items_synced": 0,
            "qty_changes_detected": 0,
            "new_items_discovered": 0,
        }

    @staticmethod
    def _consolidate_sql_items(
        sql_items: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], int]:
        """Collapse batch-level ERP rows to one deterministic item row.

        ``get_all_items`` returns one row per product batch while ``erp_items`` is
        keyed by ``item_code``. Summing here prevents last-row-wins quantity loss.
        The lowest stable batch/barcode identity supplies representative metadata.
        """
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in sql_items:
            item_code = str(row.get("item_code") or "").strip()
            if not item_code:
                continue
            grouped.setdefault(item_code, []).append(row)

        consolidated: list[dict[str, Any]] = []
        duplicate_rows = 0
        for item_code in sorted(grouped):
            rows = sorted(
                grouped[item_code],
                key=lambda row: (
                    str(row.get("batch_id") or ""),
                    str(row.get("barcode") or ""),
                    str(row.get("item_id") or ""),
                ),
            )
            duplicate_rows += max(0, len(rows) - 1)
            item = dict(rows[0])
            item["item_code"] = item_code
            item["stock_qty"] = sum(_coerce_qty(row.get("stock_qty")) for row in rows)
            item["source_row_count"] = len(rows)
            consolidated.append(item)

        return consolidated, duplicate_rows

    async def _emit_sync_audit_event(
        self,
        *,
        event_type: str,
        sync_run_id: str,
        sync_mode: str,
        counts: dict[str, Any] | None = None,
        duration_seconds: float | None = None,
        batch: dict[str, Any] | None = None,
        error: str | None = None,
        correlation_id: str | None = None,
        detail: dict[str, Any] | None = None,
    ) -> bool:
        """Append a structured, best-effort audit event for an item sync run."""
        collection = getattr(self.mongo_db, "sync_audit", None)
        if collection is None:
            logger.debug("MongoDB sync_audit collection not configured; skipping audit event")
            return False

        event = {
            "event_type": event_type,
            "sync_run_id": sync_run_id,
            # Correlates a sync run with the request or schedule that caused it.
            # Defaults to the run id so the field is never absent.
            "correlation_id": correlation_id or sync_run_id,
            "worker": WORKER_ID,
            "sync_mode": sync_mode,
            "occurred_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "counts": dict(counts or {}),
        }
        if duration_seconds is not None:
            event["duration_seconds"] = duration_seconds
        if batch is not None:
            event["batch"] = dict(batch)
        if error is not None:
            event["error"] = error
        if detail is not None:
            event["detail"] = dict(detail)

        try:
            await collection.insert_one(event)
        except Exception:
            logger.warning("Failed to append item sync audit event", exc_info=True)
            return False
        return True

    @staticmethod
    def _detect_sync_conflicts(
        source_rows: list[dict[str, Any]],
        consolidated: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Identify ERP rows that cannot be mirrored unambiguously.

        Detected here rather than downstream because consolidation is the only
        point that sees the whole source set. Nothing is dropped or repaired -
        the conflict is recorded so an operator can fix it in the ERP.
        """
        conflicts: list[dict[str, Any]] = []

        # Rows _consolidate_sql_items silently discards.
        blank_code = [r for r in source_rows if not str(r.get("item_code") or "").strip()]
        if blank_code:
            conflicts.append(
                {
                    "conflict_type": "BLANK_ITEM_CODE",
                    "severity": "ERROR",
                    "row_count": len(blank_code),
                    "sample_barcodes": [str(r.get("barcode")) for r in blank_code[:5]],
                    "resolution": "row dropped; item cannot be keyed in the mirror",
                }
            )

        # One barcode resolving to more than one item makes scanner lookup
        # order-dependent.
        by_barcode: dict[str, set[str]] = defaultdict(set)
        for item in consolidated:
            barcode = str(item.get("barcode") or "").strip()
            code = str(item.get("item_code") or "").strip()
            if barcode and code:
                by_barcode[barcode].add(code)
        for barcode, codes in sorted(by_barcode.items()):
            if len(codes) > 1:
                conflicts.append(
                    {
                        "conflict_type": "DUPLICATE_BARCODE",
                        "severity": "ERROR",
                        "barcode": barcode,
                        "item_codes": sorted(codes),
                        "resolution": "both items mirrored; scanner resolution is "
                        "order-dependent until the ERP is corrected",
                    }
                )

        # An item_code appearing twice after consolidation would mean the
        # grouping key failed - a mirror-identity break.
        seen: dict[str, int] = defaultdict(int)
        for item in consolidated:
            seen[str(item.get("item_code") or "").strip()] += 1
        for code, n in sorted(seen.items()):
            if n > 1:
                conflicts.append(
                    {
                        "conflict_type": "DUPLICATE_ITEM_CODE",
                        "severity": "CRITICAL",
                        "item_code": code,
                        "occurrences": n,
                        "resolution": "consolidation invariant violated",
                    }
                )

        return conflicts

    async def _record_sync_conflicts(
        self,
        conflicts: list[dict[str, Any]],
        *,
        sync_run_id: str,
        sync_mode: str,
        stats: dict[str, Any],
    ) -> None:
        """Persist conflicts and emit one CONFLICT audit event per finding."""
        stats["conflicts_detected"] = len(conflicts)
        if not conflicts:
            return

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        collection = getattr(self.mongo_db, "sync_conflicts", None)
        for conflict in conflicts:
            record = {
                **conflict,
                "sync_run_id": sync_run_id,
                "sync_mode": sync_mode,
                "worker": WORKER_ID,
                "detected_at": now,
                "source": "erp_item_sync",
            }
            if collection is not None:
                try:
                    await collection.insert_one(record)
                except Exception:
                    logger.warning("Failed to persist sync conflict record", exc_info=True)
            await self._emit_sync_audit_event(
                event_type="CONFLICT",
                sync_run_id=sync_run_id,
                sync_mode=sync_mode,
                counts={"conflicts": 1},
                detail=conflict,
            )
            logger.warning(
                "ERP item sync conflict [%s]: %s",
                conflict.get("conflict_type"),
                {k: v for k, v in conflict.items() if k != "conflict_type"},
            )

    @contextlib.asynccontextmanager
    async def _sync_run_lock(self, mode: str, sync_run_id: str, ttl_seconds: int = 300):
        """Cross-process guard so only one run of ``mode`` touches the mirror.

        ``_sync_lock`` is an asyncio.Lock and only guards the scheduler loop
        inside one process. The admin endpoints, AutoSyncManager and
        enhanced_item_api each hold their own SQLSyncService, and two backend
        replicas share neither, so without this two full syncs can interleave on
        erp_items. Backed by the same ``locks`` collection as LockService: a
        unique _id makes acquisition atomic, and a TTL index reaps the lock if
        the worker dies. The lease is renewed while the run is in flight so a
        long nightly sync cannot expire mid-run.

        Yields True when the lock is held, False when another worker holds it.
        """
        collection = getattr(self.mongo_db, "locks", None)
        if collection is None:
            # No lock store configured - proceed rather than block the sync.
            yield True
            return

        # One key for every bulk mode, not one per mode: variance, full, nightly
        # and discovery all write erp_items, so two different modes interleaving
        # is the same hazard as two of the same. The per-scan realtime path is
        # deliberately NOT locked - blocking a scan behind a nightly sync would
        # be worse than the single-item write it protects against.
        key = "erp_item_sync:bulk"
        owner = f"{WORKER_ID}:{sync_run_id}"
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        try:
            await collection.insert_one(
                {
                    "_id": key,
                    "owner": owner,
                    "created_at": now,
                    "expires_at": now + timedelta(seconds=ttl_seconds),
                }
            )
        except Exception as exc:
            # DuplicateKeyError means someone holds it. Reap it only if the
            # lease has genuinely lapsed; the delete is guarded on the exact
            # expires_at we observed so we cannot race another reaper.
            existing = None
            with contextlib.suppress(Exception):
                existing = await collection.find_one({"_id": key})
            if existing and existing.get("expires_at") and existing["expires_at"] < now:
                with contextlib.suppress(Exception):
                    await collection.delete_one({"_id": key, "expires_at": existing["expires_at"]})
                logger.warning("Reaped expired %s lock held by %s", key, existing.get("owner"))
            logger.info(
                "Skipping %s sync: lock %s held by %s (%s)",
                mode,
                key,
                (existing or {}).get("owner", "unknown"),
                type(exc).__name__,
            )
            yield False
            return

        async def _renew() -> None:
            while True:
                await asyncio.sleep(max(1, ttl_seconds // 3))
                with contextlib.suppress(Exception):
                    await collection.update_one(
                        {"_id": key, "owner": owner},
                        {
                            "$set": {
                                "expires_at": datetime.now(timezone.utc).replace(tzinfo=None)
                                + timedelta(seconds=ttl_seconds)
                            }
                        },
                    )

        renewer = asyncio.create_task(_renew())
        try:
            yield True
        finally:
            renewer.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await renewer
            with contextlib.suppress(Exception):
                await collection.delete_one({"_id": key, "owner": owner})

    @staticmethod
    def _skipped_stats(reason: str) -> dict[str, Any]:
        """Uniform result for a run that never started."""
        return {
            "items_checked": 0,
            "qty_updated": 0,
            "items_created": 0,
            "variances_found": 0,
            "qty_changes_detected": 0,
            "errors": 0,
            "duration": 0,
            "skipped": True,
            "skip_reason": reason,
        }

    async def sync_variance_only(self) -> dict[str, Any]:
        """Variance sync, guarded by the cross-process bulk-sync lock."""
        async with self._sync_run_lock("variance", str(uuid4())) as acquired:
            if not acquired:
                return self._skipped_stats("another worker holds the bulk sync lock")
            return await self._sync_variance_only_unlocked()

    async def _sync_variance_only_unlocked(self) -> dict[str, Any]:
        """
        Sync ONLY items with quantity variances from SQL Server to MongoDB.
        This is much more efficient than full sync as it:
        1. Gets item codes from MongoDB (fast local query)
        2. Fetches only quantities from SQL Server (minimal data transfer)
        3. Updates only items with actual differences

        Returns:
            Sync statistics
        """
        if not self.sql_connector.test_connection():
            from backend.exceptions import SQLServerConnectionError

            raise SQLServerConnectionError("SQL Server connection not available")

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        sync_run_id = str(uuid4())
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
            await self._emit_sync_audit_event(
                event_type="RUN_STARTED",
                sync_run_id=sync_run_id,
                sync_mode="variance",
                counts=stats,
            )

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
                self._finalize_sync_stats(stats)
                await self._update_sync_metadata(stats)
                await self._emit_sync_audit_event(
                    event_type="RUN_COMPLETED",
                    sync_run_id=sync_run_id,
                    sync_mode="variance",
                    counts=stats,
                    duration_seconds=stats["duration"],
                )
                return stats

            stats["items_checked"] = len(mongo_items)
            logger.info(f"Found {len(mongo_items)} items in MongoDB to check")

            # Step 2: Batch fetch quantities from SQL Server (minimal load)
            item_codes = list(mongo_items.keys())
            batch_size = 500  # SQL Server handles this well with IN clause

            for i in range(0, len(item_codes), batch_size):
                batch_codes = item_codes[i : i + batch_size]
                updated_before = stats["qty_updated"]
                errors_before = stats["errors"]

                try:
                    # Fetch only quantities - minimal SQL load
                    sql_quantities = await asyncio.to_thread(
                        self.sql_connector.get_item_quantities_only, batch_codes
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

                await self._emit_sync_audit_event(
                    event_type="BATCH_COMPLETED",
                    sync_run_id=sync_run_id,
                    sync_mode="variance",
                    counts={
                        "items_requested": len(batch_codes),
                        "items_updated": stats["qty_updated"] - updated_before,
                        "errors": stats["errors"] - errors_before,
                    },
                    batch={"offset": i, "size": len(batch_codes)},
                )

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
            await self._emit_sync_audit_event(
                event_type="RUN_PARTIAL" if stats.get("partial") else "RUN_COMPLETED",
                sync_run_id=sync_run_id,
                sync_mode="variance",
                counts=stats,
                duration_seconds=stats["duration"],
            )
            return stats

        except Exception as e:
            logger.error(f"Variance sync failed: {e!s}")
            self._sync_stats["failed_syncs"] += 1
            stats["errors"] = 1
            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            await self._emit_sync_audit_event(
                event_type="RUN_FAILED",
                sync_run_id=sync_run_id,
                sync_mode="variance",
                counts=stats,
                duration_seconds=stats["duration"],
                error=type(e).__name__,
            )
            raise

    def should_check_new_items(self) -> bool:
        """Check if it's time to discover new items (every 30 minutes)."""
        if self._last_new_item_check is None:
            return True
        elapsed = (
            datetime.now(timezone.utc).replace(tzinfo=None) - self._last_new_item_check
        ).total_seconds()
        return elapsed >= self._new_item_check_interval

    async def sync_quantities_only(self) -> dict[str, Any]:
        """Full quantity sync, guarded by the cross-process bulk-sync lock."""
        async with self._sync_run_lock("full", str(uuid4())) as acquired:
            if not acquired:
                return self._skipped_stats("another worker holds the bulk sync lock")
            return await self._sync_quantities_only_unlocked()

    async def _sync_quantities_only_unlocked(self) -> dict[str, Any]:
        """
        Sync ONLY quantity changes from SQL Server to MongoDB
        Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)

        Returns:
            Sync statistics
        """
        if not self.sql_connector.test_connection():
            from backend.exceptions import SQLServerConnectionError

            raise SQLServerConnectionError("SQL Server connection not available")

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        sync_run_id = str(uuid4())
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
            await self._emit_sync_audit_event(
                event_type="RUN_STARTED",
                sync_run_id=sync_run_id,
                sync_mode="full",
                counts=stats,
            )
            source_rows = await asyncio.to_thread(self.sql_connector.get_all_items)
            sql_items, duplicate_rows = self._consolidate_sql_items(source_rows)
            stats["source_rows"] = len(source_rows)
            stats["duplicate_source_rows"] = duplicate_rows
            await self._record_sync_conflicts(
                self._detect_sync_conflicts(source_rows, sql_items),
                sync_run_id=sync_run_id,
                sync_mode="full",
                stats=stats,
            )

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
                checked_before = stats["items_checked"]
                updated_before = stats["qty_updated"]
                created_before = stats["items_created"]
                errors_before = stats["errors"]

                for sql_item in batch:
                    try:
                        await self._sync_single_item(sql_item, stats, mongo_items_cache=mongo_items)
                    except Exception as e:
                        logger.error(f"Error syncing item {sql_item.get('item_code')}: {e!s}")
                        stats["errors"] += 1

                await self._emit_sync_audit_event(
                    event_type="BATCH_COMPLETED",
                    sync_run_id=sync_run_id,
                    sync_mode="full",
                    counts={
                        "items_checked": stats["items_checked"] - checked_before,
                        "items_updated": stats["qty_updated"] - updated_before,
                        "items_created": stats["items_created"] - created_before,
                        "errors": stats["errors"] - errors_before,
                    },
                    batch={"offset": i, "size": len(batch)},
                )

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
            await self._emit_sync_audit_event(
                event_type="RUN_PARTIAL" if stats.get("partial") else "RUN_COMPLETED",
                sync_run_id=sync_run_id,
                sync_mode="full",
                counts=stats,
                duration_seconds=stats["duration"],
            )
            return stats

        except Exception as e:
            logger.error(f"SQL qty sync failed: {e!s}")
            self._sync_stats["failed_syncs"] += 1
            stats["errors"] = 1
            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            await self._emit_sync_audit_event(
                event_type="RUN_FAILED",
                sync_run_id=sync_run_id,
                sync_mode="full",
                counts=stats,
                duration_seconds=stats["duration"],
                error=type(e).__name__,
            )
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
        else:
            # Existing item - update ONLY quantity if changed
            await self._update_existing_item(item_code, sql_item, sql_qty, mongo_item, stats)

        stats["items_checked"] += 1

    async def _update_existing_item(
        self,
        item_code: str,
        sql_item: dict[str, Any],
        sql_qty: float,
        mongo_item: dict[str, Any],
        stats: dict[str, Any],
    ) -> bool:
        """Update an existing MongoDB item with SQL data."""
        mongo_qty = float(mongo_item.get("stock_qty", 0.0))
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Prepare backfill for optional metadata
        metadata_candidates = _build_metadata_candidates(sql_item)
        metadata_updates = _compute_metadata_updates(metadata_candidates, mongo_item)

        update_fields: dict[str, Any] = {}

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
        else:
            stored_sql_qty = _numeric_or_none(mongo_item.get("sql_server_qty"))
            if stored_sql_qty is None or abs(stored_sql_qty - sql_qty) > 0.001:
                update_fields["sql_server_qty"] = sql_qty
            if mongo_item.get("sql_sync_status") != "MATCH":
                update_fields["sql_sync_status"] = "MATCH"

        if metadata_updates:
            update_fields.update(metadata_updates)

        if not update_fields:
            return False

        update_fields.update(
            {
                "last_synced": now,
                "updated_at": now,
                "sql_last_checked_at": now,
            }
        )

        await self.mongo_db.erp_items.update_one(
            {"item_code": item_code},
            {"$set": update_fields},
        )
        stats["items_modified"] = stats.get("items_modified", 0) + 1
        return True

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

        # A run that swallowed per-batch or per-item errors is NOT a success.
        # Batch failures (SQL dropped mid-pagination, Mongo write rejected) are
        # caught and counted rather than raised, so without this a permanently
        # failing sync reports 100% success on /sync/status.
        errors = int(stats.get("errors", 0) or 0)
        stats["partial"] = errors > 0
        if errors:
            self._sync_stats["failed_syncs"] += 1
            logger.warning("Sync completed with %d error(s); recording as a failed run", errors)
        else:
            self._sync_stats["successful_syncs"] += 1

        # L5+MM11 fix: Track both cumulative totals and last-run values
        self._sync_stats["items_synced"] += stats["items_checked"]
        self._sync_stats["qty_changes_detected"] += stats["qty_changes_detected"]
        self._sync_stats["last_run_items_synced"] = stats["items_checked"]
        self._sync_stats["last_run_qty_changes"] = stats["qty_changes_detected"]
        self._sync_stats["last_run_errors"] = errors
        self._sync_stats["last_sync"] = self._last_sync.isoformat()
        self._sync_stats["last_run_status"] = "PARTIAL" if errors else "SUCCESS"

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
            "next_sync": (
                (self._last_sync + timedelta(seconds=self.sync_interval)).isoformat()
                if self._last_sync
                else None
            ),
        }
