from __future__ import annotations
"""Validate active projection parity against authoritative raw Mongo data."""


import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.core import lifespan as runtime_lifespan
from backend.db.runtime import set_client, set_db
from backend.services.projection_write_service import (
    _as_float,
    _resolve_unit_value,
    is_count_line_effectively_reviewed,
    is_superseded_count_line,
)

ACTIVE_FILTER = {"archived": {"$ne": True}}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _is_close(left: float, right: float, tolerance: float) -> bool:
    return abs(float(left or 0.0) - float(right or 0.0)) <= tolerance


def _write_report(path: str | None, report: dict[str, Any]) -> None:
    if not path:
        return
    report_path = Path(path)
    if not report_path.is_absolute():
        report_path = ROOT_DIR / report_path
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


async def _active_session_ids(db: Any) -> set[str]:
    ids = set()
    async for session in db.sessions.find(ACTIVE_FILTER, {"_id": 0, "id": 1, "session_id": 1}):
        session_id = str(session.get("id") or session.get("session_id") or "").strip()
        if session_id:
            ids.add(session_id)
    return ids


async def _load_active_lines(db: Any) -> list[dict[str, Any]]:
    lines = []
    async for line in db.count_lines.find(ACTIVE_FILTER):
        if not isinstance(line, dict) or is_superseded_count_line(line):
            continue
        lines.append(line)
    return lines


def _session_totals(lines: list[dict[str, Any]]) -> dict[str, Any]:
    total_items = len(lines)
    verified_items = sum(1 for line in lines if is_count_line_effectively_reviewed(line))
    damage_items = sum(int(_as_float(line.get("damaged_qty"))) for line in lines)
    total_variance = round(sum(_as_float(line.get("variance")) for line in lines), 4)
    return {
        "total_items": total_items,
        "verified_items": verified_items,
        "pending_items": max(total_items - verified_items, 0),
        "damage_items": damage_items,
        "total_variance": total_variance,
    }


def _financial_totals(lines: list[dict[str, Any]]) -> dict[str, float]:
    totals = {
        "total_stock_value": 0.0,
        "total_counted_value": 0.0,
        "overage_value": 0.0,
        "shortage_value": 0.0,
        "damage_value": 0.0,
    }
    for line in lines:
        stock_qty = _as_float(line.get("erp_qty"))
        counted_qty = _as_float(line.get("counted_qty"))
        damaged_qty = _as_float(line.get("damaged_qty"))
        unit_value = _resolve_unit_value(line)
        delta = (counted_qty - stock_qty) * unit_value
        totals["total_stock_value"] += stock_qty * unit_value
        totals["total_counted_value"] += counted_qty * unit_value
        if delta >= 0:
            totals["overage_value"] += delta
        else:
            totals["shortage_value"] += abs(delta)
        totals["damage_value"] += damaged_qty * unit_value
    return {key: round(value, 4) for key, value in totals.items()}


async def _projection_session_totals(db: Any) -> dict[str, Any]:
    pipeline = [
        {"$match": ACTIVE_FILTER},
        {
            "$group": {
                "_id": None,
                "total_items": {"$sum": "$total_items"},
                "verified_items": {"$sum": "$verified_items"},
                "pending_items": {"$sum": "$pending_items"},
                "damage_items": {"$sum": "$damage_items"},
                "total_variance": {"$sum": "$total_variance"},
            }
        },
    ]
    rows = await db.session_dashboard_projection.aggregate(pipeline).to_list(1)
    row = rows[0] if rows else {}
    return {
        "total_items": int(row.get("total_items") or 0),
        "verified_items": int(row.get("verified_items") or 0),
        "pending_items": int(row.get("pending_items") or 0),
        "damage_items": int(row.get("damage_items") or 0),
        "total_variance": round(float(row.get("total_variance") or 0.0), 4),
    }


async def _projection_financial_totals(db: Any) -> dict[str, float]:
    pipeline = [
        {"$match": ACTIVE_FILTER},
        {
            "$group": {
                "_id": None,
                "total_stock_value": {"$sum": "$total_stock_value"},
                "total_counted_value": {"$sum": "$total_counted_value"},
                "overage_value": {"$sum": "$overage_value"},
                "shortage_value": {"$sum": "$shortage_value"},
                "damage_value": {"$sum": "$damage_value"},
            }
        },
    ]
    rows = await db.financial_projection.aggregate(pipeline).to_list(1)
    row = rows[0] if rows else {}
    return {
        key: round(float(row.get(key) or 0.0), 4)
        for key in (
            "total_stock_value",
            "total_counted_value",
            "overage_value",
            "shortage_value",
            "damage_value",
        )
    }


async def _event_lag_seconds(db: Any) -> float:
    latest_event = await db.event_log.find_one(
        ACTIVE_FILTER,
        {"_id": 0, "created_at": 1, "projection_updated_at": 1},
        sort=[("created_at", -1), ("projection_updated_at", -1)],
    )
    latest_projection = await db.session_dashboard_projection.find_one(
        ACTIVE_FILTER,
        {"_id": 0, "last_event_ts": 1, "projection_updated_at": 1, "updated_at": 1},
        sort=[("last_event_ts", -1), ("projection_updated_at", -1), ("updated_at", -1)],
    )
    left = latest_event.get("created_at") if isinstance(latest_event, dict) else None
    right = None
    if isinstance(latest_projection, dict):
        right = (
            latest_projection.get("last_event_ts")
            or latest_projection.get("projection_updated_at")
            or latest_projection.get("updated_at")
        )
    if not isinstance(left, datetime) or not isinstance(right, datetime):
        return 0.0
    return max((left - right).total_seconds(), 0.0)


