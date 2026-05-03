"""Request-scoped projection snapshot helpers for rollout validation."""

from __future__ import annotations

import os
from contextvars import ContextVar, Token
from datetime import datetime
from typing import Any, Iterable

from backend.services.query_utils import normalize_datetime

_TRUE_VALUES = {"1", "true", "yes", "on"}
_NO_ROLLOUT_STAGES = {"", "0", "false", "off", "shadow_only"}
_snapshot_ts: ContextVar[datetime | None] = ContextVar(
    "projection_snapshot_ts",
    default=None,
)

SOURCE_SESSION_TIMESTAMP_FIELDS = (
    "updated_at",
    "last_activity",
    "last_heartbeat",
    "started_at",
    "created_at",
    "finalized_at",
    "completed_at",
    "closed_at",
)
PROJECTION_SESSION_TIMESTAMP_FIELDS = (
    "last_activity",
    "updated_at",
    "started_at",
    "created_at",
    "finalized_at",
    "completed_at",
    "closed_at",
)
PROJECTION_SESSION_SNAPSHOT_FIELDS = (
    "source_updated_at",
    "session_updated_at",
    "last_activity",
    "started_at",
    "created_at",
    "finalized_at",
    "completed_at",
    "closed_at",
)
SOURCE_ITEM_TIMESTAMP_FIELDS = (
    "updated_at",
    "counted_at",
    "finalized_at",
    "verified_at",
    "created_at",
)
PROJECTION_ITEM_TIMESTAMP_FIELDS = (
    "updated_at",
    "counted_at",
    "finalized_at",
    "verified_at",
    "created_at",
)
PROJECTION_ITEM_SNAPSHOT_FIELDS = (
    "source_updated_at",
    "session_updated_at",
    "counted_at",
    "finalized_at",
    "verified_at",
    "created_at",
)


def snapshot_mode_enabled() -> bool:
    """Return true when reads should use a deterministic rollout snapshot."""

    validation_mode = os.getenv("VALIDATION_MODE", "false").strip().lower()
    rollout_mode = os.getenv("ROLLOUT_MODE", "false").strip().lower()
    rollout_stage = os.getenv("ROLLOUT_STAGE", "").strip().lower()
    explicit_snapshot = os.getenv("PROJECTION_SNAPSHOT_MODE", "false").strip().lower()
    return (
        validation_mode in _TRUE_VALUES
        or rollout_mode in _TRUE_VALUES
        or explicit_snapshot in _TRUE_VALUES
        or rollout_stage not in _NO_ROLLOUT_STAGES
    )


def get_projection_snapshot_ts() -> datetime | None:
    return _snapshot_ts.get()


def set_projection_snapshot_ts(snapshot_ts: Any) -> Token[datetime | None]:
    return _snapshot_ts.set(normalize_datetime(snapshot_ts))


def reset_projection_snapshot_ts(token: Token[datetime | None]) -> None:
    _snapshot_ts.reset(token)


async def get_latest_collection_timestamp(
    collection: Any,
    fields: Iterable[str],
) -> datetime | None:
    latest: datetime | None = None
    for field_name in fields:
        rows = await (
            collection.find(
                {field_name: {"$exists": True, "$ne": None}},
                projection={field_name: 1},
            )
            .sort(field_name, -1)
            .limit(1)
            .to_list(length=1)
        )
        if not rows:
            continue
        candidate = normalize_datetime(rows[0].get(field_name))
        if candidate and (latest is None or candidate > latest):
            latest = candidate
    return latest


async def capture_latest_session_snapshot(db: Any) -> datetime | None:
    return await get_latest_collection_timestamp(
        db["sessions"],
        SOURCE_SESSION_TIMESTAMP_FIELDS,
    )


def snapshot_filter(
    fields: Iterable[str],
    snapshot_ts: datetime | None = None,
) -> dict[str, Any]:
    resolved_snapshot = normalize_datetime(snapshot_ts) or get_projection_snapshot_ts()
    if resolved_snapshot is None:
        return {}

    field_names = tuple(fields)
    no_field_after_snapshot = {
        "$and": [
            {
                "$or": [
                    {field_name: {"$exists": False}},
                    {field_name: None},
                    {field_name: ""},
                    {field_name: {"$lte": resolved_snapshot}},
                ]
            }
            for field_name in field_names
        ]
    }
    has_snapshot_visible_timestamp = {
        "$or": [{field_name: {"$lte": resolved_snapshot}} for field_name in field_names]
    }
    all_timestamps_missing = {
        "$and": [
            {
                "$or": [
                    {field_name: {"$exists": False}},
                    {field_name: None},
                    {field_name: ""},
                ]
            }
            for field_name in field_names
        ]
    }
    return {
        "$and": [
            no_field_after_snapshot,
            {"$or": [has_snapshot_visible_timestamp, all_timestamps_missing]},
        ]
    }


def apply_snapshot_filter(
    query: dict[str, Any] | None,
    fields: Iterable[str],
    snapshot_ts: datetime | None = None,
) -> dict[str, Any]:
    base_query = dict(query or {})
    boundary = snapshot_filter(fields, snapshot_ts)
    if not boundary:
        return base_query
    if not base_query:
        return boundary
    return {"$and": [base_query, boundary]}
