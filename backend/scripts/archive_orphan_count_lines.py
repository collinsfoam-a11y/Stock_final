"""Archive count lines that reference missing stock-count sessions.

This is a guarded reconciliation script for historical data debt only. The
normal application write path must continue to create count lines through the
domain services.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess  # nosec B404
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pymongo.errors import DuplicateKeyError

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import settings
from backend.core import lifespan as runtime_lifespan
from backend.db.runtime import set_client, set_db
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.lock_service import LockService, ResourceLockedError
from backend.services.projection_write_service import (
    ProjectionWriteService,
    _as_float,
    _resolve_unit_value,
)
from backend.utils.api_utils import sanitize_for_logging

ACTIVE_FILTER = {"archived": {"$ne": True}}
ARCHIVE_REASON = "orphan_session"
GLOBAL_LOCK_KEY = "orphan_count_line_reconciliation"

BACKUP_COLLECTIONS = (
    "sessions",
    "count_lines",
    "count_lines_archive",
    "session_dashboard_projection",
    "verified_items_projection",
    "variance_summary_projection",
    "financial_projection",
    "batch_records",
    "event_log",
    "orphan_reconciliation_log",
)
PROJECTION_COLLECTIONS = (
    "session_dashboard_projection",
    "verified_items_projection",
    "variance_summary_projection",
    "financial_projection",
    "batch_records",
    "event_log",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _timestamp_slug() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _normalize_session_id(value: Any) -> str:
    return str(value or "").strip()


def _parse_session_ids(args: argparse.Namespace) -> list[str]:
    values: list[str] = []
    for raw in args.session_id or []:
        values.extend(str(raw or "").split(","))
    if args.session_ids:
        values.extend(str(args.session_ids).split(","))
    return sorted(
        {_normalize_session_id(value) for value in values if _normalize_session_id(value)}
    )


def _write_report(path: str | None, report: dict[str, Any]) -> None:
    if not path:
        return
    report_path = Path(path)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def _resolve_output_path(path: str | None) -> str:
    if not path:
        return "-"
    report_path = Path(path)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    return str(report_path)


def _line_totals(lines: list[dict[str, Any]]) -> dict[str, Any]:
    totals = {
        "count_lines": len(lines),
        "counted_qty": 0.0,
        "erp_qty": 0.0,
        "variance": 0.0,
        "financial_value_delta": 0.0,
        "damage_value": 0.0,
    }
    for line in lines:
        counted_qty = _as_float(line.get("counted_qty"))
        erp_qty = _as_float(line.get("erp_qty"))
        damaged_qty = _as_float(line.get("damaged_qty"))
        variance = _as_float(line.get("variance"))
        unit_value = _resolve_unit_value(line)
        totals["counted_qty"] += counted_qty
        totals["erp_qty"] += erp_qty
        totals["variance"] += variance
        totals["financial_value_delta"] += (counted_qty - erp_qty) * unit_value
        totals["damage_value"] += damaged_qty * unit_value
    return {
        key: round(value, 4) if isinstance(value, float) else value for key, value in totals.items()
    }


async def _to_list(cursor: Any, *, length: int | None = None) -> list[dict[str, Any]]:
    if hasattr(cursor, "to_list"):
        return list(await cursor.to_list(length=length))
    rows = []
    async for row in cursor:
        rows.append(row)
    return rows


async def _distinct(collection: Any, key: str, filter_query: dict[str, Any]) -> list[Any]:
    return list(await collection.distinct(key, filter_query))


async def _discover_orphan_session_ids(db: Any) -> list[str]:
    line_ids = {
        _normalize_session_id(session_id)
        for session_id in await _distinct(db.count_lines, "session_id", ACTIVE_FILTER)
        if _normalize_session_id(session_id)
    }
    active_session_ids = {
        _normalize_session_id(session_id)
        for session_id in await _distinct(db.sessions, "id", ACTIVE_FILTER)
        if _normalize_session_id(session_id)
    }
    active_session_ids.update(
        {
            _normalize_session_id(session_id)
            for session_id in await _distinct(db.sessions, "session_id", ACTIVE_FILTER)
            if _normalize_session_id(session_id)
        }
    )
    return sorted(line_ids - active_session_ids)


async def _load_count_lines(db: Any, session_ids: list[str]) -> list[dict[str, Any]]:
    if not session_ids:
        return []
    return await _to_list(
        db.count_lines.find({"session_id": {"$in": session_ids}}),
        length=None,
    )


async def _count_active_sessions(db: Any, session_ids: list[str]) -> int:
    if not session_ids:
        return 0
    return await db.sessions.count_documents(
        {
            "$and": [
                ACTIVE_FILTER,
                {"$or": [{"id": {"$in": session_ids}}, {"session_id": {"$in": session_ids}}]},
            ]
        }
    )


async def _collection_counts(db: Any, session_ids: list[str]) -> dict[str, Any]:
    if not session_ids:
        return {
            "active_sessions": 0,
            "active_count_lines": 0,
            "archived_count_lines": 0,
            "archive_collection_docs": 0,
            "active_projection_rows": {name: 0 for name in PROJECTION_COLLECTIONS},
        }

    counts = {
        "active_sessions": await _count_active_sessions(db, session_ids),
        "active_count_lines": await db.count_lines.count_documents(
            {"session_id": {"$in": session_ids}, "archived": {"$ne": True}}
        ),
        "archived_count_lines": await db.count_lines.count_documents(
            {
                "session_id": {"$in": session_ids},
                "archived": True,
                "archive_reason": ARCHIVE_REASON,
            }
        ),
        "archive_collection_docs": await db.count_lines_archive.count_documents(
            {"session_id": {"$in": session_ids}}
        ),
        "active_projection_rows": {},
    }
    for collection_name in PROJECTION_COLLECTIONS:
        collection = db[collection_name]
        counts["active_projection_rows"][collection_name] = await collection.count_documents(
            {"session_id": {"$in": session_ids}, "archived": {"$ne": True}}
        )
    return counts


async def _held_session_locks(db: Any, session_ids: list[str]) -> list[dict[str, Any]]:
    lock_ids = [ProjectionWriteService.session_lock_key(session_id) for session_id in session_ids]
    if not lock_ids:
        return []
    now = _utc_now()
    return await _to_list(
        db.locks.find(
            {"_id": {"$in": lock_ids}, "expires_at": {"$gt": now}},
            {"_id": 1, "owner": 1, "expires_at": 1},
        ),
        length=None,
    )


async def _acquire_lock(
    db: Any,
    *,
    key: str,
    owner: str,
    ttl_seconds: int,
    wait_timeout_ms: int,
    retry_delay_ms: int,
) -> bool:
    lock_service = LockService(db)
    started = datetime.now(timezone.utc)
    while True:
        try:
            await lock_service.acquire_lock(key, owner, ttl_seconds=ttl_seconds)
            return True
        except ResourceLockedError:
            elapsed_ms = int((datetime.now(timezone.utc) - started).total_seconds() * 1000.0)
            if elapsed_ms >= wait_timeout_ms:
                return False
            await asyncio.sleep(retry_delay_ms / 1000.0)


async def _release_locks(db: Any, locks: list[tuple[str, str]]) -> None:
    lock_service = LockService(db)
    for key, owner in reversed(locks):
        try:
            await lock_service.release_lock(key, owner)
        except Exception:  # nosec B112
            continue


def _redact(text: str) -> str:
    mongo_url = str(settings.MONGO_URL or "")
    if mongo_url:
        text = text.replace(mongo_url, "<redacted-mongo-uri>")
    return text


def _run_mongodump_backup(args: argparse.Namespace, reconciliation_id: str) -> dict[str, Any]:
    mongodump = shutil.which("mongodump")
    if not mongodump:
        raise RuntimeError("mongodump was not found on PATH")

    backup_dir = Path(args.backup_dir)
    if not backup_dir.is_absolute():
        backup_dir = ROOT_DIR / backup_dir
    backup_dir = backup_dir / reconciliation_id
    backup_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for collection_name in BACKUP_COLLECTIONS:
        command = [
            mongodump,
            "--uri",
            settings.MONGO_URL,
            "--db",
            settings.DB_NAME,
            "--collection",
            collection_name,
            "--gzip",
            "--out",
            str(backup_dir),
        ]
        completed = subprocess.run(  # nosec B603
            command,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        results.append(
            {
                "collection": collection_name,
                "returncode": completed.returncode,
                "stdout": _redact(completed.stdout.strip())[-2000:],
                "stderr": _redact(completed.stderr.strip())[-2000:],
            }
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"mongodump failed for collection {collection_name}: "
                f"{sanitize_for_logging(_redact(completed.stderr.strip()))}"
            )

    return {
        "type": "mongodump",
        "path": str(backup_dir),
        "collections": list(BACKUP_COLLECTIONS),
        "results": results,
    }


async def _copy_to_archive_collection(
    db: Any,
    *,
    lines: list[dict[str, Any]],
    marker: dict[str, Any],
) -> dict[str, int]:
    inserted_or_updated = 0
    archive = db.count_lines_archive
    for line in lines:
        line_id = line.get("_id")
        if line_id is None:
            continue
        archived_doc = dict(line)
        archived_doc.pop("_id", None)
        archived_doc["archive_metadata"] = {
            "archive_reason": marker["archive_reason"],
            "archived_at": marker["archived_at"],
            "archived_by": marker["archived_by"],
            "archive_reconciliation_id": marker["archive_reconciliation_id"],
        }
        try:
            await archive.update_one(
                {"_id": line_id},
                {
                    "$set": archived_doc,
                    "$setOnInsert": {"archive_copy_created_at": marker["archived_at"]},
                },
                upsert=True,
            )
            inserted_or_updated += 1
        except DuplicateKeyError:
            await archive.update_one({"_id": line_id}, {"$set": archived_doc})
            inserted_or_updated += 1
    return {"archive_docs_upserted": inserted_or_updated}


async def _archive_source_and_projections(
    db: Any,
    *,
    session_ids: list[str],
    all_lines: list[dict[str, Any]],
    marker: dict[str, Any],
) -> dict[str, Any]:
    archive_copy_result = await _copy_to_archive_collection(db, lines=all_lines, marker=marker)

    count_line_result = await CountLineWriteService(db).archive_orphan_session_lines(
        session_ids=session_ids,
        archive_marker=marker,
    )

    projection_results: dict[str, Any] = {}
    for collection_name in PROJECTION_COLLECTIONS:
        collection = db[collection_name]
        result = await collection.update_many(
            {"session_id": {"$in": session_ids}, "archived": {"$ne": True}},
            {
                "$set": {
                    **marker,
                    "projection_excluded": True,
                }
            },
        )
        projection_results[collection_name] = {
            "matched": getattr(result, "matched_count", 0),
            "modified": getattr(result, "modified_count", 0),
        }

    return {
        **archive_copy_result,
        "count_lines_matched": getattr(count_line_result, "matched_count", 0),
        "count_lines_modified": getattr(count_line_result, "modified_count", 0),
        "projection_results": projection_results,
    }


async def _write_audit_log(db: Any, report: dict[str, Any]) -> None:
    await db.orphan_reconciliation_log.update_one(
        {"reconciliation_id": report["reconciliation_id"]},
        {
            "$set": {
                "reconciliation_id": report["reconciliation_id"],
                "strategy": report["strategy"],
                "session_ids": report["session_ids"],
                "affected_count_lines": report["affected_count_lines"],
                "timestamp": report["timestamp"],
                "operator": report["operator"],
                "before_totals": report.get("before_totals"),
                "after_totals": report.get("after_totals"),
                "before_counts": report.get("before_counts"),
                "after_counts": report.get("after_counts"),
                "backup": report.get("backup"),
                "archive_result": report.get("archive_result"),
                "success": report.get("success"),
            }
        },
        upsert=True,
    )


async def reconcile(args: argparse.Namespace) -> int:
    set_client(runtime_lifespan.client)
    set_db(runtime_lifespan.db)
    db = runtime_lifespan.db

    requested_ids = _parse_session_ids(args)
    session_ids = requested_ids or await _discover_orphan_session_ids(db)
    all_lines = await _load_count_lines(db, session_ids)
    active_lines = [line for line in all_lines if line.get("archived") is not True]
    held_locks = await _held_session_locks(db, session_ids)
    before_counts = await _collection_counts(db, session_ids)
    reconciliation_id = args.reconciliation_id or f"orphan_reconciliation_{_timestamp_slug()}"

    report: dict[str, Any] = {
        "strategy": "archive",
        "execute": bool(args.execute),
        "reconciliation_id": reconciliation_id,
        "timestamp": _utc_now_iso(),
        "operator": args.operator,
        "session_ids": session_ids,
        "requested_session_ids": requested_ids,
        "discovered": not bool(requested_ids),
        "affected_count_lines": len(active_lines),
        "all_count_lines_for_session_ids": len(all_lines),
        "before_totals": _line_totals(active_lines),
        "before_counts": before_counts,
        "held_session_locks": [
            {
                "_id": str(lock.get("_id")),
                "owner": sanitize_for_logging(str(lock.get("owner"))),
                "expires_at": lock.get("expires_at"),
            }
            for lock in held_locks
        ],
        "backup": None,
        "archive_result": None,
        "after_totals": None,
        "after_counts": None,
        "success": False,
        "errors": [],
    }

    if not args.execute:
        report["success"] = True
        _write_report(args.output, report)
        _print_summary(args, report)
        runtime_lifespan.client.close()
        return 0

    if not session_ids:
        report["success"] = True
        report["after_totals"] = _line_totals([])
        report["after_counts"] = await _collection_counts(db, session_ids)
        _write_report(args.output, report)
        await _write_audit_log(db, report)
        _print_summary(args, report)
        runtime_lifespan.client.close()
        return 0

    acquired_locks: list[tuple[str, str]] = []
    owner = f"orphan-reconciliation:{os.getpid()}:{reconciliation_id}"
    try:
        report["backup"] = _run_mongodump_backup(args, reconciliation_id)

        global_owner = f"{owner}:global"
        global_locked = await _acquire_lock(
            db,
            key=GLOBAL_LOCK_KEY,
            owner=global_owner,
            ttl_seconds=args.lock_ttl_seconds,
            wait_timeout_ms=args.lock_wait_timeout_ms,
            retry_delay_ms=args.lock_retry_delay_ms,
        )
        if not global_locked:
            report["errors"].append({"kind": "lock", "key": GLOBAL_LOCK_KEY})
            return_code = 1
        else:
            acquired_locks.append((GLOBAL_LOCK_KEY, global_owner))
            locked_all = True
            for session_id in session_ids:
                lock_key = ProjectionWriteService.session_lock_key(session_id)
                lock_owner = f"{owner}:{session_id}"
                locked = await _acquire_lock(
                    db,
                    key=lock_key,
                    owner=lock_owner,
                    ttl_seconds=args.lock_ttl_seconds,
                    wait_timeout_ms=args.lock_wait_timeout_ms,
                    retry_delay_ms=args.lock_retry_delay_ms,
                )
                if not locked:
                    locked_all = False
                    report["errors"].append({"kind": "lock", "key": lock_key})
                    break
                acquired_locks.append((lock_key, lock_owner))

            if not locked_all:
                return_code = 1
            else:
                marker = {
                    "archived": True,
                    "archive_reason": ARCHIVE_REASON,
                    "archived_at": _utc_now(),
                    "archived_by": args.operator,
                    "archive_reconciliation_id": reconciliation_id,
                }
                report["archive_result"] = await _archive_source_and_projections(
                    db,
                    session_ids=session_ids,
                    all_lines=all_lines,
                    marker=marker,
                )
                after_lines = await _load_count_lines(db, session_ids)
                active_after = [line for line in after_lines if line.get("archived") is not True]
                report["after_totals"] = _line_totals(active_after)
                report["after_counts"] = await _collection_counts(db, session_ids)
                report["success"] = (
                    report["after_counts"]["active_count_lines"] == 0
                    and all(
                        count == 0
                        for count in report["after_counts"]["active_projection_rows"].values()
                    )
                    and not report["errors"]
                )
                return_code = 0 if report["success"] else 1

        await _write_audit_log(db, report)
        return return_code
    except Exception as exc:
        report["errors"].append({"kind": "exception", "message": sanitize_for_logging(str(exc))})
        return 1
    finally:
        await _release_locks(db, acquired_locks)
        _write_report(args.output, report)
        _print_summary(args, report)
        runtime_lifespan.client.close()


def _print_summary(args: argparse.Namespace, report: dict[str, Any]) -> None:
    print("=== Orphan Count-Line Reconciliation ===")
    print(f"Report: {_resolve_output_path(args.output)}")
    print(f"Execute: {report['execute']}")
    print(f"Strategy: {report['strategy']}")
    print(f"Session IDs: {len(report['session_ids'])}")
    print(f"Affected active count lines: {report['affected_count_lines']}")
    print(f"Before active count lines: {report['before_counts']['active_count_lines']}")
    if report.get("after_counts"):
        print(f"After active count lines: {report['after_counts']['active_count_lines']}")
    print(f"Locks currently held in dry-run scan: {len(report['held_session_locks'])}")
    print(f"Errors: {len(report['errors'])}")
    print(f"Success: {report['success']}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Apply archive writes.")
    parser.add_argument("--session-id", action="append", default=[])
    parser.add_argument("--session-ids", default=None)
    parser.add_argument(
        "--output",
        default=".agent/reports/orphan-reconciliation.json",
    )
    parser.add_argument(
        "--backup-dir",
        default=".agent/backups",
        help="Directory where execute-mode mongodump backups are written.",
    )
    parser.add_argument("--operator", default=os.getenv("USER") or "codex")
    parser.add_argument("--reconciliation-id", default=None)
    parser.add_argument(
        "--lock-ttl-seconds",
        type=int,
        default=int(os.getenv("ORPHAN_RECONCILIATION_LOCK_TTL_SECONDS", "180")),
    )
    parser.add_argument(
        "--lock-wait-timeout-ms",
        type=int,
        default=int(os.getenv("ORPHAN_RECONCILIATION_LOCK_WAIT_TIMEOUT_MS", "5000")),
    )
    parser.add_argument(
        "--lock-retry-delay-ms",
        type=int,
        default=int(os.getenv("ORPHAN_RECONCILIATION_LOCK_RETRY_DELAY_MS", "100")),
    )
    return parser


def main() -> int:
    return asyncio.run(reconcile(build_parser().parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
