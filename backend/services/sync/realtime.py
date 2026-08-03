
"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

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


class SQLSyncRealtimeMixin(SyncServiceBase):
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """

    async def _resolve_item_total_qty(self, item_code: str, fallback: float) -> float:
        """Return the item-level ERP quantity for ``item_code``.

        ``get_item_by_barcode`` / ``get_item_by_code`` return a single
        ProductBatch row, but ``erp_items`` is keyed by ``item_code`` and its
        ``stock_qty`` is the item total. Writing a batch row's Stock here would
        contradict the SUM written by ``sync_variance_only``. ``fallback`` is
        used only when the aggregate lookup is unavailable.
        """
        if not item_code:
            return fallback
        try:
            totals = await asyncio.to_thread(
                self.sql_connector.get_item_quantities_only, [item_code]
            )
        except Exception as exc:
            logger.warning(
                "Item-level quantity lookup failed for %s, using batch value: %s",
                item_code,
                exc,
            )
            return fallback

        total = totals.get(item_code) if totals else None
        return fallback if total is None else _coerce_qty(total, fallback)

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
            sql_item = await asyncio.to_thread(self.sql_connector.get_item_by_barcode, barcode)

            if not sql_item:
                return None

            # The scanned row is batch-grain; the mirror is item-grain. Replace
            # the batch Stock with the item total before writing.
            item_code = str(sql_item.get("item_code") or "").strip()
            sql_item["stock_qty"] = await self._resolve_item_total_qty(
                item_code, _coerce_qty(sql_item.get("stock_qty"))
            )

            # Use existing logic to update/create item
            stats = {
                "items_created": 0,
                "qty_updated": 0,
                "qty_changes_detected": 0,
                "items_checked": 0,
            }
            await self._sync_single_item(sql_item, stats)

            # Return the updated item from MongoDB
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
                sql_item = await asyncio.to_thread(self.sql_connector.get_item_by_code, item_code)
                if sql_item:
                    # get_item_by_code returns one ProductBatch row; the mirror
                    # stores the item total.
                    sql_qty = await self._resolve_item_total_qty(
                        item_code, _coerce_qty(sql_item.get("stock_qty"))
                    )

                    # Get current MongoDB record
                    mongo_item = await self.mongo_db.erp_items.find_one({"item_code": item_code})
                    mongo_qty = float(mongo_item.get("stock_qty", 0.0)) if mongo_item else 0.0

                    updated = False
                    # Tolerance-based comparison, consistent with the sync paths.
                    if mongo_item is not None and abs(sql_qty - mongo_qty) > 0.001:
                        # Update MongoDB cache. No upsert: the mirror is created
                        # only by the sync paths, which populate identity fields.
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
