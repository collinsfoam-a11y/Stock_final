
"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging

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


class SQLSyncSchedulerMixin(SyncServiceBase):
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
                                logger.info("🔍 Running new item discovery (every 30 min)...")
                                await self.discover_new_items(limit=200)

                except Exception as e:
                    logger.error(f"Sync loop error: {e!s}")
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
