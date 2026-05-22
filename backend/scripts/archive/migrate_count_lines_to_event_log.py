"""
Backfill legacy count_lines into the append-only event_log and optionally rebuild projections.

Safe by default:
- dry-run unless --execute is provided
- projections are rebuilt only with --execute --rebuild-projections
- mismatches are reported, never auto-fixed
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from backend.config import settings
from backend.scripts.archive.v31_projection_validation import build_projection_validation_report
from backend.services.event_service import EventService
from backend.services.projection_service import PROJECTION_COLLECTIONS, ProjectionService


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Persist the migrated events")
    parser.add_argument(
        "--rebuild-projections",
        action="store_true",
        help="Replay event_log into CQRS projections after migration",
    )
    parser.add_argument(
        "--limit", type=int, default=0, help="Optional maximum count_lines to process"
    )
    parser.add_argument(
        "--session-id", help="Optional single session scope for backfill and validation"
    )
    parser.add_argument("--report-file", help="Optional path to write the JSON report")
    return parser


def _line_identifier(document: dict[str, Any]) -> str:
    return str(document.get("id") or document.get("_id") or "")


def _event_lookup_query(event_idempotency_key: str) -> dict[str, Any]:
    return {
        "$or": [
            {"idempotency_key": event_idempotency_key},
            {"metadata.idempotency_key": event_idempotency_key},
            {"metadata.event_idempotency_key": event_idempotency_key},
        ]
    }


async def _event_exists(db: Any, *, event_idempotency_key: str) -> bool:
    existing = await db.event_log.find_one(_event_lookup_query(event_idempotency_key))
    return isinstance(existing, dict)


def _build_event_specs(count_line: dict[str, Any]) -> list[dict[str, Any]]:
    legacy_key = f"legacy-import:{_line_identifier(count_line)}"
    payload = {
        "session_id": count_line.get("session_id"),
        "item_id": count_line.get("item_code") or count_line.get("item_id"),
        "batch_id": count_line.get("batch_id"),
        "count_line_id": _line_identifier(count_line),
        "count_line": count_line,
        "before": None,
        "after": count_line,
        "serial_numbers": count_line.get("serial_numbers") or [],
        "delta": {
            "counted_qty": float(count_line.get("counted_qty") or 0.0),
            "damaged_qty": float(count_line.get("damaged_qty") or 0.0),
            "serial_count": len(count_line.get("serial_numbers") or []),
        },
    }
    base_metadata = {
        "request_idempotency_key": count_line.get("idempotency_key"),
        "legacy_source": "count_lines_backfill",
        "user_id": count_line.get("counted_by") or count_line.get("created_by"),
        "scan_fingerprint": count_line.get("semantic_hash"),
    }

    specs = [
        {
            "aggregate_id": str(count_line.get("item_code") or "unknown-item"),
            "event_type": "SCAN_ADDED",
            "payload": payload,
            "metadata": {
                **base_metadata,
                "event_idempotency_key": legacy_key,
            },
        }
    ]
    if abs(float(count_line.get("variance") or 0.0)) > 0:
        specs.append(
            {
                "aggregate_id": str(count_line.get("item_code") or "unknown-item"),
                "event_type": "VARIANCE_DETECTED",
                "payload": payload,
                "metadata": {
                    **base_metadata,
                    "event_idempotency_key": f"{legacy_key}:variance",
                },
            }
        )
    if float(count_line.get("damaged_qty") or 0.0) > 0:
        specs.append(
            {
                "aggregate_id": str(count_line.get("item_code") or "unknown-item"),
                "event_type": "DAMAGE_MARKED",
                "payload": payload,
                "metadata": {
                    **base_metadata,
                    "event_idempotency_key": f"{legacy_key}:damage",
                },
            }
        )
    if str(count_line.get("approval_status") or "").strip().upper() == "APPROVED":
        specs.append(
            {
                "aggregate_id": str(count_line.get("item_code") or "unknown-item"),
                "event_type": "APPROVAL_GRANTED",
                "payload": payload,
                "metadata": {
                    **base_metadata,
                    "event_idempotency_key": f"{legacy_key}:approval",
                },
            }
        )
    return specs


async def _backfill(
    *,
    execute: bool,
    rebuild_projections: bool,
    limit: int,
    session_id: Optional[str],
) -> dict[str, Any]:
    client = AsyncIOMotorClient(settings.MONGO_URL.rstrip("/"))
    db = client[settings.DB_NAME]
    event_service = EventService(db)
    projection_service = ProjectionService(db)

    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id

    migrated_lines = 0
    skipped_lines = 0
    emitted_events = 0
    existing_events = 0

    cursor = db.count_lines.find(query).sort("counted_at", 1)
    if limit > 0:
        cursor = cursor.limit(limit)

    async for count_line in cursor:
        specs = _build_event_specs(count_line)
        pending_specs: list[dict[str, Any]] = []
        for spec in specs:
            event_key = str(spec["metadata"]["event_idempotency_key"])
            if await _event_exists(db, event_idempotency_key=event_key):
                existing_events += 1
                continue
            pending_specs.append(spec)

        if not pending_specs:
            skipped_lines += 1
            continue

        migrated_lines += 1
        if execute:
            for spec in pending_specs:
                await event_service.append_event(
                    aggregate_id=spec["aggregate_id"],
                    event_type=spec["event_type"],
                    payload=spec["payload"],
                    metadata=spec["metadata"],
                    apply_projection=False,
                )
                emitted_events += 1
        else:
            emitted_events += len(pending_specs)

    rebuild_result = None
    if execute and rebuild_projections:
        rebuild_result = await projection_service.rebuild_from_event_log(
            session_id=session_id,
            clear_existing=True,
        )

    validation_report = await build_projection_validation_report(
        db,
        session_id=session_id,
        limit=limit,
    )
    readiness_report = await _build_readiness_report(
        db,
        session_id=session_id,
        validation_report=validation_report,
        estimated_event_volume=emitted_events,
    )
    client.close()
    return {
        "mode": "execute" if execute else "dry_run",
        "session_id": session_id,
        "migrated_count_lines": migrated_lines,
        "skipped_existing_lines": skipped_lines,
        "existing_events_detected": existing_events,
        "emitted_events": emitted_events,
        "rebuild_result": rebuild_result,
        "readiness_report": readiness_report,
        "validation_report": validation_report,
    }


def _normalize_index_key(key: Any) -> list[tuple[str, int]]:
    if isinstance(key, dict):
        return [(str(field), int(direction)) for field, direction in key.items()]
    if isinstance(key, list):
        normalized: list[tuple[str, int]] = []
        for entry in key:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                normalized.append((str(entry[0]), int(entry[1])))
        return normalized
    return []


async def _has_index(
    collection: Any,
    *,
    expected_key: list[tuple[str, int]],
    unique: Optional[bool] = None,
) -> bool:
    cursor = collection.list_indexes()
    async for index in cursor:
        if _normalize_index_key(index.get("key")) != expected_key:
            continue
        if unique is not None and bool(index.get("unique")) != unique:
            continue
        return True
    return False


async def _projection_collection_counts(db: Any, *, session_id: Optional[str]) -> dict[str, int]:
    query = {"session_id": session_id} if session_id else {}
    counts: dict[str, int] = {}
    for collection_name in (*PROJECTION_COLLECTIONS, "event_applied"):
        counts[collection_name] = int(await db[collection_name].count_documents(query))
    return counts


async def _build_readiness_report(
    db: Any,
    *,
    session_id: Optional[str],
    validation_report: dict[str, Any],
    estimated_event_volume: int,
) -> dict[str, Any]:
    projection_counts = await _projection_collection_counts(db, session_id=session_id)
    event_idempotency_index_present = await _has_index(
        db.event_log,
        expected_key=[("metadata.idempotency_key", 1)],
        unique=True,
    )
    serial_registry_index_present = await _has_index(
        db.serial_registry,
        expected_key=[("item_id", 1), ("serial_no", 1)],
        unique=True,
    )
    projection_collections_empty = all(count == 0 for count in projection_counts.values())
    return {
        "event_idempotency_index_present": event_idempotency_index_present,
        "serial_registry_composite_index_present": serial_registry_index_present,
        "projection_collections_empty": projection_collections_empty,
        "projection_collection_counts": projection_counts,
        "validation_is_consistent": bool(
            ((validation_report or {}).get("summary") or {}).get("is_consistent")
        ),
        "estimated_pending_event_volume": int(estimated_event_volume),
    }


def _write_report(report_file: Optional[str], report: dict[str, Any]) -> None:
    if not report_file:
        return
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def main() -> None:
    args = _build_parser().parse_args()
    result = asyncio.run(
        _backfill(
            execute=bool(args.execute),
            rebuild_projections=bool(args.rebuild_projections),
            limit=max(int(args.limit or 0), 0),
            session_id=str(args.session_id).strip() if args.session_id else None,
        )
    )
    _write_report(args.report_file, result)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
