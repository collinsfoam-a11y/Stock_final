"""Projection rebuild service for deterministic session projection recovery."""

from __future__ import annotations

from typing import Any, Optional

from backend.scripts.backfill_session_dashboard_projection import (
    build_session_dashboard_projection_row,
)
from backend.services.projection_read_service import ProjectionReadService

SESSION_COLLECTION = "sessions"
SESSION_PROJECTION_COLLECTION = ProjectionReadService.SESSION_COLLECTION
EVENT_LOG_COLLECTION = "event_log"


def _session_lookup(session_id: str) -> dict[str, Any]:
    return {"$or": [{"id": session_id}, {"session_id": session_id}]}


def _projection_lookup(session_id: str) -> dict[str, Any]:
    return {"$or": [{"session_id": session_id}, {"id": session_id}]}


def _resolve_session_id(document: dict[str, Any]) -> str:
    return str(document.get("session_id") or document.get("id") or "").strip()


async def _fetch_latest_event(db: Any, session_id: str) -> Optional[dict[str, Any]]:
    return await db[EVENT_LOG_COLLECTION].find_one(
        {"$or": [{"session_id": session_id}, {"payload.session_id": session_id}]},
        sort=[("timestamp", -1), ("created_at", -1)],
    )


async def rebuild_projection(db: Any, session_id: str) -> dict[str, Any]:
    """Recompute and upsert one session dashboard projection row.

    Returns the rebuilt projection document.
    """

    normalized_session_id = str(session_id or "").strip()
    if not normalized_session_id:
        raise ValueError("session_id is required")

    session = await db[SESSION_COLLECTION].find_one(_session_lookup(normalized_session_id))
    if not isinstance(session, dict):
        raise ValueError(f"Session not found: {normalized_session_id}")

    canonical_session_id = _resolve_session_id(session)
    if not canonical_session_id:
        raise ValueError(f"Session missing id/session_id: {normalized_session_id}")

    lines = [
        line
        async for line in db.count_lines.find({"session_id": canonical_session_id})
    ]
    latest_event = await _fetch_latest_event(db, canonical_session_id)
    rebuilt_row = build_session_dashboard_projection_row(session, lines, latest_event)

    await db[SESSION_PROJECTION_COLLECTION].replace_one(
        _projection_lookup(canonical_session_id),
        rebuilt_row,
        upsert=True,
    )

    return rebuilt_row
