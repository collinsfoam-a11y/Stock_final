from __future__ import annotations
"""Shared helpers for controlled projection rebuild scripts."""


import argparse
import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.core import lifespan as runtime_lifespan
from backend.db.runtime import set_client, set_db
from backend.services.lock_service import LockService, ResourceLockedError
from backend.services.projection_write_service import ProjectionWriteService
from backend.utils.api_utils import sanitize_for_logging


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_scopes(raw_value: str | None, *, allowed: set[str]) -> set[str]:
    if not raw_value:
        return set(allowed)
    scopes = {part.strip() for part in raw_value.split(",") if part.strip()}
    unknown = scopes - allowed
    if unknown:
        raise SystemExit(f"Unsupported --scope value(s): {', '.join(sorted(unknown))}")
    return scopes


async def iter_session_ids(
    db: Any,
    *,
    session_ids: list[str],
    limit: int | None,
) -> list[str]:
    if session_ids:
        return sorted({str(session_id).strip() for session_id in session_ids if session_id})

    resolved: list[str] = []
    cursor = db.sessions.find({}, {"_id": 0, "id": 1, "session_id": 1}).sort("updated_at", -1)
    if limit is not None:
        cursor = cursor.limit(limit)
    async for session in cursor:
        session_id = str(session.get("id") or session.get("session_id") or "").strip()
        if session_id:
            resolved.append(session_id)
    return resolved


async def acquire_rebuild_lock(db: Any, session_id: str, owner: str, ttl_seconds: int) -> bool:
    try:
        await LockService(db).acquire_lock(
            ProjectionWriteService.session_lock_key(session_id),
            owner,
            ttl_seconds=ttl_seconds,
        )
        return True
    except ResourceLockedError:
        return False


async def release_rebuild_lock(db: Any, session_id: str, owner: str) -> None:
    await LockService(db).release_lock(ProjectionWriteService.session_lock_key(session_id), owner)


def write_report(path: str | None, report: dict[str, Any]) -> None:
    if not path:
        return
    report_path = Path(path)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def base_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--execute", action="store_true", help="Apply rebuild writes.")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--session-id", action="append", default=[])
    parser.add_argument("--scope", default=None)
    parser.add_argument("--output", default=None)
    parser.add_argument(
        "--lock-ttl-seconds",
        type=int,
        default=int(os.getenv("PROJECTION_REBUILD_LOCK_TTL_SECONDS", "120")),
    )
    return parser


async def run_rebuild(
    *,
    args: argparse.Namespace,
    scopes: set[str],
    actor: str,
    rebuild_item_projections: bool,
    item_projection_scopes: set[str] | None,
) -> int:
    set_client(runtime_lifespan.client)
    set_db(runtime_lifespan.db)
    db = runtime_lifespan.db
    service = ProjectionWriteService(db)
    service.lock_enabled = False

    session_ids = await iter_session_ids(
        db,
        session_ids=list(args.session_id or []),
        limit=args.limit,
    )
    report: dict[str, Any] = {
        "timestamp": utc_now_iso(),
        "execute": bool(args.execute),
        "scope": sorted(scopes),
        "sessions_considered": len(session_ids),
        "sessions_rebuilt": 0,
        "sessions_skipped_locked": 0,
        "sessions_missing": 0,
        "errors": [],
        "rebuilt_session_ids": [],
        "skipped_locked_session_ids": [],
    }

    for session_id in session_ids:
        owner = f"{actor}:{os.getpid()}:{session_id}"
        if not args.execute:
            report["sessions_rebuilt"] += 1
            report["rebuilt_session_ids"].append(session_id)
            continue

        locked = await acquire_rebuild_lock(db, session_id, owner, args.lock_ttl_seconds)
        if not locked:
            report["sessions_skipped_locked"] += 1
            report["skipped_locked_session_ids"].append(session_id)
            continue
        try:
            before = await db.sessions.find_one(
                {"$or": [{"id": session_id}, {"session_id": session_id}]},
                {"_id": 0, "id": 1, "session_id": 1},
            )
            if not isinstance(before, dict):
                report["sessions_missing"] += 1
                continue
            await service.sync_for_sessions(
                [session_id],
                trigger=f"{actor}.{','.join(sorted(scopes))}",
                actor=actor,
                rebuild_item_projections=rebuild_item_projections,
                item_projection_scopes=item_projection_scopes,
                skip_session_lock=True,
            )
            report["sessions_rebuilt"] += 1
            report["rebuilt_session_ids"].append(session_id)
        except Exception as exc:
            report["errors"].append(
                {
                    "session_id": session_id,
                    "error": sanitize_for_logging(str(exc)),
                }
            )
        finally:
            await release_rebuild_lock(db, session_id, owner)

    report["success"] = not report["errors"] and report["sessions_skipped_locked"] == 0
    write_report(args.output, report)

    print("=== Projection Rebuild ===")
    print(f"Report: {Path(args.output).resolve() if args.output else '-'}")
    print(f"Execute: {args.execute}")
    print(f"Scope: {','.join(sorted(scopes))}")
    print(f"Sessions considered: {report['sessions_considered']}")
    print(f"Sessions rebuilt: {report['sessions_rebuilt']}")
    print(f"Sessions skipped locked: {report['sessions_skipped_locked']}")
    print(f"Errors: {len(report['errors'])}")
    return 0 if report["success"] else 1


def run_async(coro: Any) -> int:
    try:
        return asyncio.run(coro)
    finally:
        runtime_lifespan.client.close()
