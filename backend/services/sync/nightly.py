
"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)
# Canonical mapper - single definition lives in
# backend/services/sync/core_sync.py. Re-exported here because
# backend/scripts/sync_bridge_agent.py and older callers import these names
# from this module. Do NOT re-inline: five verbatim copies previously drifted
# apart when only core_sync's was patched.
from backend.services.sync.base import SyncServiceBase
from backend.services.sync.core_sync import (  # noqa: F401
    _NEW_ITEM_FIELDS,
    _apply_field_conversion,
    _build_metadata_candidates,
    _build_new_item_dict,
    _coerce_qty,
    _compute_metadata_updates,
    _normalize_date,
    _numeric_or_none,
    _safe_optional_str,
)


class SQLSyncNightlyMixin(SyncServiceBase):
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
        """Nightly verification sync, guarded by the cross-process bulk lock."""
        async with self._sync_run_lock("nightly", str(uuid4())) as acquired:
            if not acquired:
                return self._skipped_stats("another worker holds the bulk sync lock")
            return await self._nightly_full_sync_unlocked()

    async def _nightly_full_sync_unlocked(self) -> dict[str, Any]:
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
        sync_run_id = str(uuid4())
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
            await self._emit_sync_audit_event(
                event_type="RUN_STARTED",
                sync_run_id=sync_run_id,
                sync_mode="nightly_full",
                counts=stats,
            )

            # Fetch ALL items from SQL Server
            source_rows = await asyncio.to_thread(self.sql_connector.get_all_items)
            sql_items, duplicate_rows = self._consolidate_sql_items(source_rows)
            stats["source_rows"] = len(source_rows)
            stats["duplicate_source_rows"] = duplicate_rows
            await self._record_sync_conflicts(
                self._detect_sync_conflicts(source_rows, sql_items),
                sync_run_id=sync_run_id,
                sync_mode="nightly_full",
                stats=stats,
            )
            # stats["items_checked"] = len(sql_items) -- Removed to avoid double counting, incremented in _sync_single_item
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
                checked_before = stats["items_checked"]
                updated_before = stats["qty_updated"]
                created_before = stats["items_created"]
                errors_before = stats["errors"]

                for sql_item in batch:
                    try:
                        await self._sync_single_item(sql_item, stats, mongo_items_cache=mongo_items)
                    except Exception as e:
                        logger.error(f"Error syncing item {sql_item.get('item_code')}: {e}")
                        stats["errors"] += 1

                await self._emit_sync_audit_event(
                    event_type="BATCH_COMPLETED",
                    sync_run_id=sync_run_id,
                    sync_mode="nightly_full",
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
            self._last_nightly_sync = datetime.now(timezone.utc).replace(tzinfo=None)
            self._sync_stats["last_nightly_sync"] = self._last_nightly_sync.isoformat()

            logger.info(
                f"🌙 Nightly sync completed: {stats['items_checked']} items verified, "
                f"{stats['qty_updated']} updated, {stats['items_created']} created, "
                f"in {stats['duration']:.2f}s"
            )

            # Update sync metadata
            self._finalize_sync_stats(stats)
            await self._update_sync_metadata(stats)
            await self._emit_sync_audit_event(
                event_type="RUN_PARTIAL" if stats.get("partial") else "RUN_COMPLETED",
                sync_run_id=sync_run_id,
                sync_mode="nightly_full",
                counts=stats,
                duration_seconds=stats["duration"],
            )
            return stats

        except Exception as e:
            logger.error(f"Nightly sync failed: {e!s}")
            stats["errors"] = 1
            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            self._sync_stats["failed_syncs"] += 1
            await self._emit_sync_audit_event(
                event_type="RUN_FAILED",
                sync_run_id=sync_run_id,
                sync_mode="nightly_full",
                counts=stats,
                duration_seconds=stats["duration"],
                error=type(e).__name__,
            )
            return stats
