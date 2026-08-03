
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


class SQLSyncDiscoveryMixin(SyncServiceBase):
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """

    async def _collect_mongo_item_codes(self) -> set[str]:
        mongo_item_codes_cursor = self.mongo_db.erp_items.find({}, {"item_code": 1})
        mongo_item_codes: set[str] = set()
        async for item in mongo_item_codes_cursor:
            item_code = item.get("item_code")
            if item_code is not None:
                mongo_item_codes.add(str(item_code).strip())
        return mongo_item_codes

    @staticmethod
    def _select_new_items(
        sql_items: list[dict[str, Any]], mongo_item_codes: set[str], limit: int
    ) -> list[dict[str, Any]]:
        new_items: list[dict[str, Any]] = []
        for sql_item in sql_items:
            item_code = sql_item.get("item_code")
            if item_code is None:
                continue
            item_code_str = str(item_code).strip()
            if not item_code_str or item_code_str in mongo_item_codes:
                continue
            new_items.append(sql_item)
            mongo_item_codes.add(item_code_str)
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

    def _finish_discovery_stats(self, stats: dict[str, Any], start_time: datetime) -> None:
        stats["duration"] = (
            datetime.now(timezone.utc).replace(tzinfo=None) - start_time
        ).total_seconds()
        self._last_new_item_check = datetime.now(timezone.utc).replace(tzinfo=None)

    async def discover_new_items(self, limit: int = 100) -> dict[str, Any]:
        """New-item discovery, guarded by the cross-process bulk-sync lock."""
        async with self._sync_run_lock("discovery", str(uuid4())) as acquired:
            if not acquired:
                skipped = self._skipped_stats("another worker holds the bulk sync lock")
                skipped["items_discovered"] = 0
                return skipped
            return await self._discover_new_items_unlocked(limit)

    async def _discover_new_items_unlocked(self, limit: int = 100) -> dict[str, Any]:
        """
        Discover and create NEW items from SQL Server that don't exist in MongoDB.
        This runs less frequently than variance sync to minimize SQL load.

        Args:
            limit: Maximum number of new items to create per run (default 100)

        Returns:
            Discovery statistics
        """
        if not self.sql_connector.test_connection():
            logger.warning("SQL Server not connected, skipping new item discovery")
            return {"items_discovered": 0, "error": "SQL Server not connected"}

        start_time = datetime.now(timezone.utc).replace(tzinfo=None)
        sync_run_id = str(uuid4())
        stats: dict[str, Any] = {
            "items_discovered": 0,
            "items_checked": 0,
            "errors": 0,
            "duration": 0,
        }

        try:
            logger.info("Starting new item discovery from SQL Server...")
            await self._emit_sync_audit_event(
                event_type="RUN_STARTED",
                sync_run_id=sync_run_id,
                sync_mode="discovery",
                counts=stats,
            )

            # Step 1: Get all item codes from MongoDB
            mongo_item_codes = await self._collect_mongo_item_codes()

            logger.debug(f"Found {len(mongo_item_codes)} existing item codes in MongoDB")

            # Step 2: Fetch all items from SQL Server (this is the heavy query)
            # Only run this periodically
            source_rows = await asyncio.to_thread(self.sql_connector.get_all_items)

            # get_all_items is batch-grain (one row per ProductBatch) while
            # erp_items is item-grain. Consolidate first so a discovered item is
            # created with SUM(Stock) rather than whichever batch row came first
            # - otherwise the next variance sync corrects it and stamps a
            # phantom qty_changed_at / qty_change_delta on a brand-new item.
            sql_items, duplicate_rows = self._consolidate_sql_items(source_rows)
            stats["items_checked"] = len(sql_items)
            stats["source_rows"] = len(source_rows)
            stats["duplicate_source_rows"] = duplicate_rows

            # Step 3: Find items that exist in SQL but not in MongoDB
            new_items = self._select_new_items(sql_items, mongo_item_codes, limit)

            if not new_items:
                logger.info("No new items found in SQL Server")
                self._finish_discovery_stats(stats, start_time)
                return stats

            remaining = sum(
                1
                for item in sql_items
                if str(item.get("item_code") or "").strip() not in mongo_item_codes
            )
            if remaining:
                # _select_new_items caps at `limit`; without this the mirror can
                # stay incomplete for hours with no signal.
                stats["items_remaining"] = remaining
                logger.warning(
                    "New item discovery capped at %d; %d further new items remain "
                    "and will be created on subsequent runs",
                    limit,
                    remaining,
                )

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

            await self._emit_sync_audit_event(
                event_type="RUN_PARTIAL" if stats["errors"] else "RUN_COMPLETED",
                sync_run_id=sync_run_id,
                sync_mode="discovery",
                counts=stats,
                duration_seconds=stats["duration"],
            )
            return stats

        except Exception as e:
            logger.error(f"New item discovery failed: {e!s}")
            stats["errors"] = 1
            stats["duration"] = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start_time
            ).total_seconds()
            await self._emit_sync_audit_event(
                event_type="RUN_FAILED",
                sync_run_id=sync_run_id,
                sync_mode="discovery",
                counts=stats,
                duration_seconds=stats["duration"],
                error=type(e).__name__,
            )
            return stats