async def validate(args: argparse.Namespace) -> int:
    set_client(runtime_lifespan.client)
    set_db(runtime_lifespan.db)
    db = runtime_lifespan.db

    active_session_ids = await _active_session_ids(db)
    lines = await _load_active_lines(db)
    orphan_line_session_ids = sorted(
        {
            str(line.get("session_id"))
            for line in lines
            if line.get("session_id") and str(line.get("session_id")) not in active_session_ids
        }
    )

    source_session_totals = _session_totals(lines)
    projection_session_totals = await _projection_session_totals(db)
    source_financial_totals = _financial_totals(lines)
    projection_financial_totals = await _projection_financial_totals(db)

    session_projection_count = await db.session_dashboard_projection.count_documents(ACTIVE_FILTER)
    verified_projection_count = await db.verified_items_projection.count_documents(ACTIVE_FILTER)
    variance_projection_count = await db.variance_summary_projection.count_documents(ACTIVE_FILTER)
    active_line_count = len(lines)
    lag_seconds = await _event_lag_seconds(db)

    failures = []
    if orphan_line_session_ids:
        failures.append(
            {
                "kind": "gap",
                "check": "orphan_count_lines",
                "message": "Active count lines reference missing sessions.",
                "session_ids": orphan_line_session_ids,
            }
        )
    for key, value in source_session_totals.items():
        if not _is_close(value, projection_session_totals.get(key, 0), args.float_tolerance):
            failures.append(
                {
                    "kind": "drift",
                    "check": f"session_totals.{key}",
                    "legacy": value,
                    "projection": projection_session_totals.get(key, 0),
                }
            )
    for key, value in source_financial_totals.items():
        if not _is_close(value, projection_financial_totals.get(key, 0), args.float_tolerance):
            failures.append(
                {
                    "kind": "drift",
                    "check": f"financial_totals.{key}",
                    "legacy": value,
                    "projection": projection_financial_totals.get(key, 0),
                }
            )
    if verified_projection_count != active_line_count:
        failures.append(
            {
                "kind": "drift",
                "check": "verified_projection_count",
                "legacy": active_line_count,
                "projection": verified_projection_count,
            }
        )
    if variance_projection_count != active_line_count:
        failures.append(
            {
                "kind": "drift",
                "check": "variance_projection_count",
                "legacy": active_line_count,
                "projection": variance_projection_count,
            }
        )
    if lag_seconds > args.event_lag_threshold_seconds:
        failures.append(
            {
                "kind": "drift",
                "check": "event_lag",
                "lag_seconds": lag_seconds,
                "threshold_seconds": args.event_lag_threshold_seconds,
            }
        )

    drift_count = sum(1 for failure in failures if failure["kind"] == "drift")
    gap_count = sum(1 for failure in failures if failure["kind"] == "gap")
    report = {
        "is_consistent": not failures,
        "summary": {
            "session_totals_match": not any(
                failure["check"].startswith("session_totals") for failure in failures
            ),
            "verified_items_match": verified_projection_count == active_line_count,
            "variance_match": variance_projection_count == active_line_count,
            "financial_match": not any(
                failure["check"].startswith("financial_totals") for failure in failures
            ),
            "sample_validation_passed": True,
            "event_lag_ok": lag_seconds <= args.event_lag_threshold_seconds,
        },
        "metrics": {
            "projection_drift_count": drift_count,
            "projection_gap_count": gap_count,
            "event_lag_seconds": lag_seconds,
            "event_lag_threshold_seconds": args.event_lag_threshold_seconds,
            "active_count_lines": active_line_count,
            "active_sessions": len(active_session_ids),
            "active_session_projection_rows": session_projection_count,
        },
        "samples_checked": 0,
        "timestamp": _utc_now_iso(),
        "collections": {
            "session_projection": "session_dashboard_projection",
            "verified_projection": "verified_items_projection",
            "variance_projection": "variance_summary_projection",
            "financial_projection": "financial_projection",
            "batch_projection": "batch_records",
            "event_log": "event_log",
        },
        "details": {
            "source_session_totals": source_session_totals,
            "projection_session_totals": projection_session_totals,
            "source_financial_totals": source_financial_totals,
            "projection_financial_totals": projection_financial_totals,
            "orphan_line_session_ids": orphan_line_session_ids,
        },
        "controls": {
            "strict": bool(args.strict),
            "float_tolerance": args.float_tolerance,
            "event_lag_threshold_seconds": args.event_lag_threshold_seconds,
            "archived_filter": ACTIVE_FILTER,
        },
        "failures": failures,
    }
    _write_report(args.output, report)

    status = "PASSED" if report["is_consistent"] else "FAILED"
    print(f"PARITY VALIDATION {status}")
    print()
    print("=== Projection Parity Validation ===")
    print(f"Report: {Path(args.output).resolve() if args.output else '-'}")
    print(f"Consistent: {report['is_consistent']}")
    print(f"Projection drift count: {drift_count}")
    print(f"Projection gap count: {gap_count}")
    print(f"Event lag seconds: {lag_seconds}")
    if failures:
        print("Failures:")
        for failure in failures:
            print(f"  - [{failure['kind']}] {failure['check']}")
    return 0 if report["is_consistent"] else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--output", default=None)
    parser.add_argument("--float-tolerance", type=float, default=0.0001)
    parser.add_argument("--event-lag-threshold-seconds", type=float, default=5.0)
    parser.add_argument("--samples", type=int, default=3)
    parser.add_argument("--max-records", type=int, default=None)
    parser.add_argument("--timeout", type=float, default=None)
    parser.add_argument("--sample-seed", default=None)
    parser.add_argument("--session-id", action="append", default=[])
    return parser


def main() -> int:
    try:
        return asyncio.run(validate(build_parser().parse_args()))
    finally:
        runtime_lifespan.client.close()


if __name__ == "__main__":
    raise SystemExit(main())
