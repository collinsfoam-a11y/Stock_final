"""Concurrency primitives for governed write services."""

from __future__ import annotations

from typing import Any


class ConcurrencyError(RuntimeError):
    """Raised when optimistic concurrency validation fails."""


def coerce_version(value: Any) -> int:
    """Normalize a persisted version value to a non-negative integer."""
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return 0
    return numeric if numeric >= 0 else 0


def build_version_filter(expected_version: int) -> dict[str, Any]:
    """Build a filter that supports legacy documents without a version field."""
    if expected_version <= 0:
        return {"$or": [{"version": 0}, {"version": {"$exists": False}}]}
    return {"version": expected_version}
