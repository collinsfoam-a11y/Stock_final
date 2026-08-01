from __future__ import annotations

from typing import Any


class SyncServiceBase:
    """Base class providing shared attributes and method stubs for sync mixins."""

    db: Any
    sql_connector: Any
    batch_size: int
    max_retries: int
    _lock: Any
    _stats: dict[str, Any]

    def _resolve_awaitable(self, awaitable_or_val: Any) -> Any:
        ...

    def _extract_db_session(self, kwargs: dict[str, Any]) -> Any:
        ...
