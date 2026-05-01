"""Read-only shadow comparison for projection cutover validation."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import uuid
from datetime import date, datetime
from typing import Any, Awaitable, Callable, Optional

from bson import ObjectId
from pymongo.errors import PyMongoError

from backend.config import settings
from backend.services.metrics import (
    increment_shadow_error_count,
    increment_shadow_mismatch_count,
    increment_shadow_timeout_count,
    increment_shadow_total_requests,
)
from backend.utils.api_utils import sanitize_for_logging
from backend.utils.request_context import get_request_id

logger = logging.getLogger(__name__)

ShadowFactory = Callable[[], Awaitable[Any]]
SHADOW_ERRORS = (
    PyMongoError,
    RuntimeError,
    TypeError,
    ValueError,
    OSError,
)
ITEM_NUMERIC_FIELDS = {
    "counted_qty",
    "verified" + "_qty",
    "stock_qty",
    "expected_qty",
    "variance",
    "total_variance",
    "items_scanned",
    "items_verified",
    "total_items",
    "verified_items",
}


def _safe_json_value(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return _safe_json_value(value.model_dump(exclude_none=True))
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {str(k): _safe_json_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_safe_json_value(item) for item in value]
    return value


def _as_float(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return round(float(value), 4)
    try:
        return round(float(str(value)), 4)
    except (TypeError, ValueError):
        return None


def _as_comparison_float(value: Any) -> float:
    normalized = _as_float(value)
    return normalized if normalized is not None else 0.0


def _extract_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return sorted(
            [row for row in payload if isinstance(row, dict)],
            key=_row_key,
        )
    if not isinstance(payload, dict):
        return []
    for key in ("items", "data", "rows", "sessions"):
        value = payload.get(key)
        if isinstance(value, list):
            return sorted(
                [row for row in value if isinstance(row, dict)],
                key=_row_key,
            )
    item = payload.get("item")
    if isinstance(item, dict):
        return [item]
    return []


def _row_key(row: dict[str, Any]) -> str:
    for field_name in ("item_code", "session_id", "id", "count_line_id", "barcode"):
        value = row.get(field_name)
        if value not in (None, ""):
            return f"{field_name}:{value}"
    return json.dumps(_safe_json_value(row), sort_keys=True, default=str)


def _walk_numeric(payload: Any, prefix: str = "") -> dict[str, float]:
    values: dict[str, float] = {}
    if isinstance(payload, dict):
        for key, value in payload.items():
            key_text = str(key)
            path = f"{prefix}.{key_text}" if prefix else key_text
            number = _as_float(value)
            key_lower = key_text.lower()
            if number is not None and (
                "total" in key_lower
                or "count" in key_lower
                or "variance" in key_lower
                or key_lower.endswith("_items")
                or key_lower in {"items", "verified", "pending"}
            ):
                values[path] = number
            elif isinstance(value, (dict, list)):
                values.update(_walk_numeric(value, path))
    elif isinstance(payload, list):
        for idx, value in enumerate(payload):
            if isinstance(value, (dict, list)):
                values.update(_walk_numeric(value, f"{prefix}[{idx}]"))
    return values


def _variance_total(payload: Any) -> float:
    return round(
        sum(
            value
            for path, value in _walk_numeric(payload).items()
            if "variance" in path.lower()
        ),
        4,
    )


def _numeric_close(left: float, right: float) -> bool:
    diff = abs(left - right)
    if diff <= settings.SHADOW_READ_VARIANCE_ABS_TOLERANCE:
        return True
    denominator = max(abs(left), abs(right), 1.0)
    return (diff / denominator) <= settings.SHADOW_READ_VARIANCE_REL_TOLERANCE


def compare_shadow_reads(primary: Any, baseline: Any) -> dict[str, Any]:
    """Compare primary projection payload with read-only baseline payload."""

    primary_rows = {_row_key(row): row for row in _extract_rows(primary)}
    baseline_rows = {_row_key(row): row for row in _extract_rows(baseline)}
    primary_summary = _walk_numeric(primary)
    baseline_summary = _walk_numeric(baseline)
    shared_summary_keys = sorted(set(primary_summary) & set(baseline_summary))
    summary_diffs = [
        {
            "field": key,
            "primary": primary_summary[key],
            "baseline": baseline_summary[key],
            "delta": primary_summary[key] - baseline_summary[key],
        }
        for key in shared_summary_keys
        if primary_summary[key] != baseline_summary[key]
    ]

    item_diffs: list[dict[str, Any]] = []
    for key in sorted(set(primary_rows) | set(baseline_rows)):
        primary_row = primary_rows.get(key)
        baseline_row = baseline_rows.get(key)
        if primary_row is None or baseline_row is None:
            item_diffs.append(
                {
                    "key": key,
                    "status": "missing_primary" if primary_row is None else "missing_baseline",
                }
            )
            continue

        numeric_deltas = {}
        for field_name in ITEM_NUMERIC_FIELDS:
            primary_value = _as_comparison_float(primary_row.get(field_name))
            baseline_value = _as_comparison_float(baseline_row.get(field_name))
            if primary_value != baseline_value:
                numeric_deltas[field_name] = {
                    "primary": primary_value,
                    "baseline": baseline_value,
                    "delta": round(primary_value - baseline_value, 4),
                }
        if numeric_deltas:
            item_diffs.append({"key": key, "numeric_deltas": numeric_deltas})

    variance_diff = abs(_variance_total(primary) - _variance_total(baseline))
    return {
        "totals_equal": not summary_diffs,
        "count_equal": len(primary_rows) == len(baseline_rows),
        "variance_diff": variance_diff,
        "variance_within_tolerance": _numeric_close(
            _variance_total(primary),
            _variance_total(baseline),
        ),
        "item_mismatch_count": len(item_diffs),
        "items_diff": item_diffs[:5],
        "summary_diffs": summary_diffs[:5],
        "primary_count": len(primary_rows),
        "baseline_count": len(baseline_rows),
    }


def _params_hash(params: Any) -> str:
    payload = json.dumps(
        _safe_json_value(params or {}),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _should_sample(*, endpoint: str, staff_user: Optional[str], params_hash: str) -> bool:
    if not settings.SHADOW_READ_ENABLED:
        return False
    sample_rate = max(0.0, min(1.0, float(settings.SHADOW_READ_SAMPLE_RATE)))
    if sample_rate >= 1.0:
        return True
    bucket_count = 10000
    sample_count = int(sample_rate * bucket_count)
    if sample_count <= 0:
        return False
    key = f"{endpoint}:{staff_user or ''}:{params_hash}"
    bucket = int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % bucket_count
    return bucket < sample_count


async def _run_shadow_compare(
    *,
    endpoint: str,
    primary: Any,
    baseline_factory: ShadowFactory,
    request_id: Optional[str],
    shadow_id: str,
    params_hash: str,
) -> None:
    resolved_request_id = request_id or get_request_id({})
    try:
        await increment_shadow_total_requests(endpoint)
        logger.info(
            "shadow_compare_started",
            extra={
                "request_id": resolved_request_id,
                "shadow_id": shadow_id,
                "endpoint": sanitize_for_logging(endpoint),
                "params_hash": params_hash,
            },
        )
        baseline = await asyncio.wait_for(
            baseline_factory(),
            timeout=float(settings.SHADOW_READ_TIMEOUT_SECONDS),
        )
        result = compare_shadow_reads(primary, baseline)
        status = (
            "matched"
            if result["totals_equal"]
            and result["count_equal"]
            and result["variance_within_tolerance"]
            and result["item_mismatch_count"] == 0
            else "mismatch"
        )
        if status == "mismatch":
            await increment_shadow_mismatch_count(endpoint)
        logger.info(
            "shadow_compare",
            extra={
                "request_id": resolved_request_id,
                "shadow_id": shadow_id,
                "endpoint": sanitize_for_logging(endpoint),
                "params_hash": params_hash,
                "status": status,
                "totals_equal": result["totals_equal"],
                "count_equal": result["count_equal"],
                "variance_diff": result["variance_diff"],
                "item_mismatch_count": result["item_mismatch_count"],
                "primary_count": result["primary_count"],
                "baseline_count": result["baseline_count"],
            },
        )
        if status == "mismatch":
            logger.warning(
                "shadow_compare_mismatch",
                extra={
                    "request_id": resolved_request_id,
                    "shadow_id": shadow_id,
                    "endpoint": sanitize_for_logging(endpoint),
                    "params_hash": params_hash,
                    "items_diff": result["items_diff"],
                    "summary_diffs": result["summary_diffs"],
                },
            )
    except asyncio.TimeoutError as exc:
        await increment_shadow_timeout_count(endpoint)
        logger.warning(
            "shadow_compare_failed",
            extra={
                "request_id": resolved_request_id,
                "shadow_id": shadow_id,
                "endpoint": sanitize_for_logging(endpoint),
                "params_hash": params_hash,
                "error": sanitize_for_logging(str(exc), 200),
                "error_type": "timeout",
            },
        )
    except SHADOW_ERRORS as exc:
        await increment_shadow_error_count(endpoint)
        logger.warning(
            "shadow_compare_failed",
            extra={
                "request_id": resolved_request_id,
                "shadow_id": shadow_id,
                "endpoint": sanitize_for_logging(endpoint),
                "params_hash": params_hash,
                "error": sanitize_for_logging(str(exc), 200),
                "error_type": type(exc).__name__,
            },
        )


def schedule_shadow_compare(
    *,
    endpoint: str,
    primary: Any,
    baseline_factory: ShadowFactory,
    request_id: Optional[str] = None,
    staff_user: Optional[str] = None,
    params: Any = None,
) -> None:
    """Schedule a hidden read-only comparison without affecting response flow."""

    params_hash = _params_hash(params)
    if not _should_sample(
        endpoint=endpoint,
        staff_user=staff_user,
        params_hash=params_hash,
    ):
        return
    shadow_id = uuid.uuid4().hex[:12]
    task = asyncio.create_task(
        _run_shadow_compare(
            endpoint=endpoint,
            primary=primary,
            baseline_factory=baseline_factory,
            request_id=request_id,
            shadow_id=shadow_id,
            params_hash=params_hash,
        )
    )
    task.add_done_callback(
        lambda completed: _log_shadow_task_exception(
            completed,
            endpoint,
            request_id,
            shadow_id,
            params_hash,
        )
    )


def _log_shadow_task_exception(
    completed: asyncio.Task[None],
    endpoint: str,
    request_id: Optional[str],
    shadow_id: str,
    params_hash: str,
) -> None:
    try:
        exc = completed.exception()
    except asyncio.CancelledError:
        return
    if exc is not None:
        logger.error(
            "shadow_compare_unhandled",
            extra={
                "request_id": request_id or get_request_id({}),
                "shadow_id": shadow_id,
                "endpoint": sanitize_for_logging(endpoint),
                "params_hash": params_hash,
                "error": sanitize_for_logging(str(exc), 200),
            },
        )
