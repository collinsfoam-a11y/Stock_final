from __future__ import annotations

from typing import Any


class CountLineServiceBase:
    """Base class providing shared attributes and method stubs for count-line mixins."""

    db: Any
    snapshot_service: Any
    variance_service: Any
    validation_service: Any
    lifecycle_service: Any
    audit_service: Any
    projection_service: Any
    _session_snapshot_cache: dict[str, dict[str, Any] | None]
    _session_snapshot_item_index: dict[str, dict[str, float]]

    def _resolve_awaitable(self, awaitable_or_val: Any) -> Any: ...

    def _extract_db_session(self, kwargs: dict[str, Any]) -> Any: ...

    def _should_run_runtime_validation(self, *args: Any, **kwargs: Any) -> Any: ...

    def _resolve_governance_mode_profile(self, *args: Any, **kwargs: Any) -> Any: ...

    def _collect_session_ids_for_write(self, *args: Any, **kwargs: Any) -> Any: ...

    def assert_session_integrity(self, *args: Any, **kwargs: Any) -> Any: ...

    def resolve_baseline(self, *args: Any, **kwargs: Any) -> Any: ...

    def _resolve_session_document(self, *args: Any, **kwargs: Any) -> Any: ...

    def _execute_authorized_write(self, *args: Any, **kwargs: Any) -> Any: ...

    def _build_count_line_projection(self, *args: Any, **kwargs: Any) -> Any: ...
