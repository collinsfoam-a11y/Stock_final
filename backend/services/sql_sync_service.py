
"""
SQL Sync Service - Sync ONLY quantity changes from SQL Server to MongoDB
CRITICAL: Preserves all enriched data (serial numbers, MRP, HSN codes, etc.)
"""

import logging

logger = logging.getLogger(__name__)
# Canonical mapper - single definition lives in
# backend/services/sync/core_sync.py. Re-exported here because
# backend/scripts/sync_bridge_agent.py and older callers import these names
# from this module. Do NOT re-inline: five verbatim copies previously drifted
# apart when only core_sync's was patched.
from backend.services.sync.core_sync import (  # noqa: F401
    _NEW_ITEM_FIELDS,
    SQLSyncCoreSyncMixin,
    _apply_field_conversion,
    _build_metadata_candidates,
    _build_new_item_dict,
    _coerce_qty,
    _compute_metadata_updates,
    _normalize_date,
    _numeric_or_none,
    _safe_optional_str,
)
from backend.services.sync.discovery import SQLSyncDiscoveryMixin
from backend.services.sync.nightly import SQLSyncNightlyMixin
from backend.services.sync.realtime import SQLSyncRealtimeMixin
from backend.services.sync.scheduler import SQLSyncSchedulerMixin


class SQLSyncService(
    SQLSyncSchedulerMixin,
    SQLSyncDiscoveryMixin,
    SQLSyncNightlyMixin,
    SQLSyncRealtimeMixin,
    SQLSyncCoreSyncMixin,
):
    """
    Service to sync SQL Server quantity changes to MongoDB

    CRITICAL BEHAVIOR:
    - Only updates stock_qty field from SQL Server
    - Preserves ALL enriched data (serial numbers, MRP, HSN codes, etc.)
    - Tracks qty changes and timestamps
    - Never overwrites user-entered enrichment data
    """
