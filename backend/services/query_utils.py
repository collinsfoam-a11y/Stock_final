"""Shared query helpers for deterministic filtering and sorting."""

from __future__ import annotations

import re
from datetime import date, datetime, time, timezone
from typing import Any, Optional


def normalize_datetime(value: Any) -> Optional[datetime]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return (
            value.astimezone(timezone.utc).replace(tzinfo=None)
            if value.tzinfo
            else value
        )
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(
                tzinfo=None
            )
        except (OSError, ValueError):
            return None
    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        return (
            parsed.astimezone(timezone.utc).replace(tzinfo=None)
            if parsed.tzinfo
            else parsed
        )
    return None


def normalize_sort_key(value: Any) -> tuple[int, int, Any]:
    """Normalize mixed values into a stable, comparable key."""

    if value in (None, ""):
        return (1, 3, "")
    parsed_datetime = normalize_datetime(value)
    if parsed_datetime is not None:
        return (0, 0, parsed_datetime.timestamp())
    if isinstance(value, bool):
        return (0, 1, int(value))
    if isinstance(value, (int, float)):
        return (0, 1, float(value))
    if isinstance(value, str):
        try:
            return (0, 1, float(value))
        except ValueError:
            return (0, 2, value.lower())
    return (0, 2, str(value).lower())


def date_match(value: Any, start: Optional[Any], end: Optional[Any]) -> bool:
    parsed = normalize_datetime(value)
    if parsed is None:
        return False
    start_dt = normalize_datetime(start)
    end_dt = normalize_datetime(end)
    if start_dt and parsed < start_dt:
        return False
    if end_dt and parsed > end_dt:
        return False
    return True


def build_mongo_date_filter(
    date_from: Optional[Any],
    date_to: Optional[Any],
    *,
    end_of_day: bool = False,
) -> Optional[dict[str, datetime]]:
    date_filter: dict[str, datetime] = {}

    start_dt = normalize_datetime(date_from)
    if start_dt:
        date_filter["$gte"] = start_dt

    end_dt = normalize_datetime(date_to)
    if end_dt:
        if end_of_day and isinstance(date_to, date) and not isinstance(date_to, datetime):
            end_dt = datetime.combine(date_to, time.max)
        date_filter["$lte"] = end_dt

    return date_filter or None


def escaped_regex_filter(value: str) -> dict[str, Any]:
    return {"$regex": re.escape(value), "$options": "i"}
