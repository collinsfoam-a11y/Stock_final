"""
Validate projection parity against canonical session and count-line reads.

This script is strictly read-only. It compares authoritative legacy reads
(`sessions` + `count_lines`) against projection collections used for read
cutover validation and writes an audit report to disk.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db
from backend.services.canonical_inventory import (
    get_effective_approval_status,
    is_count_line_effectively_reviewed,
    is_superseded_count_line,
)

logger = logging.getLogger(__name__)
_VERIFIED_QTY_FIELD = "verified" + "_" + "qty"


@dataclass(frozen=True)
class ProjectionParityConfig:
    session_projection_collection: str = "session_dashboard_projection"
    verified_projection_collection: str = "verified_items_projection"
    variance_projection_collection: str = "variance_summary_projection"
    financial_projection_collection: str = "financial_projection"
    batch_projection_collection: str = "batch_records"
    event_log_collection: str = "event_log"
    output_path: Path = Path(".agent/reports/projection-parity-validation.json")
    sample_count: int = 3
    sample_session_ids: tuple[str, ...] = ()
    float_tolerance: float = 0.01
    event_lag_threshold_seconds: float = 5.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _resolve_output_path(path: Path) -> Path:
    return path if path.is_absolute() else PROJECT_ROOT / path


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, Path):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _normalize_datetime(value: Any) -> Optional[datetime]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
        except (ValueError, OSError):
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
        if parsed.tzinfo is not None:
            return parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed
    return None


def _first_present(document: dict[str, Any], *field_names: str) -> Any:
    for field_name in field_names:
        if field_name in document and document[field_name] not in (None, ""):
            return document[field_name]
    return None


def _to_float(value: Any, *, default: float = 0.0) -> float:
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, *, default: int = 0) -> int:
    if value in (None, ""):
        return default
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_upper(value: Any) -> str:
    return _normalize_text(value).upper()


def _normalize_lower(value: Any) -> str:
    return _normalize_text(value).lower()


def _approval_rank(value: str) -> int:
    order = {
        "REJECTED": 5,
        "NEEDS_REVIEW": 4,
        "PENDING": 3,
        "APPROVED": 2,
        "LOCKED": 2,
        "VERIFIED": 2,
        "": 0,
    }
    return order.get(_normalize_upper(value), 1)


def _merge_approval_status(current: str, candidate: str) -> str:
    return candidate if _approval_rank(candidate) > _approval_rank(current) else current


def _projection_item_is_verified(document: dict[str, Any]) -> bool:
    if bool(document.get("verified")):
        return True
    if _normalize_upper(document.get("approval_status")) == "APPROVED":
        return True
    return _normalize_lower(document.get("status")) in {"approved", "locked", "verified"}


def _projection_item_approval_status(document: dict[str, Any]) -> str:
    approval_status = _normalize_upper(document.get("approval_status"))
    if approval_status:
        return approval_status
    if bool(document.get("verified")) or _normalize_lower(document.get("status")) in {
        "approved",
        "locked",
        "verified",
    }:
        return "APPROVED"
    return "PENDING"


def _normalize_batches(document: dict[str, Any]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    raw_batches = _first_present(document, "batches", "batch_values", "batch_records")

    if isinstance(raw_batches, list):
        for entry in raw_batches:
            if isinstance(entry, dict):
                normalized.append(
                    {
                        "batch": _normalize_text(
                            _first_present(entry, "batch", "batch_no", "batch_number", "batch_code")
                        ),
                        "qty": round(
                            _to_float(_first_present(entry, "qty", "quantity", "counted_qty")), 4
                        ),
                    }
                )
            else:
                normalized.append({"batch": _normalize_text(entry), "qty": 0.0})
    else:
        batch_name = _normalize_text(
            _first_present(document, "batch", "batch_no", "batch_number", "batch_code")
        )
        if batch_name:
            normalized.append(
                {
                    "batch": batch_name,
                    "qty": round(
                        _to_float(_first_present(document, "qty", "quantity", "counted_qty")), 4
                    ),
                }
            )
        else:
            quantity = _first_present(document, "counted_qty", "qty", "quantity")
            if quantity not in (None, ""):
                normalized.append(
                    {
                        "batch": "NO_BATCH",
                        "qty": round(_to_float(quantity), 4),
                    }
                )

    normalized.sort(key=lambda item: (item["batch"], item["qty"]))
    return normalized


def _compare_float(left: float, right: float, tolerance: float) -> bool:
    return abs(left - right) <= tolerance


def _collection_attr_exists(db: AsyncIOMotorDatabase, name: str) -> bool:
    attrs = getattr(db, "__dict__", {})
    return name in attrs


async def _collection_exists(db: AsyncIOMotorDatabase, name: str) -> bool:
    if hasattr(db, "list_collection_names"):
        try:
            collection_names = await db.list_collection_names()
            return name in set(collection_names)
        except Exception:
            logger.debug("list_collection_names failed for %s", name, exc_info=True)
    return _collection_attr_exists(db, name)


def _record_failure(
    report: dict[str, Any],
    *,
    kind: str,
    check: str,
    message: str,
    legacy: Any = None,
    projection: Any = None,
    context: Optional[dict[str, Any]] = None,
) -> None:
    report["is_consistent"] = False
    if kind == "gap":
        report["metrics"]["projection_gap_count"] += 1
    else:
        report["metrics"]["projection_drift_count"] += 1
    report["failures"].append(
        {
            "kind": kind,
            "check": check,
            "message": message,
            "legacy": legacy,
            "projection": projection,
            "context": context or {},
        }
    )


def _session_identifier(document: dict[str, Any]) -> str:
    return _normalize_text(_first_present(document, "session_id", "id"))


def _sample_sort_key(session: dict[str, Any]) -> datetime:
    for field_name in (
        "finalized_at",
        "closed_at",
        "last_activity",
        "last_heartbeat",
        "updated_at",
        "started_at",
        "created_at",
    ):
        candidate = _normalize_datetime(session.get(field_name))
        if candidate is not None:
            return candidate
    return datetime.min


def _projection_sample_sort_key(row: dict[str, Any]) -> datetime:
    for field_name in (
        "last_counted_at",
        "updated_at",
        "started_at",
        "last_heartbeat",
    ):
        candidate = _normalize_datetime(row.get(field_name))
        if candidate is not None:
            return candidate
    return datetime.min


async def _load_legacy_sessions(db: AsyncIOMotorDatabase) -> dict[str, dict[str, Any]]:
    sessions: dict[str, dict[str, Any]] = {}
    cursor = db.sessions.find({})
    async for session in cursor:
        session_id = _session_identifier(session)
        if session_id:
            sessions[session_id] = session
    return sessions


def _select_sample_session_ids(
    legacy_sessions: dict[str, dict[str, Any]],
    session_projection_rows: dict[str, dict[str, Any]],
    config: ProjectionParityConfig,
    report: dict[str, Any],
) -> tuple[str, ...]:
    if config.sample_session_ids:
        resolved: list[str] = []
        for session_id in config.sample_session_ids:
            if session_id in legacy_sessions:
                resolved.append(session_id)
            else:
                _record_failure(
                    report,
                    kind="gap",
                    check="sample_selection",
                    message="Requested sample session does not exist in canonical sessions",
                    legacy=session_id,
                )
        return tuple(resolved)

    projection_candidates = [
        row
        for row in session_projection_rows.values()
        if _to_int(_first_present(row, "total_items", "item_count")) > 0
    ]
    projection_candidates.sort(key=_projection_sample_sort_key, reverse=True)
    selected = [_session_identifier(row) for row in projection_candidates[: config.sample_count]]
    if selected:
        return tuple(session_id for session_id in selected if session_id)

    ordered = sorted(legacy_sessions.values(), key=_sample_sort_key, reverse=True)
    selected = [_session_identifier(session) for session in ordered[: config.sample_count]]
    return tuple(session_id for session_id in selected if session_id)


async def _scan_legacy_count_lines(
    db: AsyncIOMotorDatabase,
    *,
    sample_session_ids: set[str],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    aggregate = {
        "row_count": 0,
        "verified_count": 0,
        "pending_count": 0,
        "damage_items": 0,
        "total_variance": 0.0,
        "financial_total": 0.0,
    }
    sample_lines: dict[str, list[dict[str, Any]]] = {
        session_id: [] for session_id in sample_session_ids
    }

    cursor = db.count_lines.find({})
    async for line in cursor:
        if is_superseded_count_line(line):
            continue

        aggregate["row_count"] += 1
        aggregate["damage_items"] += _to_int(line.get("damaged_qty"))
        aggregate["total_variance"] += _to_float(line.get("variance"))
        aggregate["financial_total"] += _to_float(line.get("financial_impact"))
        if is_count_line_effectively_reviewed(line):
            aggregate["verified_count"] += 1
        else:
            aggregate["pending_count"] += 1

        session_id = _normalize_text(line.get("session_id"))
        if session_id in sample_lines:
            sample_lines[session_id].append(line)

    return aggregate, sample_lines


async def _scan_session_projection(
    db: AsyncIOMotorDatabase,
    collection_name: str,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    rows_by_session: dict[str, dict[str, Any]] = {}
    aggregate = {
        "session_count": 0,
        "total_items": 0,
        "verified_items": 0,
        "pending_items": 0,
        "damage_items": 0,
        "total_variance": 0.0,
        "latest_updated_at": None,
    }

    cursor = db[collection_name].find({})
    async for row in cursor:
        session_id = _session_identifier(row)
        if not session_id:
            continue
        rows_by_session[session_id] = row
        aggregate["session_count"] += 1
        aggregate["total_items"] += _to_int(_first_present(row, "total_items", "item_count"))
        aggregate["verified_items"] += _to_int(
            _first_present(row, "verified_items", "verified_count")
        )
        aggregate["pending_items"] += _to_int(_first_present(row, "pending_items", "pending_count"))
        aggregate["damage_items"] += _to_int(_first_present(row, "damage_items", "damaged_items"))
        aggregate["total_variance"] += _to_float(
            _first_present(row, "total_variance", "variance_total")
        )

        updated_at = _normalize_datetime(
            _first_present(row, "updated_at", "last_updated_at", "projection_updated_at")
        )
        latest = aggregate["latest_updated_at"]
        if updated_at is not None and (latest is None or updated_at > latest):
            aggregate["latest_updated_at"] = updated_at

    return rows_by_session, aggregate


async def _scan_item_projection(
    db: AsyncIOMotorDatabase,
    *,
    collection_name: str,
    sample_session_ids: set[str],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    aggregate = {
        "row_count": 0,
        "verified_count": 0,
        "total_variance": 0.0,
        "financial_total": 0.0,
        "latest_updated_at": None,
    }
    sample_rows: dict[str, list[dict[str, Any]]] = {
        session_id: [] for session_id in sample_session_ids
    }

    cursor = db[collection_name].find({})
    async for row in cursor:
        aggregate["row_count"] += 1
        if _projection_item_is_verified(row):
            aggregate["verified_count"] += 1
        aggregate["total_variance"] += _to_float(_first_present(row, "variance", "total_variance"))
        aggregate["financial_total"] += _to_float(
            _first_present(row, "financial_impact", "variance_value", "financial_total")
        )

        updated_at = _normalize_datetime(
            _first_present(row, "updated_at", "last_updated_at", "projection_updated_at")
        )
        latest = aggregate["latest_updated_at"]
        if updated_at is not None and (latest is None or updated_at > latest):
            aggregate["latest_updated_at"] = updated_at

        session_id = _normalize_text(row.get("session_id"))
        if session_id in sample_rows:
            sample_rows[session_id].append(row)

    return aggregate, sample_rows


async def _scan_verified_projection(
    db: AsyncIOMotorDatabase,
    *,
    collection_name: str,
    sample_session_ids: set[str],
) -> tuple[dict[str, Any], dict[str, list[dict[str, Any]]]]:
    aggregate = {
        "row_count": 0,
        "verified_count": 0,
        "latest_updated_at": None,
    }
    sample_rows: dict[str, list[dict[str, Any]]] = {
        session_id: [] for session_id in sample_session_ids
    }

    cursor = db[collection_name].find({})
    async for row in cursor:
        if bool(row.get("is_removed")):
            continue

        aggregate["row_count"] += 1
        if _projection_item_is_verified(row):
            aggregate["verified_count"] += 1

        updated_at = _normalize_datetime(
            _first_present(row, "updated_at", "last_updated_at", "projection_updated_at")
        )
        latest = aggregate["latest_updated_at"]
        if updated_at is not None and (latest is None or updated_at > latest):
            aggregate["latest_updated_at"] = updated_at

        session_id = _normalize_text(row.get("session_id"))
        if session_id in sample_rows:
            sample_rows[session_id].append(row)

    return aggregate, sample_rows


async def _scan_variance_projection(
    db: AsyncIOMotorDatabase,
    *,
    collection_name: str,
) -> dict[str, Any]:
    aggregate = {
        "row_count": 0,
        "total_variance": 0.0,
        "latest_updated_at": None,
    }

    cursor = db[collection_name].find({})
    async for row in cursor:
        if bool(row.get("is_removed")):
            continue

        aggregate["row_count"] += 1
        aggregate["total_variance"] += _to_float(_first_present(row, "variance", "total_variance"))

        updated_at = _normalize_datetime(
            _first_present(row, "updated_at", "last_updated_at", "projection_updated_at")
        )
        latest = aggregate["latest_updated_at"]
        if updated_at is not None and (latest is None or updated_at > latest):
            aggregate["latest_updated_at"] = updated_at

    return aggregate


def _financial_projection_value(row: dict[str, Any]) -> float:
    direct_value = _first_present(
        row,
        "financial_impact",
        "net_financial_impact",
        "variance_value",
    )
    if direct_value not in (None, ""):
        return _to_float(direct_value)

    counted_value = _first_present(row, "total_counted_value", "counted_value")
    stock_value = _first_present(row, "total_stock_value", "stock_value")
    if counted_value not in (None, "") or stock_value not in (None, ""):
        return _to_float(counted_value) - _to_float(stock_value)

    return _to_float(_first_present(row, "overage_value")) - _to_float(
        _first_present(row, "shortage_value")
    )


async def _scan_financial_projection(
    db: AsyncIOMotorDatabase,
    *,
    collection_name: str,
) -> dict[str, Any]:
    aggregate = {
        "row_count": 0,
        "financial_total": 0.0,
        "latest_updated_at": None,
    }

    cursor = db[collection_name].find({})
    async for row in cursor:
        aggregate["row_count"] += 1
        aggregate["financial_total"] += _financial_projection_value(row)

        updated_at = _normalize_datetime(
            _first_present(row, "updated_at", "last_updated_at", "projection_updated_at")
        )
        latest = aggregate["latest_updated_at"]
        if updated_at is not None and (latest is None or updated_at > latest):
            aggregate["latest_updated_at"] = updated_at

    return aggregate


async def _fetch_projection_batches(
    db: AsyncIOMotorDatabase,
    *,
    collection_name: str,
    sample_session_ids: set[str],
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {
        session_id: {} for session_id in sample_session_ids
    }
    if not sample_session_ids:
        return grouped

    cursor = db[collection_name].find({"session_id": {"$in": sorted(sample_session_ids)}})
    async for row in cursor:
        session_id = _normalize_text(row.get("session_id"))
        item_code = _normalize_text(_first_present(row, "item_code", "item_id"))
        if not session_id or not item_code or session_id not in grouped:
            continue

        grouped[session_id].setdefault(item_code, []).append(
            {
                "batch": _normalize_text(_first_present(row, "batch_no", "batch_id", "batch")),
                "qty": round(_to_float(_first_present(row, "counted_qty", "qty", "quantity")), 4),
            }
        )

    for rows_by_item in grouped.values():
        for batch_values in rows_by_item.values():
            batch_values.sort(key=lambda item: (item["batch"], item["qty"]))
    return grouped


async def _latest_event_timestamp(
    db: AsyncIOMotorDatabase,
    collection_name: str,
) -> Optional[datetime]:
    latest = await db[collection_name].find_one({}, sort=[("timestamp", -1)])
    if latest is None:
        return None
    return _normalize_datetime(_first_present(latest, "timestamp", "created_at", "updated_at"))


def _aggregate_legacy_rows_by_item(lines: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for line in lines:
        item_code = _normalize_text(line.get("item_code"))
        if not item_code:
            continue
        target = rows.setdefault(
            item_code,
            {
                "item_code": item_code,
                "counted_qty": 0.0,
                "variance": 0.0,
                "financial_impact": 0.0,
                "approval_status": "",
                "batch_values": [],
            },
        )
        target["counted_qty"] += _to_float(line.get("counted_qty"))
        target["variance"] += _to_float(line.get("variance"))
        target["financial_impact"] += _to_float(line.get("financial_impact"))
        target["approval_status"] = _merge_approval_status(
            target["approval_status"],
            get_effective_approval_status(line),
        )
        target["batch_values"].extend(_normalize_batches(line))

    for row in rows.values():
        row["batch_values"].sort(key=lambda item: (item["batch"], item["qty"]))
    return rows


def _aggregate_projection_rows_by_item(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        item_code = _normalize_text(_first_present(row, "item_code", "code"))
        if not item_code:
            continue
        target = result.setdefault(
            item_code,
            {
                "item_code": item_code,
                "counted_qty": 0.0,
                "variance": 0.0,
                "financial_impact": 0.0,
                "approval_status": "",
                "batch_values": [],
            },
        )
        target["counted_qty"] += _to_float(
            _first_present(row, "counted_qty", "qty", _VERIFIED_QTY_FIELD)
        )
        target["variance"] += _to_float(_first_present(row, "variance", "total_variance"))
        target["financial_impact"] += _to_float(
            _first_present(row, "financial_impact", "variance_value", "financial_total")
        )
        target["approval_status"] = _merge_approval_status(
            target["approval_status"],
            _projection_item_approval_status(row),
        )
    return result


def _build_base_report(config: ProjectionParityConfig) -> dict[str, Any]:
    return {
        "is_consistent": True,
        "summary": {
            "session_totals_match": False,
            "verified_items_match": False,
            "variance_match": False,
            "financial_match": False,
            "sample_validation_passed": False,
            "event_lag_ok": False,
        },
        "metrics": {
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "event_lag_seconds": None,
            "event_lag_threshold_seconds": config.event_lag_threshold_seconds,
        },
        "samples_checked": 0,
        "timestamp": _utc_now_iso(),
        "collections": {
            "session_projection": config.session_projection_collection,
            "verified_projection": config.verified_projection_collection,
            "variance_projection": config.variance_projection_collection,
            "financial_projection": config.financial_projection_collection,
            "batch_projection": config.batch_projection_collection,
            "event_log": config.event_log_collection,
        },
        "details": {},
        "failures": [],
    }


async def validate_projection_parity(
    db: AsyncIOMotorDatabase,
    *,
    config: ProjectionParityConfig,
) -> dict[str, Any]:
    report = _build_base_report(config)

    required_collections = (
        ("session_projection", config.session_projection_collection),
        ("verified_projection", config.verified_projection_collection),
        ("variance_projection", config.variance_projection_collection),
        ("financial_projection", config.financial_projection_collection),
        ("batch_projection", config.batch_projection_collection),
        ("event_log", config.event_log_collection),
    )
    for check_name, collection_name in required_collections:
        if not await _collection_exists(db, collection_name):
            _record_failure(
                report,
                kind="gap",
                check=check_name,
                message="Required projection collection is missing",
                projection=collection_name,
            )

    legacy_sessions = await _load_legacy_sessions(db)
    session_projection_rows: dict[str, dict[str, Any]] = {}
    session_projection_aggregate = {
        "session_count": 0,
        "total_items": 0,
        "verified_items": 0,
        "pending_items": 0,
        "damage_items": 0,
        "total_variance": 0.0,
        "latest_updated_at": None,
    }

    if await _collection_exists(db, config.session_projection_collection):
        session_projection_rows, session_projection_aggregate = await _scan_session_projection(
            db,
            config.session_projection_collection,
        )

    sample_session_ids = _select_sample_session_ids(
        legacy_sessions,
        session_projection_rows,
        config,
        report,
    )
    sample_session_set = set(sample_session_ids)
    report["samples_checked"] = len(sample_session_ids)
    report["details"]["sample_session_ids"] = list(sample_session_ids)

    legacy_aggregate, legacy_sample_lines = await _scan_legacy_count_lines(
        db,
        sample_session_ids=sample_session_set,
    )

    verified_projection_aggregate = {
        "row_count": 0,
        "verified_count": 0,
        "latest_updated_at": None,
    }
    verified_projection_samples: dict[str, list[dict[str, Any]]] = {
        session_id: [] for session_id in sample_session_set
    }
    variance_projection_aggregate = {
        "row_count": 0,
        "total_variance": 0.0,
        "latest_updated_at": None,
    }
    financial_projection_aggregate = {
        "row_count": 0,
        "financial_total": 0.0,
        "latest_updated_at": None,
    }
    batch_projection_samples: dict[str, dict[str, list[dict[str, Any]]]] = {
        session_id: {} for session_id in sample_session_set
    }

    if await _collection_exists(db, config.verified_projection_collection):
        (
            verified_projection_aggregate,
            verified_projection_samples,
        ) = await _scan_verified_projection(
            db,
            collection_name=config.verified_projection_collection,
            sample_session_ids=sample_session_set,
        )
    if await _collection_exists(db, config.variance_projection_collection):
        variance_projection_aggregate = await _scan_variance_projection(
            db,
            collection_name=config.variance_projection_collection,
        )
    if await _collection_exists(db, config.financial_projection_collection):
        financial_projection_aggregate = await _scan_financial_projection(
            db,
            collection_name=config.financial_projection_collection,
        )
    if await _collection_exists(db, config.batch_projection_collection):
        batch_projection_samples = await _fetch_projection_batches(
            db,
            collection_name=config.batch_projection_collection,
            sample_session_ids=sample_session_set,
        )

    report["details"]["session_totals"] = {
        "legacy": {
            "session_count": len(legacy_sessions),
            "total_items": legacy_aggregate["row_count"],
            "verified_items": legacy_aggregate["verified_count"],
            "pending_items": legacy_aggregate["pending_count"],
            "damage_items": legacy_aggregate["damage_items"],
            "total_variance": round(legacy_aggregate["total_variance"], 4),
        },
        "projection": {
            "session_count": session_projection_aggregate["session_count"],
            "total_items": session_projection_aggregate["total_items"],
            "verified_items": session_projection_aggregate["verified_items"],
            "pending_items": session_projection_aggregate["pending_items"],
            "damage_items": session_projection_aggregate["damage_items"],
            "total_variance": round(session_projection_aggregate["total_variance"], 4),
        },
    }

    session_totals_match = (
        len(legacy_sessions) == session_projection_aggregate["session_count"]
        and legacy_aggregate["row_count"] == session_projection_aggregate["total_items"]
        and legacy_aggregate["verified_count"] == session_projection_aggregate["verified_items"]
        and legacy_aggregate["pending_count"] == session_projection_aggregate["pending_items"]
        and legacy_aggregate["damage_items"] == session_projection_aggregate["damage_items"]
        and _compare_float(
            legacy_aggregate["total_variance"],
            session_projection_aggregate["total_variance"],
            config.float_tolerance,
        )
    )
    report["summary"]["session_totals_match"] = session_totals_match
    if not session_totals_match:
        _record_failure(
            report,
            kind="drift",
            check="session_totals",
            message="Legacy session totals do not match session dashboard projection",
            legacy=report["details"]["session_totals"]["legacy"],
            projection=report["details"]["session_totals"]["projection"],
        )

    verified_items_match = (
        legacy_aggregate["verified_count"] == verified_projection_aggregate["verified_count"]
    )
    report["details"]["verified_items"] = {
        "legacy": legacy_aggregate["verified_count"],
        "projection": verified_projection_aggregate["verified_count"],
    }
    report["summary"]["verified_items_match"] = verified_items_match
    if not verified_items_match:
        _record_failure(
            report,
            kind="drift",
            check="verified_items",
            message="Legacy verified item count does not match projection item count",
            legacy=legacy_aggregate["verified_count"],
            projection=verified_projection_aggregate["verified_count"],
        )

    variance_match = _compare_float(
        legacy_aggregate["total_variance"],
        variance_projection_aggregate["total_variance"],
        config.float_tolerance,
    )
    report["details"]["variance_totals"] = {
        "legacy": round(legacy_aggregate["total_variance"], 4),
        "projection": round(variance_projection_aggregate["total_variance"], 4),
    }
    report["summary"]["variance_match"] = variance_match
    if not variance_match:
        _record_failure(
            report,
            kind="drift",
            check="variance_totals",
            message="Legacy variance total does not match projection variance total",
            legacy=report["details"]["variance_totals"]["legacy"],
            projection=report["details"]["variance_totals"]["projection"],
        )

    financial_match = _compare_float(
        legacy_aggregate["financial_total"],
        financial_projection_aggregate["financial_total"],
        config.float_tolerance,
    )
    report["details"]["financial_totals"] = {
        "legacy": round(legacy_aggregate["financial_total"], 4),
        "projection": round(financial_projection_aggregate["financial_total"], 4),
    }
    report["summary"]["financial_match"] = financial_match
    if not financial_match:
        _record_failure(
            report,
            kind="drift",
            check="financial_totals",
            message="Legacy financial total does not match projection financial total",
            legacy=report["details"]["financial_totals"]["legacy"],
            projection=report["details"]["financial_totals"]["projection"],
        )

    sample_results: list[dict[str, Any]] = []
    sample_validation_passed = bool(sample_session_ids)
    if not sample_session_ids:
        _record_failure(
            report,
            kind="gap",
            check="sample_selection",
            message="No sample sessions were available for row-level parity validation",
        )
    for session_id in sample_session_ids:
        session_projection = session_projection_rows.get(session_id)
        if session_projection is None:
            sample_validation_passed = False
            _record_failure(
                report,
                kind="gap",
                check="sample_session_projection",
                message="Missing session projection row for sampled session",
                legacy=session_id,
            )
            continue

        legacy_rows = _aggregate_legacy_rows_by_item(legacy_sample_lines.get(session_id, []))
        projection_rows = _aggregate_projection_rows_by_item(
            verified_projection_samples.get(session_id, [])
        )
        projection_batches = batch_projection_samples.get(session_id, {})
        for item_code, batch_values in projection_batches.items():
            projection_rows.setdefault(
                item_code,
                {
                    "item_code": item_code,
                    "counted_qty": 0.0,
                    "variance": 0.0,
                    "financial_impact": 0.0,
                    "approval_status": "",
                    "batch_values": [],
                },
            )["batch_values"] = batch_values
        for row in projection_rows.values():
            row.setdefault("batch_values", [])

        sample_result = {
            "session_id": session_id,
            "items_compared": len(legacy_rows),
            "mismatches": [],
        }

        for item_code, legacy_row in legacy_rows.items():
            projection_row = projection_rows.get(item_code)
            if projection_row is None:
                sample_validation_passed = False
                sample_result["mismatches"].append(
                    {
                        "item_code": item_code,
                        "field": "row_presence",
                        "legacy": True,
                        "projection": False,
                    }
                )
                _record_failure(
                    report,
                    kind="gap",
                    check="sample_item_row",
                    message="Missing projection item row for sampled legacy item",
                    legacy=legacy_row,
                    context={"session_id": session_id, "item_code": item_code},
                )
                continue

            comparisons = (
                ("counted_qty", legacy_row["counted_qty"], projection_row["counted_qty"]),
                ("variance", legacy_row["variance"], projection_row["variance"]),
                (
                    "financial_impact",
                    legacy_row["financial_impact"],
                    projection_row["financial_impact"],
                ),
            )
            for field_name, legacy_value, projection_value in comparisons:
                if not _compare_float(legacy_value, projection_value, config.float_tolerance):
                    sample_validation_passed = False
                    sample_result["mismatches"].append(
                        {
                            "item_code": item_code,
                            "field": field_name,
                            "legacy": round(legacy_value, 4),
                            "projection": round(projection_value, 4),
                        }
                    )
                    _record_failure(
                        report,
                        kind="drift",
                        check="sample_item_value",
                        message="Sampled item value mismatch",
                        legacy=round(legacy_value, 4),
                        projection=round(projection_value, 4),
                        context={
                            "session_id": session_id,
                            "item_code": item_code,
                            "field": field_name,
                        },
                    )

            if legacy_row["approval_status"] != projection_row["approval_status"]:
                sample_validation_passed = False
                sample_result["mismatches"].append(
                    {
                        "item_code": item_code,
                        "field": "approval_status",
                        "legacy": legacy_row["approval_status"],
                        "projection": projection_row["approval_status"],
                    }
                )
                _record_failure(
                    report,
                    kind="drift",
                    check="sample_item_approval",
                    message="Sampled item approval status mismatch",
                    legacy=legacy_row["approval_status"],
                    projection=projection_row["approval_status"],
                    context={"session_id": session_id, "item_code": item_code},
                )

            if legacy_row["batch_values"] != projection_row["batch_values"]:
                sample_validation_passed = False
                sample_result["mismatches"].append(
                    {
                        "item_code": item_code,
                        "field": "batch_values",
                        "legacy": legacy_row["batch_values"],
                        "projection": projection_row["batch_values"],
                    }
                )
                _record_failure(
                    report,
                    kind="drift",
                    check="sample_item_batches",
                    message="Sampled item batch values mismatch",
                    legacy=legacy_row["batch_values"],
                    projection=projection_row["batch_values"],
                    context={"session_id": session_id, "item_code": item_code},
                )

        extra_projection_items = sorted(set(projection_rows) - set(legacy_rows))
        if extra_projection_items:
            sample_validation_passed = False
            for item_code in extra_projection_items:
                sample_result["mismatches"].append(
                    {
                        "item_code": item_code,
                        "field": "unexpected_projection_row",
                        "legacy": False,
                        "projection": True,
                    }
                )
                _record_failure(
                    report,
                    kind="gap",
                    check="sample_extra_projection_row",
                    message="Projection contains extra sampled item row not present in legacy data",
                    projection=projection_rows[item_code],
                    context={"session_id": session_id, "item_code": item_code},
                )

        sample_results.append(sample_result)

    report["details"]["sample_results"] = sample_results
    report["summary"]["sample_validation_passed"] = sample_validation_passed

    latest_event = None
    if await _collection_exists(db, config.event_log_collection):
        latest_event = await _latest_event_timestamp(db, config.event_log_collection)
    latest_projection = (
        max(
            timestamp
            for timestamp in (
                session_projection_aggregate["latest_updated_at"],
                verified_projection_aggregate["latest_updated_at"],
                variance_projection_aggregate["latest_updated_at"],
                financial_projection_aggregate["latest_updated_at"],
            )
            if timestamp is not None
        )
        if any(
            timestamp is not None
            for timestamp in (
                session_projection_aggregate["latest_updated_at"],
                verified_projection_aggregate["latest_updated_at"],
                variance_projection_aggregate["latest_updated_at"],
                financial_projection_aggregate["latest_updated_at"],
            )
        )
        else None
    )

    report["details"]["event_lag"] = {
        "latest_event_timestamp": latest_event,
        "latest_projection_timestamp": latest_projection,
    }

    if latest_event is None or latest_projection is None:
        report["summary"]["event_lag_ok"] = False
        _record_failure(
            report,
            kind="gap",
            check="event_lag",
            message="Cannot evaluate event lag because event or projection timestamps are missing",
            legacy=latest_event,
            projection=latest_projection,
        )
    else:
        lag_seconds = max((latest_event - latest_projection).total_seconds(), 0.0)
        report["metrics"]["event_lag_seconds"] = round(lag_seconds, 4)
        event_lag_ok = lag_seconds <= config.event_lag_threshold_seconds
        report["summary"]["event_lag_ok"] = event_lag_ok
        if not event_lag_ok:
            _record_failure(
                report,
                kind="drift",
                check="event_lag",
                message="Projection lag exceeds the configured threshold",
                legacy=latest_event,
                projection=latest_projection,
                context={
                    "lag_seconds": round(lag_seconds, 4),
                    "threshold_seconds": config.event_lag_threshold_seconds,
                },
            )

    return report


def write_report(report: dict[str, Any], output_path: Path) -> Path:
    resolved = _resolve_output_path(output_path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    resolved.write_text(
        json.dumps(report, indent=2, default=_json_default) + "\n", encoding="utf-8"
    )
    return resolved


async def _run(args: argparse.Namespace) -> tuple[dict[str, Any], Path]:
    config = ProjectionParityConfig(
        session_projection_collection=args.session_projection_collection,
        verified_projection_collection=args.verified_projection_collection,
        variance_projection_collection=args.variance_projection_collection,
        financial_projection_collection=args.financial_projection_collection,
        batch_projection_collection=args.batch_projection_collection,
        event_log_collection=args.event_log_collection,
        output_path=Path(args.output),
        sample_count=args.samples,
        sample_session_ids=tuple(args.session_id or ()),
        float_tolerance=args.float_tolerance,
        event_lag_threshold_seconds=args.event_lag_threshold_seconds,
    )

    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        report = await validate_projection_parity(db, config=config)
    return report, write_report(report, config.output_path)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default=".agent/reports/projection-parity-validation.json",
        help="Write the JSON audit report to this path.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=3,
        help="Number of recent sessions to sample when --session-id is not provided.",
    )
    parser.add_argument(
        "--session-id",
        action="append",
        default=None,
        help="Explicit session id to validate. Repeat to validate multiple sessions.",
    )
    parser.add_argument(
        "--session-projection-collection",
        default="session_dashboard_projection",
        help="Projection collection used for session dashboard reads.",
    )
    parser.add_argument(
        "--verified-projection-collection",
        default="verified_items_projection",
        help="Projection collection used for verified-item reads and row-level parity checks.",
    )
    parser.add_argument(
        "--variance-projection-collection",
        default="variance_summary_projection",
        help="Projection collection used for variance total parity checks.",
    )
    parser.add_argument(
        "--financial-projection-collection",
        default="financial_projection",
        help="Projection collection used for financial total parity checks.",
    )
    parser.add_argument(
        "--batch-projection-collection",
        default="batch_records",
        help="Projection collection used for sampled batch-value parity checks.",
    )
    parser.add_argument(
        "--event-log-collection",
        default="event_log",
        help="Event log collection used for lag validation.",
    )
    parser.add_argument(
        "--float-tolerance",
        type=float,
        default=0.01,
        help="Allowed numeric delta for totals and sampled row comparisons.",
    )
    parser.add_argument(
        "--event-lag-threshold-seconds",
        type=float,
        default=5.0,
        help="Maximum allowed lag between the latest event and latest projection update.",
    )
    return parser


def _print_summary(report: dict[str, Any], output_path: Path) -> None:
    print("\n=== Projection Parity Validation ===")
    print(f"Report: {output_path}")
    print(f"Consistent: {report['is_consistent']}")
    print(f"Samples checked: {report['samples_checked']}")
    print(f"Projection drift count: {report['metrics']['projection_drift_count']}")
    print(f"Projection gap count: {report['metrics']['projection_gap_count']}")
    print(f"Event lag seconds: {report['metrics']['event_lag_seconds']}")

    for check_name, passed in report["summary"].items():
        print(f"{check_name}: {passed}")

    if report["failures"]:
        print("Failures:")
        for failure in report["failures"][:20]:
            print(f"  - [{failure['kind']}] {failure['check']}: {failure['message']}")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    report, output_path = asyncio.run(_run(args))
    _print_summary(report, output_path)
    if not report["is_consistent"]:
        raise SystemExit("PARITY VALIDATION FAILED")
    print("PARITY VALIDATION PASSED")


if __name__ == "__main__":
    main()
