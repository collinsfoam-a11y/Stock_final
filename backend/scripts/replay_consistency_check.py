"""
Verify that replaying event_log produces identical projection state on repeated rebuilds.

Safe by default:
- dry-run unless --execute is provided
- mismatches are reported, never auto-fixed
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

from backend.config import settings
from backend.scripts.v31_projection_validation import build_projection_state_snapshot
from backend.services.projection_service import ProjectionService


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute", action="store_true", help="Rebuild projections twice and compare"
    )
    parser.add_argument("--session-id", help="Optional single session scope")
    parser.add_argument("--report-file", help="Optional path to write the JSON report")
    return parser


def _write_report(report_file: str | None, report: dict[str, Any]) -> None:
    if not report_file:
        return
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def _diff_section(
    section: str,
    first_rows: list[dict[str, Any]],
    second_rows: list[dict[str, Any]],
    *,
    key_fields: tuple[str, ...],
) -> list[dict[str, Any]]:
    first_map = {
        tuple(str(row.get(field) or "") for field in key_fields): row for row in first_rows
    }
    second_map = {
        tuple(str(row.get(field) or "") for field in key_fields): row for row in second_rows
    }

    differences: list[dict[str, Any]] = []
    for key in sorted(set(first_map.keys()) | set(second_map.keys())):
        first_row = first_map.get(key)
        second_row = second_map.get(key)
        if first_row != second_row:
            differences.append(
                {
                    "section": section,
                    "key": {field: key[idx] for idx, field in enumerate(key_fields)},
                    "first": first_row,
                    "second": second_row,
                }
            )
    return differences


def _diff_snapshots(first: dict[str, Any], second: dict[str, Any]) -> list[dict[str, Any]]:
    differences: list[dict[str, Any]] = []
    differences.extend(
        _diff_section(
            "items",
            list(first.get("items") or []),
            list(second.get("items") or []),
            key_fields=("session_id", "item_code"),
        )
    )
    differences.extend(
        _diff_section(
            "batches",
            list(first.get("batches") or []),
            list(second.get("batches") or []),
            key_fields=("session_id", "item_code", "batch_id"),
        )
    )
    differences.extend(
        _diff_section(
            "serials",
            list(first.get("serials") or []),
            list(second.get("serials") or []),
            key_fields=("session_id", "item_code", "serial_no"),
        )
    )
    return differences


async def _run(*, execute: bool, session_id: str | None) -> dict[str, Any]:
    if not execute:
        return {
            "mode": "dry_run",
            "session_id": session_id,
            "ready": False,
            "message": "Replay consistency check requires --execute because it rebuilds projections.",
        }

    client = AsyncIOMotorClient(settings.MONGO_URL.rstrip("/"))
    db = client[settings.DB_NAME]
    projection_service = ProjectionService(db)
    try:
        first_rebuild = await projection_service.rebuild_from_event_log(
            session_id=session_id,
            clear_existing=True,
        )
        first_snapshot = await build_projection_state_snapshot(db, session_id=session_id)

        second_rebuild = await projection_service.rebuild_from_event_log(
            session_id=session_id,
            clear_existing=True,
        )
        second_snapshot = await build_projection_state_snapshot(db, session_id=session_id)

        differences = _diff_snapshots(first_snapshot, second_snapshot)
        return {
            "mode": "execute",
            "session_id": session_id,
            "first_rebuild": first_rebuild,
            "second_rebuild": second_rebuild,
            "is_consistent": not differences,
            "difference_count": len(differences),
            "differences": differences[:200],
        }
    finally:
        client.close()


def main() -> None:
    args = _build_parser().parse_args()
    result = asyncio.run(
        _run(
            execute=bool(args.execute),
            session_id=str(args.session_id).strip() if args.session_id else None,
        )
    )
    _write_report(args.report_file, result)
    print(json.dumps(result, indent=2, default=str))
    if result.get("mode") == "execute" and not result.get("is_consistent", False):
        sys.exit(1)


if __name__ == "__main__":
    main()
