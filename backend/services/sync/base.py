from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any


class SyncServiceBase:
    """Base class providing shared attributes and method stubs for sync mixins.

    The mixins that compose ``SQLSyncService`` depend on state and helpers owned
    by sibling mixins. Declaring that contract here keeps the type checker able
    to catch a mixin reaching for something the composed class does not provide.
    """

    db: Any
    mongo_db: Any
    sql_connector: Any
    batch_size: int
    max_retries: int
    _lock: Any
    _stats: dict[str, Any]
    _sync_stats: dict[str, Any]

    # Helpers owned by sibling mixins. These are ANNOTATIONS ONLY - never give
    # them a body. SyncServiceBase precedes SQLSyncCoreSyncMixin in the
    # SQLSyncService MRO, so a stub with a `...` body would shadow the real
    # implementation and silently turn the call into a no-op.
    _resolve_awaitable: Callable[[Any], Any]
    _extract_db_session: Callable[[dict[str, Any]], Any]
    _consolidate_sql_items: Callable[[list[dict[str, Any]]], tuple[list[dict[str, Any]], int]]
    _sync_single_item: Callable[..., Awaitable[Any]]
    _emit_sync_audit_event: Callable[..., Awaitable[bool]]
    _detect_sync_conflicts: Callable[..., list[dict[str, Any]]]
    _record_sync_conflicts: Callable[..., Awaitable[None]]
    _sync_run_lock: Callable[..., Any]
    _skipped_stats: Callable[[str], dict[str, Any]]
