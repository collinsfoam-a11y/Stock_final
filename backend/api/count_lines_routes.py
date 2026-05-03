import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, NoReturn, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.api.schemas import BulkCountLineUpdate, CountLineCreate
from backend.auth.dependencies import get_current_user
from backend.contracts.states import normalize_session_state
from backend.core.websocket_manager import manager
from backend.models.audit import AuditEventType, AuditLogStatus
from backend.services.activity_log import ActivityLogService
from backend.services.canonical_inventory import (
    can_reuse_rejected_count_line,
    count_line_requires_supervisor_review,
    extract_document_id,
    find_duplicate_count_line,
    find_session,
    is_count_line_locked,
    is_session_finalized,
    materialize_count_line_review_state,
    recompute_session_totals,
)
from backend.services.count_line_write_service import (
    CountLineGovernanceDecision,
    CountLineWriteService,
)
from backend.services.count_query_service import CountQueryService, get_count_query_service
from backend.services.lock_service import LockService, ResourceLockedError
from backend.services.logic_guard import build_request_context, enforce_session_logic
from backend.services.notification_service import NotificationService
from backend.services.snapshot_service import SnapshotService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.variant_service import VariantService
from backend.sql_server_connector import SQLServerConnector
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter()


_activity_log_service: Optional[ActivityLogService] = None
_lock_service: Optional[LockService] = None
_snapshot_service: Optional[SnapshotService] = None
_variant_service: Optional[VariantService] = None
_sql_connector: Optional[SQLServerConnector] = None


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _normalize_idempotency_key(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _is_truthy_flag(value: Any) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def _is_draft_debug_mode_enabled() -> bool:
    env = str(os.getenv("ENVIRONMENT", "development")).strip().lower()
    return env in {"development", "test"} and _is_truthy_flag(
        os.getenv("COUNT_LINES_DRAFT_DEBUG_ERRORS", "false")
    )


def _to_json_safe(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, dict):
        return {key: _to_json_safe(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_to_json_safe(item) for item in value]
    if isinstance(value, set):
        return [_to_json_safe(item) for item in sorted(value, key=lambda item: str(item))]
    return value


def _build_draft_input_snapshot(line_data: CountLineCreate) -> dict[str, Any]:
    payload = _to_json_safe(line_data.model_dump(mode="json"))
    if isinstance(payload.get("photo_base64"), str) and payload.get("photo_base64"):
        payload["photo_base64"] = "<redacted>"
    if isinstance(payload.get("photo_proofs"), list):
        payload["photo_proofs"] = f"<{len(payload['photo_proofs'])} proofs>"
    return payload


def _raise_count_lines_internal_error(detail: str, exc: Exception) -> NoReturn:
    raise HTTPException(status_code=500, detail=detail) from exc


class CountLineApprovalRequest(BaseModel):
    """Optional metadata for approving a count line."""

    notes: Optional[str] = None


class CountLineRejectRequest(BaseModel):
    """Optional metadata for requesting a recount."""

    notes: Optional[str] = None
    assign_to: Optional[str] = None


class AddQuantityRequest(BaseModel):
    """Payload for incrementing quantity on an existing count line."""

    additional_qty: float
    batches: Optional[list[dict[str, Any]]] = None


class CountLineUpdateRequest(BaseModel):
    """Minimal update payload for a count line (used by bulk update tooling)."""

    counted_qty: Optional[float] = None
    batches: Optional[list[dict[str, Any]]] = None


def init_count_lines_api(
    activity_log_service: ActivityLogService,
    lock_service: Optional[LockService] = None,
    snapshot_service: Optional[SnapshotService] = None,
    variant_service: Optional[VariantService] = None,
    sql_connector: Optional[SQLServerConnector] = None,
):
    global _activity_log_service, _lock_service, _snapshot_service, _variant_service, _sql_connector
    if snapshot_service is None:
        try:
            snapshot_service = SnapshotService(get_count_query_service().database)
        except RuntimeError:
            snapshot_service = None
    _activity_log_service = activity_log_service
    _lock_service = lock_service
    _snapshot_service = snapshot_service
    _variant_service = variant_service
    _sql_connector = sql_connector


def _get_db_client(db_override=None):
    """Resolve the active database client, raising if not initialized."""
    if db_override is not None:
        return db_override
    try:
        return get_count_query_service().database
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Database is not initialized")


def _get_count_query_service(db_override=None) -> CountQueryService:
    return get_count_query_service(_get_db_client(db_override))


def _get_count_line_write_service(db: Any) -> CountLineWriteService:
    return CountLineWriteService(
        db,
        snapshot_service=_snapshot_service,
    )


def _require_supervisor(current_user: dict):
    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Supervisor access required")


async def _get_mutable_session_or_409(db: Any, session_id: str) -> dict[str, Any]:
    session = await find_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    if is_session_finalized(session):
        raise HTTPException(status_code=409, detail="Session is finalized and cannot be modified")
    return session


async def _enforce_count_line_session_logic(
    *,
    db: Any,
    session: dict[str, Any],
    request: Request | None,
    current_user: dict[str, Any],
    operation_name: str,
) -> None:
    await enforce_session_logic(
        db=db,
        session=session,
        request_context=build_request_context(
            request=request,
            current_user=current_user,
            session_id=str(session.get("id") or session.get("session_id") or ""),
            warehouse=session.get("warehouse"),
            endpoint_name="count_lines_routes",
            operation_name=operation_name,
        ),
        is_mutation=True,
    )


async def _enforce_count_line_logic_from_line(
    *,
    db: Any,
    count_line: dict[str, Any],
    request: Request | None,
    current_user: dict[str, Any],
    operation_name: str,
) -> None:
    session_id = str(count_line.get("session_id") or "")
    if not session_id:
        raise HTTPException(status_code=409, detail="Count line is missing session context")
    session = await _get_mutable_session_or_409(db, session_id)
    await _enforce_count_line_session_logic(
        db=db,
        session=session,
        request=request,
        current_user=current_user,
        operation_name=operation_name,
    )


async def _ensure_count_line_mutable(
    db: Any,
    count_line: dict[str, Any],
    *,
    session: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if is_count_line_locked(count_line):
        raise HTTPException(
            status_code=409, detail="Count line is finalized and cannot be modified"
        )

    active_session = session or await find_session(db, str(count_line.get("session_id") or ""))
    if is_session_finalized(active_session):
        raise HTTPException(status_code=409, detail="Session is finalized and cannot be modified")

    return active_session or {}


# Helper function to detect high-risk corrections
def detect_risk_flags(erp_item: dict, line_data: CountLineCreate, variance: float) -> list[str]:
    """Detect high-risk correction patterns"""
    risk_flags = []

    # Get values
    erp_qty = erp_item.get("stock_qty", 0)
    erp_mrp = erp_item.get("mrp", 0)
    counted_mrp = line_data.mrp_counted or erp_mrp

    # Calculate percentages safely
    # M1 fix: Don't default to 100% for zero-stock items; use 0 if both are 0
    if erp_qty > 0:
        variance_percent = abs(variance) / erp_qty * 100
    elif line_data.counted_qty == 0:
        variance_percent = 0
    else:
        variance_percent = 100
    mrp_change_percent = ((counted_mrp - erp_mrp) / erp_mrp * 100) if erp_mrp > 0 else 0

    # Rule 1: Large variance
    if abs(variance) > 100 or variance_percent > 50:
        risk_flags.append("LARGE_VARIANCE")

    # Rule 2: MRP reduced significantly
    if mrp_change_percent < -20:
        risk_flags.append("MRP_REDUCED_SIGNIFICANTLY")

    # Rule 3: High value item with variance
    if erp_mrp > 10000 and variance_percent > 5:
        risk_flags.append("HIGH_VALUE_VARIANCE")

    # Rule 4: Serial numbers missing for high-value item
    if erp_mrp > 5000 and (not line_data.serial_numbers or len(line_data.serial_numbers) == 0):
        risk_flags.append("SERIAL_MISSING_HIGH_VALUE")

    # Rule 5: Correction without reason when variance exists
    if abs(variance) > 0 and not line_data.correction_reason and not line_data.variance_reason:
        risk_flags.append("MISSING_CORRECTION_REASON")

    # Rule 6: MRP change without reason
    if (
        abs(mrp_change_percent) > 5
        and not line_data.correction_reason
        and not line_data.variance_reason
    ):
        risk_flags.append("MRP_CHANGE_WITHOUT_REASON")

    # Rule 7: Photo required but missing
    photo_required = (
        abs(variance) > 100
        or variance_percent > 50
        or abs(mrp_change_percent) > 20
        or erp_mrp > 10000
    )
    if (
        photo_required
        and not line_data.photo_base64
        and (not line_data.photo_proofs or len(line_data.photo_proofs) == 0)
    ):
        risk_flags.append("PHOTO_PROOF_REQUIRED")

    return risk_flags


# Helper function to calculate financial impact
def calculate_financial_impact(
    erp_mrp: float, counted_mrp: float, counted_qty: float, erp_qty: float = 0.0
) -> float:
    """Calculate financial impact of quantity and MRP changes.

    H1 fix: Uses erp_qty on the ERP side so quantity variance is reflected.
    """
    old_value = erp_mrp * erp_qty
    new_value = counted_mrp * counted_qty
    return new_value - old_value


def _build_draft_line_id(line_data: CountLineCreate) -> str:
    """Build a stable draft identifier per user/session/item/location."""
    parts = [
        line_data.item_code or "",
        line_data.floor_no or "",
        line_data.rack_no or "",
        line_data.mark_location or "",
    ]
    return "|".join(str(part).strip().upper() for part in parts)


def _build_count_line_draft_filter(line_data: CountLineCreate, username: str) -> dict[str, Any]:
    line_id = _build_draft_line_id(line_data)
    return {
        "session_id": line_data.session_id,
        "user_id": username,
        "line_id": line_id,
    }


def _build_legacy_count_line_draft_filter(
    line_data: CountLineCreate, username: str
) -> dict[str, Any]:
    return {
        "session_id": line_data.session_id,
        "item_code": line_data.item_code,
        "counted_by": username,
        "floor_no": line_data.floor_no,
        "rack_no": line_data.rack_no,
    }


async def _resolve_item_name_for_draft(db: Any, line_data: CountLineCreate) -> Optional[str]:
    return await _get_count_query_service(db).resolve_item_name_for_draft(line_data)


def _build_dashboard_refresh_message(
    event: str,
    *,
    session_id: Optional[str] = None,
    session_ids: Optional[set[str]] = None,
    count_line: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "event": event,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }
    if session_id:
        payload["session_id"] = session_id
    if session_ids:
        payload["session_ids"] = sorted(session_ids)
    if count_line:
        payload.update(
            {
                "count_line_id": str(count_line.get("id") or ""),
                "item_code": count_line.get("item_code"),
                "item_name": count_line.get("item_name"),
            }
        )

    return {
        "type": "dashboard_refresh_requested",
        "payload": payload,
    }


async def _broadcast_dashboard_refresh(
    event: str,
    *,
    session_id: Optional[str] = None,
    session_ids: Optional[set[str]] = None,
    count_line: Optional[dict[str, Any]] = None,
) -> None:
    try:
        await manager.broadcast_to_roles(
            message=_build_dashboard_refresh_message(
                event,
                session_id=session_id,
                session_ids=session_ids,
                count_line=count_line,
            ),
            roles={"supervisor", "admin"},
        )
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.warning(
            "Failed to broadcast dashboard refresh event: %s",
            _safe_log_value(exc, max_length=200),
        )


def _ensure_session_accepts_counts(session: dict[str, Any]) -> None:
    session_state = normalize_session_state(session.get("status"))
    if session_state != "ACTIVE":
        raise HTTPException(status_code=400, detail="Session must be ACTIVE for count operations")
    if session.get("reconciled_at"):
        raise HTTPException(status_code=400, detail="Session is in reconciliation mode")


async def _ensure_session_ready_for_count_writes(
    db: Any,
    session: dict[str, Any],
    *,
    actor: str,
) -> dict[str, Any]:
    lifecycle_service = SessionLifecycleService(db)
    session_id = str(session.get("id") or session.get("session_id") or "")
    if not session_id:
        raise HTTPException(status_code=400, detail="Session is missing canonical id")
    refreshed = await lifecycle_service.ensure_session_accepts_count_writes(
        session_id,
        actor=actor,
    )
    if normalize_session_state(refreshed.get("status")) != "ACTIVE":
        refreshed = dict(refreshed)
        refreshed["status"] = "ACTIVE"
    return refreshed


def _first_non_empty(*values: Any) -> Optional[str]:
    for value in values:
        text = str(value).strip() if value is not None else ""
        if text:
            return text
    return None


def _hydrate_count_line_location_context(
    line_data: CountLineCreate,
    session: dict[str, Any],
) -> None:
    """Backfill canonical location fields from active session context."""
    line_data.location_id = _first_non_empty(
        line_data.location_id,
        session.get("location_id"),
        session.get("location_type"),
        session.get("warehouse"),
    )
    line_data.floor_id = _first_non_empty(
        line_data.floor_id,
        line_data.floor_no,
        session.get("floor_id"),
        session.get("location_name"),
        session.get("floor"),
    )
    line_data.rack_id = _first_non_empty(
        line_data.rack_id,
        line_data.rack_no,
        session.get("rack_id"),
        session.get("rack_no"),
        session.get("rack"),
    )
    line_data.floor_no = _first_non_empty(line_data.floor_no, line_data.floor_id)
    line_data.rack_no = _first_non_empty(line_data.rack_no, line_data.rack_id)


def _assert_draft_context_resolved(line_data: CountLineCreate) -> None:
    missing = [
        field
        for field, value in (
            ("location_id", line_data.location_id),
            ("floor_id", line_data.floor_id),
            ("rack_id", line_data.rack_id),
        )
        if not str(value or "").strip()
    ]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Draft location context is incomplete: missing {', '.join(missing)}",
        )


async def _find_idempotent_count_line(
    db: Any,
    line_data: CountLineCreate,
) -> Optional[dict[str, Any]]:
    idempotency_key = _normalize_idempotency_key(line_data.idempotency_key)
    if not idempotency_key:
        return None

    existing_idempotent = await _get_count_query_service(db).find_idempotent_count_line(
        line_data.session_id,
        idempotency_key,
    )
    if existing_idempotent:
        existing_idempotent.pop("_id", None)
    return existing_idempotent


async def _find_erp_item_for_count_line(
    db: Any, line_data: CountLineCreate
) -> Optional[dict[str, Any]]:
    return await _get_count_query_service(db).find_erp_item(
        barcode=line_data.barcode,
        item_code=line_data.item_code,
    )


async def _get_erp_item_for_count_line(db: Any, line_data: CountLineCreate) -> dict[str, Any]:
    erp_item = await _find_erp_item_for_count_line(db, line_data)
    if not erp_item:
        raise HTTPException(status_code=404, detail="Item not found in ERP")
    return erp_item


async def _get_erp_item_for_existing_count_line(
    db: Any, count_line: dict[str, Any]
) -> dict[str, Any]:
    return await _get_count_query_service(db).get_erp_item_for_existing_count_line(count_line)


async def _resolve_snapshot_baseline(
    line_data: CountLineCreate,
    erp_item: dict[str, Any],
    username: str,
) -> tuple[float, str]:
    write_service = _get_count_line_write_service(_get_db_client())
    return await write_service.resolve_baseline(
        session_id=line_data.session_id,
        item_code=line_data.item_code,
        username=username,
        erp_item=erp_item,
    )


def _apply_misplaced_stock_flags(
    erp_item: dict[str, Any],
    line_data: CountLineCreate,
    risk_flags: list[str],
) -> bool:
    found_floor = (line_data.floor_no or "").strip().upper()
    found_rack = (line_data.rack_no or "").strip().upper()
    expected_floor = (erp_item.get("floor") or "").strip().upper()
    expected_rack = (erp_item.get("rack") or "").strip().upper()

    if not (expected_floor or expected_rack):
        return False

    floor_mismatch = found_floor and expected_floor and found_floor != expected_floor
    rack_mismatch = found_rack and expected_rack and found_rack != expected_rack
    if not (floor_mismatch or rack_mismatch):
        return False

    from backend.api.schemas import RelocationStatus

    risk_flags.append("MISPLACED_ITEM")
    line_data.is_misplaced = True
    line_data.expected_location = f"{expected_floor}/{expected_rack}"
    line_data.found_location = f"{found_floor}/{found_rack}"
    line_data.relocation_status = RelocationStatus.PENDING
    return True


def _build_count_line_risk_context(
    session: dict[str, Any],
    erp_item: dict[str, Any],
    line_data: CountLineCreate,
    variance: float,
    erp_qty: float,
) -> tuple[list[str], bool, float]:
    risk_flags = detect_risk_flags(erp_item, line_data, variance)
    is_misplaced = _apply_misplaced_stock_flags(erp_item, line_data, risk_flags)
    if session.get("type") == "STRICT" and abs(variance) > 0:
        risk_flags.append("STRICT_MODE_VARIANCE")

    counted_mrp = line_data.mrp_counted or erp_item.get("mrp", 0)
    financial_impact = calculate_financial_impact(
        erp_item.get("mrp", 0),
        counted_mrp,
        line_data.counted_qty,
        erp_qty,
    )
    return risk_flags, is_misplaced, financial_impact


def _build_count_line_lock_keys(
    line_data: CountLineCreate,
    erp_item: dict[str, Any],
) -> tuple[str, Optional[str]]:
    item_id = erp_item.get("item_id")
    variant_lock_key = f"product:{item_id}" if item_id else None
    session_variant_lock = (
        f"session:{line_data.session_id}:{variant_lock_key}" if variant_lock_key else None
    )
    floor_id = line_data.floor_id or line_data.floor_no or ""
    rack_id = line_data.rack_id or line_data.rack_no or ""
    lock_key = f"{line_data.session_id}:{line_data.item_code}:{floor_id}:{rack_id}"
    return lock_key, session_variant_lock


async def _acquire_count_line_locks(
    line_data: CountLineCreate,
    erp_item: dict[str, Any],
    username: str,
) -> dict[str, Any]:
    lock_key, session_variant_lock = _build_count_line_lock_keys(line_data, erp_item)
    lock_state = {
        "lock_key": lock_key,
        "session_variant_lock": session_variant_lock,
        "lock_acquired": False,
        "variant_lock_acquired": False,
    }
    if not _lock_service:
        return lock_state

    try:
        if session_variant_lock and _variant_service:
            lock_state["variant_lock_acquired"] = await _lock_service.acquire_lock(
                session_variant_lock, username
            )
        lock_state["lock_acquired"] = await _lock_service.acquire_lock(lock_key, username)
    except ResourceLockedError as exc:
        lock_error_detail = (
            "Item or one of its variants is currently being counted by another user."
        )
        if "session" in str(exc):
            lock_error_detail = (
                "A related SKU/Variant is currently being counted in this session. Please wait."
            )
        raise HTTPException(status_code=423, detail=lock_error_detail) from exc

    return lock_state


async def _release_count_line_locks(lock_state: dict[str, Any], username: str) -> None:
    if not _lock_service:
        return

    if lock_state.get("lock_acquired"):
        await _lock_service.release_lock(lock_state["lock_key"], username)
    if lock_state.get("variant_lock_acquired") and lock_state.get("session_variant_lock"):
        await _lock_service.release_lock(lock_state["session_variant_lock"], username)


async def _resolve_recount_target(
    db: Any,
    line_data: CountLineCreate,
) -> Optional[dict[str, Any]]:
    line_payload = line_data.model_dump(mode="json")
    existing_count = await find_duplicate_count_line(db, line_payload)
    if existing_count and can_reuse_rejected_count_line(existing_count, line_payload):
        return existing_count
    if existing_count:
        raise HTTPException(
            status_code=409,
            detail=(
                "Duplicate Scan: This item has already been counted in this specific "
                "location (Floor/Rack). Use an explicit recount flow to resubmit it."
            ),
        )
    return None


def _build_count_line_document(
    line_data: CountLineCreate,
    erp_item: dict[str, Any],
    current_user: dict[str, Any],
    erp_qty: float,
    baseline_hash: str,
    governance: CountLineGovernanceDecision,
    risk_flags: list[str],
    financial_impact: float,
    is_misplaced: bool,
    recount_update_target: Optional[dict[str, Any]],
) -> tuple[dict[str, Any], datetime]:
    count_line_id = str(uuid.uuid4())
    previous_version_id = (
        extract_document_id(recount_update_target) if recount_update_target else None
    )
    recount_root_id = (
        line_data.recount_of_id
        or (recount_update_target or {}).get("recount_of_id")
        or previous_version_id
    )
    version = int((recount_update_target or {}).get("version", 1) or 1) + (
        1 if recount_update_target else 0
    )
    idempotency_key = _normalize_idempotency_key(line_data.idempotency_key) or count_line_id
    counted_at = datetime.now(timezone.utc).replace(tzinfo=None)

    count_line = {
        "id": count_line_id,
        "session_id": line_data.session_id,
        "location_id": line_data.location_id,
        "floor_id": line_data.floor_id,
        "rack_id": line_data.rack_id,
        "idempotency_key": idempotency_key,
        "recount_of_id": recount_root_id,
        "version": version,
        "previous_version_id": previous_version_id,
        "item_code": line_data.item_code,
        "barcode": line_data.barcode or erp_item.get("barcode"),
        "item_name": erp_item.get("item_name", "Unknown"),
        "erp_qty": erp_qty,
        "baseline_hash": baseline_hash,
        "counted_qty": line_data.counted_qty,
        "variance": governance.variance,
        "variance_reason": line_data.variance_reason,
        "variance_note": line_data.variance_note,
        "remark": line_data.remark,
        "photo_base64": line_data.photo_base64,
        "damaged_qty": line_data.damaged_qty,
        "item_condition": line_data.item_condition,
        "floor_no": line_data.floor_no or line_data.floor_id,
        "rack_no": line_data.rack_no or line_data.rack_id,
        "mark_location": line_data.mark_location,
        "sr_no": line_data.sr_no,
        "manufacturing_date": line_data.manufacturing_date,
        "mfg_date_format": line_data.mfg_date_format.value if line_data.mfg_date_format else None,
        "expiry_date": line_data.expiry_date,
        "expiry_date_format": (
            line_data.expiry_date_format.value if line_data.expiry_date_format else None
        ),
        "non_returnable_damaged_qty": line_data.non_returnable_damaged_qty,
        "correction_reason": (
            line_data.correction_reason.model_dump() if line_data.correction_reason else None
        ),
        "photo_proofs": (
            [photo.model_dump() for photo in line_data.photo_proofs]
            if line_data.photo_proofs
            else None
        ),
        "correction_metadata": (
            line_data.correction_metadata.model_dump() if line_data.correction_metadata else None
        ),
        "approval_status": governance.approval_status,
        "approval_by": governance.approved_by,
        "approval_at": governance.approved_at,
        "rejection_reason": None,
        "is_misplaced": is_misplaced,
        "expected_location": line_data.expected_location,
        "found_location": line_data.found_location,
        "relocation_status": line_data.relocation_status,
        "risk_flags": risk_flags,
        "financial_impact": financial_impact,
        "created_by": current_user["username"],
        "counted_by": current_user["username"],
        "counted_at": counted_at,
        "updated_at": counted_at,
        "updated_by": current_user["username"],
        "mrp_erp": erp_item.get("mrp", 0),
        "mrp_counted": line_data.mrp_counted,
        "split_section": line_data.split_section,
        "category_correction": line_data.category_correction,
        "subcategory_correction": line_data.subcategory_correction,
        "requires_supervisor_approval": governance.requires_supervisor_approval,
        "variance_data": governance.variance_data,
        "violated_thresholds": governance.violated_thresholds,
        "serial_numbers": line_data.serial_numbers if line_data.serial_numbers else None,
        "serial_entries": (
            [serial.model_dump() for serial in line_data.serial_entries]
            if line_data.serial_entries
            else None
        ),
        "status": governance.status,
        "verified": False,
        "verified_at": None,
        "verified_by": None,
        "approved_by": governance.approved_by,
        "approved_at": governance.approved_at,
        "rejected_by": None,
        "rejected_at": None,
        "recount_requested_at": None,
        "recount_requested_by": None,
        "assigned_to": None,
    }
    count_line["recount_iteration"] = int(
        (recount_update_target or {}).get("recount_iteration", 0) or 0
    ) + (1 if recount_update_target else 0)

    return count_line, counted_at


async def _persist_count_line_document(
    db: Any,
    line_data: CountLineCreate,
    username: str,
    count_line: dict[str, Any],
    counted_at: datetime,
    recount_update_target: Optional[dict[str, Any]],
    *,
    write_service: CountLineWriteService,
    session: dict[str, Any],
) -> None:
    async with write_service.transaction() as tx:
        write_context = {
            "session": session,
            "username": username,
            "db_session": tx,
            "skip_session_totals_update": True,
        }

        await write_service.process_write(
            {"operation": "insert_one", "document": count_line},
            context=write_context,
        )
        if recount_update_target:
            await write_service.process_write(
                {
                    "operation": "update_one",
                    "filter": {"_id": recount_update_target["_id"]},
                    "update": {
                        "$set": {
                            "status": "SUPERSEDED",
                            "superseded_at": counted_at,
                            "superseded_by": username,
                            "superseded_by_version_id": count_line["id"],
                            "location_id": count_line.get("location_id"),
                            "floor_id": count_line.get("floor_id"),
                            "rack_id": count_line.get("rack_id"),
                        }
                    },
                },
                context=write_context,
            )

        draft_query = {
            "$or": [
                _build_count_line_draft_filter(line_data, username),
                _build_legacy_count_line_draft_filter(line_data, username),
            ]
        }
        draft_update_doc = {
            "$set": {
                "status": "submitted",
                "submitted_at": counted_at,
                "submitted_count_line_id": count_line["id"],
                "updated_at": counted_at,
            }
        }
        await write_service.mark_count_line_drafts_submitted(
            draft_query=draft_query,
            draft_update=draft_update_doc,
            db_session=tx,
        )


async def _create_and_persist_count_line(
    db: Any,
    *,
    session: dict[str, Any],
    line_data: CountLineCreate,
    current_user: dict[str, Any],
    write_service: CountLineWriteService,
) -> tuple[dict[str, Any], datetime, CountLineGovernanceDecision, list[str], float]:
    erp_item = await _get_erp_item_for_count_line(db, line_data)
    erp_qty, baseline_hash = await write_service.resolve_baseline(
        session_id=line_data.session_id,
        item_code=line_data.item_code,
        username=current_user["username"],
        erp_item=erp_item,
    )
    governance = await write_service.evaluate_new_count_line(
        session=session,
        item_code=line_data.item_code,
        counted_qty=line_data.counted_qty,
        erp_item=erp_item,
        expected_qty=erp_qty,
        variance_reason=line_data.variance_reason,
        correction_reason=line_data.correction_reason,
        location=line_data.floor_id,
    )
    risk_flags, is_misplaced, financial_impact = _build_count_line_risk_context(
        session,
        erp_item,
        line_data,
        governance.variance,
        erp_qty,
    )

    lock_state = await _acquire_count_line_locks(line_data, erp_item, current_user["username"])
    try:
        recount_update_target = await _resolve_recount_target(db, line_data)
        count_line, counted_at = _build_count_line_document(
            line_data,
            erp_item,
            current_user,
            erp_qty,
            baseline_hash,
            governance,
            risk_flags,
            financial_impact,
            is_misplaced,
            recount_update_target,
        )
        await _persist_count_line_document(
            db,
            line_data,
            current_user["username"],
            count_line,
            counted_at,
            recount_update_target,
            write_service=write_service,
            session=session,
        )
    finally:
        await _release_count_line_locks(lock_state, current_user["username"])

    return count_line, counted_at, governance, risk_flags, financial_impact


def _build_count_line_mutation_update(
    *,
    count_line: dict[str, Any],
    current_user: dict[str, Any],
    governance: CountLineGovernanceDecision,
    counted_qty: float,
    financial_impact: float,
    variance_reason: Optional[str],
    batches: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    update_data: dict[str, Any] = {
        "counted_qty": counted_qty,
        "variance": governance.variance,
        "variance_reason": variance_reason,
        "approval_status": governance.approval_status,
        "approved_at": governance.approved_at,
        "approved_by": governance.approved_by,
        "assigned_to": None,
        "financial_impact": financial_impact,
        "recount_requested_at": None,
        "recount_requested_by": None,
        "rejected_at": None,
        "rejected_by": None,
        "rejection_reason": None,
        "requires_supervisor_approval": governance.requires_supervisor_approval,
        "status": governance.status,
        "updated_at": _current_timestamp(),
        "updated_by": current_user.get("username"),
        "variance_data": governance.variance_data,
        "verified": False,
        "verified_at": None,
        "verified_by": None,
        "violated_thresholds": governance.violated_thresholds,
    }
    if batches is not None:
        update_data["batches"] = batches
    if count_line.get("approval_note") is not None:
        update_data["approval_note"] = None
    return update_data


async def _broadcast_scan_created(
    line_data: CountLineCreate,
    count_line: dict[str, Any],
    variance: float,
) -> None:
    try:
        await manager.broadcast_to_session(
            message={
                "type": "scan_created",
                "payload": {
                    "session_id": line_data.session_id,
                    "item_code": count_line["item_code"],
                    "counted_by": count_line["counted_by"],
                    "qty": count_line["counted_qty"],
                    "variance": variance,
                    "timestamp": count_line["counted_at"].isoformat(),
                },
            },
            session_id=line_data.session_id,
        )
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.warning("Failed to broadcast scan event: %s", _safe_log_value(exc, max_length=200))


async def _maybe_update_session_barcode(db: Any, line_data: CountLineCreate) -> None:
    if not line_data.barcode:
        return

    try:
        session_result = await find_session(db, line_data.session_id)
        if session_result and not session_result.get("barcode"):
            lifecycle_service = SessionLifecycleService(db)
            await lifecycle_service.update_session_fields(
                line_data.session_id,
                {"barcode": line_data.barcode},
            )
            logger.info(
                "Updated session %s with barcode %s",
                _safe_log_value(line_data.session_id),
                _safe_log_value(line_data.barcode),
            )
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.error("Failed to update session barcode: %s", _safe_log_value(exc, max_length=200))


async def _record_high_risk_correction(
    request: Request,
    db: Any,
    current_user: dict[str, Any],
    line_data: CountLineCreate,
    count_line: dict[str, Any],
    risk_flags: list[str],
    variance: float,
    financial_impact: float,
) -> None:
    if _activity_log_service:
        await _activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="high_risk_correction",
            entity_type="count_line",
            entity_id=count_line["id"],
            details={"risk_flags": risk_flags, "item_code": line_data.item_code},
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    try:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(db)
        await audit_service.log_event(
            event_type=AuditEventType.STOCK_VARIANCE_DETECTED,
            status=AuditLogStatus.WARNING,
            actor_username=current_user["username"],
            resource_id=count_line["id"],
            details={
                "risk_flags": risk_flags,
                "item_code": line_data.item_code,
                "variance": variance,
                "financial_impact": financial_impact,
            },
        )
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.error("Failed to write audit log: %s", _safe_log_value(exc, max_length=200))


@router.post("/count-lines/draft")
async def save_count_line_draft(
    request: Request,
    line_data: CountLineCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Save a draft count line.
    Upserts the current autosave payload into count_line_drafts.
    """
    stage = "validation"
    input_snapshot = _build_draft_input_snapshot(line_data)
    connectivity_mode = (
        request.headers.get("x-connectivity-state")
        or request.headers.get("x-connectivity-mode")
        or request.headers.get("x-network-status")
        or "unknown"
    )
    log_context = {
        "session_id": _safe_log_value(line_data.session_id),
        "user_id": _safe_log_value(current_user.get("username")),
        "connectivity_mode": _safe_log_value(connectivity_mode),
    }

    try:
        db = _get_db_client()
        write_service = _get_count_line_write_service(db)
        session = await find_session(db, line_data.session_id)
        if not isinstance(session, dict):
            raise HTTPException(status_code=404, detail=f"Session {line_data.session_id} not found")

        _hydrate_count_line_location_context(line_data, session)
        session = await _ensure_session_ready_for_count_writes(
            db,
            session,
            actor=str(current_user.get("username") or "system"),
        )
        _assert_draft_context_resolved(line_data)
        _ensure_session_accepts_counts(session)
        await _enforce_count_line_session_logic(
            db=db,
            session=session,
            request=request,
            current_user=current_user,
            operation_name="save_count_line_draft",
        )

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        username = str(current_user.get("username") or "").strip()
        draft_line_id = _build_draft_line_id(line_data)
        draft_filter = _build_count_line_draft_filter(line_data, username)
        legacy_draft_filter = _build_legacy_count_line_draft_filter(line_data, username)
        resolved_item_name = await _resolve_item_name_for_draft(db, line_data)
        draft_payload = {
            **line_data.model_dump(mode="json"),
            "item_name": resolved_item_name,
            "barcode": line_data.barcode,
            "counted_by": username,
            "user_id": username,
            "line_id": draft_line_id,
            "status": "draft",
            "updated_at": now,
        }

        stage = "db_write"
        async with write_service.transaction() as tx:
            draft_id = await write_service.save_count_line_draft(
                draft_filter=draft_filter,
                legacy_draft_filter=legacy_draft_filter,
                draft_payload=draft_payload,
                created_at=now,
                db_session=tx,
            )

        logger.debug(
            "Draft saved for item %s: %s",
            _safe_log_value(line_data.item_code),
            line_data.counted_qty,
        )

        stage = "serialization"
        return _to_json_safe(
            {
                "success": True,
                "message": "Draft saved successfully",
                "data": {
                    "id": draft_id,
                    **draft_payload,
                },
            }
        )
    except HTTPException as exc:
        logger.warning(
            "Count-line draft rejected at %s (%s)",
            stage,
            _safe_log_value(exc.detail, max_length=240),
            extra=log_context,
        )
        raise
    except Exception as exc:
        logger.exception(
            "Count-line draft failed at %s",
            stage,
            extra={
                **log_context,
                "stage": stage,
                "input_snapshot": _to_json_safe(input_snapshot),
            },
        )
        if _is_draft_debug_mode_enabled():
            return JSONResponse(
                status_code=500,
                content={
                    "error": str(exc),
                    "stage": stage,
                    "input_snapshot": _to_json_safe(input_snapshot),
                },
            )
        _raise_count_lines_internal_error("Failed to save count line draft", exc)


@router.post("/count-lines")
async def create_count_line(
    request: Request,
    line_data: CountLineCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create or resubmit a count line while preserving snapshot and review semantics."""
    db = _get_db_client()
    write_service = _get_count_line_write_service(db)
    session = await _get_mutable_session_or_409(db, line_data.session_id)
    _hydrate_count_line_location_context(line_data, session)
    session = await _ensure_session_ready_for_count_writes(
        db,
        session,
        actor=str(current_user.get("username") or "system"),
    )
    await _enforce_count_line_session_logic(
        db=db,
        session=session,
        request=request,
        current_user=current_user,
        operation_name="create_count_line",
    )
    _ensure_session_accepts_counts(session)

    existing_idempotent = await _find_idempotent_count_line(db, line_data)
    if existing_idempotent:
        return existing_idempotent

    erp_item = await _get_erp_item_for_count_line(db, line_data)
    erp_qty, baseline_hash = await write_service.resolve_baseline(
        session_id=line_data.session_id,
        item_code=line_data.item_code,
        username=current_user["username"],
        erp_item=erp_item,
    )
    governance = await write_service.evaluate_new_count_line(
        session=session,
        item_code=line_data.item_code,
        counted_qty=line_data.counted_qty,
        erp_item=erp_item,
        expected_qty=erp_qty,
        variance_reason=line_data.variance_reason,
        correction_reason=line_data.correction_reason,
        location=line_data.floor_id,
    )
    risk_flags, is_misplaced, financial_impact = _build_count_line_risk_context(
        session,
        erp_item,
        line_data,
        governance.variance,
        erp_qty,
    )

    lock_state = await _acquire_count_line_locks(
        line_data,
        erp_item,
        current_user["username"],
    )
    try:
        recount_update_target = await _resolve_recount_target(db, line_data)
        count_line, counted_at = _build_count_line_document(
            line_data,
            erp_item,
            current_user,
            erp_qty,
            baseline_hash,
            governance,
            risk_flags,
            financial_impact,
            is_misplaced,
            recount_update_target,
        )
        await _persist_count_line_document(
            db,
            line_data,
            current_user["username"],
            count_line,
            counted_at,
            recount_update_target,
            write_service=write_service,
            session=session,
        )
    finally:
        await _release_count_line_locks(lock_state, current_user["username"])

    await _broadcast_scan_created(line_data, count_line, governance.variance)
    await _broadcast_dashboard_refresh(
        "count_line_created",
        session_id=line_data.session_id,
        count_line=count_line,
    )

    try:
        await recompute_session_totals(db, line_data.session_id)
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.error("Failed to update session stats: %s", _safe_log_value(exc, max_length=200))

    await _maybe_update_session_barcode(db, line_data)

    if count_line.get("risk_flags"):
        await _record_high_risk_correction(
            request,
            db,
            current_user,
            line_data,
            count_line,
            list(count_line.get("risk_flags") or []),
            float(count_line.get("variance") or governance.variance),
            float(count_line.get("financial_impact") or 0.0),
        )

    count_line.pop("_id", None)
    return count_line


async def verify_stock(
    line_id: str,
    current_user: dict,
    *,
    request: Request = None,
    db_override=None,
):
    """Mark a count line as verified. Exposed for direct test usage."""
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await _find_count_line(db_client, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    await _ensure_count_line_mutable(db_client, count_line)
    await _enforce_count_line_logic_from_line(
        db=db_client,
        count_line=count_line,
        request=request,
        current_user=current_user,
        operation_name="verify_stock",
    )
    if not count_line_requires_supervisor_review(count_line):
        raise HTTPException(
            status_code=409,
            detail="Only variance items require supervisor verification",
        )

    write_service = _get_count_line_write_service(db_client)
    update_result = await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": count_line["_id"]},
            "update": {
                "$set": {
                    "verified": True,
                    "verified_by": current_user["username"],
                    "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        },
        context={
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    await recompute_session_totals(db_client, str(count_line.get("session_id") or ""))
    await _broadcast_dashboard_refresh(
        "count_line_verified",
        session_id=str(count_line.get("session_id") or ""),
        count_line=count_line,
    )

    if _activity_log_service:
        await _activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="verify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    return {"message": "Stock verified", "verified": True}


async def unverify_stock(
    line_id: str,
    current_user: dict,
    *,
    request: Request = None,
    db_override=None,
):
    """Remove verification metadata from a count line."""
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await _find_count_line(db_client, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    await _ensure_count_line_mutable(db_client, count_line)
    await _enforce_count_line_logic_from_line(
        db=db_client,
        count_line=count_line,
        request=request,
        current_user=current_user,
        operation_name="unverify_stock",
    )

    write_service = _get_count_line_write_service(db_client)
    update_result = await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": count_line["_id"]},
            "update": {"$set": {"verified": False, "verified_by": None, "verified_at": None}},
        },
        context={
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    await recompute_session_totals(db_client, str(count_line.get("session_id") or ""))
    await _broadcast_dashboard_refresh(
        "count_line_unverified",
        session_id=str(count_line.get("session_id") or ""),
        count_line=count_line,
    )

    if _activity_log_service:
        await _activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="unverify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    return {"message": "Stock verification removed", "verified": False}


@router.put("/count-lines/{line_id}/verify")
async def verify_stock_route(
    line_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """HTTP route wrapper for verify_stock (UI expects this endpoint)."""
    return await verify_stock(line_id, current_user, request=request)


@router.put("/count-lines/{line_id}/unverify")
async def unverify_stock_route(
    line_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """HTTP route wrapper for unverify_stock (UI expects this endpoint)."""
    return await unverify_stock(line_id, current_user, request=request)


async def get_count_lines(
    session_id: str,
    current_user: dict,
    page: int = 1,
    page_size: int = 50,
    verified: Optional[bool] = None,
    *,
    db_override=None,
):
    """Get count lines with pagination. Shared between routes and tests."""
    return await _get_count_query_service(db_override).get_count_lines(
        session_id=session_id,
        page=page,
        page_size=page_size,
        verified=verified,
    )


@router.get("/count-lines")
async def list_count_lines(
    current_user: dict = Depends(get_current_user),
    session_id: Optional[str] = Query(None),
    item_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    limit: Optional[int] = Query(None, ge=1, le=200),
):
    filter_query: dict[str, Any] = {}
    if session_id:
        filter_query["session_id"] = session_id
    if item_code:
        filter_query["item_code"] = item_code

    effective_page_size = limit if limit is not None else page_size
    return await _get_count_query_service().list_count_lines(
        filter_query=filter_query,
        page=page,
        page_size=effective_page_size,
    )


@router.get("/count-lines/{line_id}")
async def get_count_line_detail(
    line_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a single count line for recount deep links and staff notifications."""
    db = _get_db_client()
    count_line = await _find_count_line(db, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")

    if current_user.get("role") == "staff":
        allowed_usernames = {
            count_line.get("counted_by"),
            count_line.get("created_by"),
            count_line.get("assigned_to"),
        }
        if current_user.get("username") not in allowed_usernames:
            raise HTTPException(status_code=403, detail="Insufficient permissions")

    count_line["_id"] = str(count_line["_id"])
    return materialize_count_line_review_state(count_line)


async def approve_count_line(
    line_id: str,
    request: Optional[CountLineApprovalRequest] = None,
    current_user: dict = Depends(get_current_user),
    *,
    http_request: Request | None = None,
):
    """Approve a count line variance."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        count_line = await _find_count_line(db, line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")
        await _ensure_count_line_mutable(db, count_line)
        await _enforce_count_line_logic_from_line(
            db=db,
            count_line=count_line,
            request=http_request,
            current_user=current_user,
            operation_name="approve_count_line",
        )

        approved_at = _current_timestamp()

        write_service = _get_count_line_write_service(db)
        result = await write_service.process_write(
            {
                "operation": "update_one",
                "filter": {"_id": count_line["_id"]},
                "update": {
                    "$set": {
                        "status": "approved",
                        "approval_status": "APPROVED",
                        "approved_by": current_user["username"],
                        "approved_at": approved_at,
                        "approval_note": request.notes if request else None,
                        "rejection_reason": None,
                        "assigned_to": None,
                    }
                },
            },
            context={
                "session_id": str(count_line.get("session_id") or ""),
                "governance_mode": "mutable_session",
            },
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

        await recompute_session_totals(db, str(count_line.get("session_id") or ""))
        await _broadcast_dashboard_refresh(
            "count_line_approved",
            session_id=str(count_line.get("session_id") or ""),
            count_line=count_line,
        )

        owner_id = count_line.get("counted_by") or count_line.get("created_by")
        if owner_id:
            notification_service = NotificationService(db)
            await notification_service.notify_count_approved(
                user_id=owner_id,
                count_line_id=str(count_line.get("id", line_id)),
                item_name=count_line.get("item_name", "Unknown"),
                approved_by=current_user["username"],
                session_id=count_line.get("session_id"),
                item_code=count_line.get("item_code"),
                barcode=count_line.get("barcode"),
            )

        # Audit Log Approval
        try:
            from backend.services.audit_service import AuditService

            audit_service = AuditService(db)
            await audit_service.log_event(
                event_type=AuditEventType.STOCK_COUNT_SUBMITTED,  # Using closest type or add generic stock event
                status=AuditLogStatus.SUCCESS,
                actor_username=current_user["username"],
                resource_id=line_id,
                details={"action": "approve_count_line", "line_id": line_id},
            )
        except (RuntimeError, TypeError, ValueError, OSError) as e:
            logger.error(
                "Failed to write audit log: %s",
                _safe_log_value(e, max_length=200),
            )

        return {"success": True, "message": "Count line approved"}
    except HTTPException:
        raise
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Error approving count line %s: %s",
            _safe_log_value(line_id),
            _safe_log_value(e, max_length=200),
        )
        _raise_count_lines_internal_error("Failed to approve count line", e)


async def reject_count_line(
    line_id: str,
    request: Optional[CountLineRejectRequest] = None,
    current_user: dict = Depends(get_current_user),
    *,
    http_request: Request | None = None,
):
    """Reject a count line (request recount)."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        count_line = await _find_count_line(db, line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")
        await _ensure_count_line_mutable(db, count_line)
        await _enforce_count_line_logic_from_line(
            db=db,
            count_line=count_line,
            request=http_request,
            current_user=current_user,
            operation_name="reject_count_line",
        )

        rejected_at = _current_timestamp()
        owner_id = count_line.get("counted_by") or count_line.get("created_by")
        assigned_to = (request.assign_to if request else None) or owner_id
        rejection_reason = (
            request.notes if request and request.notes else "Supervisor requested recount"
        )

        write_service = _get_count_line_write_service(db)
        result = await write_service.process_write(
            {
                "operation": "update_one",
                "filter": {"_id": count_line["_id"]},
                "update": {
                    "$set": {
                        "status": "rejected",
                        "approval_status": "REJECTED",
                        "rejected_by": current_user["username"],
                        "rejected_at": rejected_at,
                        "verified": False,
                        "verified_by": None,
                        "verified_at": None,
                        "rejection_reason": rejection_reason,
                        "recount_requested_at": rejected_at,
                        "recount_requested_by": current_user["username"],
                        "assigned_to": assigned_to,
                    }
                },
            },
            context={
                "session_id": str(count_line.get("session_id") or ""),
                "governance_mode": "mutable_session",
            },
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

        await recompute_session_totals(db, str(count_line.get("session_id") or ""))
        await _broadcast_dashboard_refresh(
            "count_line_rejected",
            session_id=str(count_line.get("session_id") or ""),
            count_line=count_line,
        )

        notification_service = NotificationService(db)
        notification_kwargs = {
            "count_line_id": str(count_line.get("id", line_id)),
            "item_name": count_line.get("item_name", "Unknown"),
            "reason": rejection_reason,
            "session_id": count_line.get("session_id"),
            "item_code": count_line.get("item_code"),
            "barcode": count_line.get("barcode"),
        }

        if owner_id and assigned_to and assigned_to != owner_id:
            await notification_service.notify_count_rejected(
                user_id=owner_id,
                rejected_by=current_user["username"],
                **notification_kwargs,
            )
            await notification_service.notify_recount_assigned(
                user_id=assigned_to,
                assigned_by=current_user["username"],
                assigned_to=assigned_to,
                **notification_kwargs,
            )
        elif assigned_to:
            await notification_service.notify_recount_assigned(
                user_id=assigned_to,
                assigned_by=current_user["username"],
                assigned_to=assigned_to,
                **notification_kwargs,
            )

        return {
            "success": True,
            "message": "Count line rejected",
            "assigned_to": assigned_to,
        }
    except HTTPException:
        raise
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Error rejecting count line %s: %s",
            _safe_log_value(line_id),
            _safe_log_value(e, max_length=200),
        )
        _raise_count_lines_internal_error("Failed to reject count line", e)


@router.put("/count-lines/{line_id}/approve")
async def approve_count_line_route(
    line_id: str,
    http_request: Request,
    request: Optional[CountLineApprovalRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    return await approve_count_line(
        line_id=line_id,
        request=request,
        current_user=current_user,
        http_request=http_request,
    )


@router.put("/count-lines/{line_id}/reject")
async def reject_count_line_route(
    line_id: str,
    http_request: Request,
    request: Optional[CountLineRejectRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    return await reject_count_line(
        line_id=line_id,
        request=request,
        current_user=current_user,
        http_request=http_request,
    )


@router.get("/count-lines/check/{session_id}/{item_code}")
async def check_item_counted(
    session_id: str,
    item_code: str,
    current_user: dict = Depends(get_current_user),
):
    """Check if an item has already been counted in the session"""
    db = _get_db_client()
    try:
        # Find all count lines for this item in this session
        count_lines = await _get_count_query_service(db).list_count_lines_for_item(
            session_id,
            item_code,
        )

        # Convert ObjectId to string
        for line in count_lines:
            line["_id"] = str(line["_id"])
            # Frontend expects a stable `line_id` field for follow-up actions (add qty, etc).
            line.setdefault("line_id", line.get("id") or line["_id"])

        return {"already_counted": len(count_lines) > 0, "count_lines": count_lines}
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Error checking item count: %s",
            _safe_log_value(e, max_length=200),
        )
        _raise_count_lines_internal_error("Failed to check item count status", e)


@router.get("/count-lines/check-serial/{session_id}/{serial_number}")
async def check_serial_uniqueness(
    session_id: str,
    serial_number: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Check whether a serial number has already been counted within a session.

    Returns a small payload that the UI can use to prevent duplicate serial entry.
    """
    db = _get_db_client()

    normalized = (serial_number or "").strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="serial_number is required")

    candidates = {normalized, normalized.upper()}
    projection = {
        "_id": 0,
        "item_code": 1,
        "item_name": 1,
        "counted_by": 1,
        "floor_no": 1,
        "rack_no": 1,
        "status": 1,
    }

    for candidate in candidates:
        existing = await _get_count_query_service(db).find_serial_count_line(
            session_id=session_id,
            serial_number=candidate,
            projection=projection,
        )
        if existing:
            return {"exists": True, **existing}

    return {"exists": False}


@router.get("/count-lines/session/{session_id}")
async def get_count_lines_route(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    verified: Optional[bool] = Query(None, description="Filter by verification status"),
):
    return await get_count_lines(
        session_id,
        current_user,
        page=page,
        page_size=page_size,
        verified=verified,
    )


async def _find_count_line(db, line_id: str) -> Optional[dict]:
    """Find a count line by id or _id."""
    return await _get_count_query_service(db).find_count_line(line_id)


def _current_timestamp() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.patch("/count-lines/{line_id}/add-quantity")
async def add_quantity_to_count_line(
    line_id: str,
    request: Request,
    payload: AddQuantityRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Increment the counted quantity on an existing count line.

    Used by the UI when the same item_code is scanned again and the user chooses
    "Add to Existing" instead of creating a new count line.
    """
    db = _get_db_client()
    write_service = _get_count_line_write_service(db)

    count_line = await _find_count_line(db, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    session = await _ensure_count_line_mutable(db, count_line)
    await _enforce_count_line_logic_from_line(
        db=db,
        count_line=count_line,
        request=request,
        current_user=current_user,
        operation_name="add_quantity_to_count_line",
    )

    if payload.additional_qty == 0:
        raise HTTPException(status_code=400, detail="additional_qty must be non-zero")

    # Staff can only mutate their own count lines; supervisors/admin can mutate any.
    if current_user.get("role") not in {"supervisor", "admin"} and count_line.get(
        "counted_by"
    ) != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Not authorized to modify this count line")

    old_counted_qty = float(count_line.get("counted_qty") or 0)
    new_counted_qty = old_counted_qty + float(payload.additional_qty)
    erp_item = await _get_erp_item_for_existing_count_line(db, count_line)
    update_data = {
        "counted_qty": new_counted_qty,
        "updated_at": _current_timestamp(),
        "updated_by": current_user.get("username"),
    }
    if payload.batches is not None:
        update_data["batches"] = payload.batches

    update_result = await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": count_line["_id"]},
            "update": {"$set": update_data},
        },
        context={
            "session": session,
            "erp_item": erp_item,
            "username": current_user.get("username"),
            "variance_reason": count_line.get("variance_reason"),
            "correction_reason": count_line.get("correction_reason"),
            "location": str(count_line.get("floor_no") or ""),
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    try:
        await recompute_session_totals(db, str(count_line.get("session_id") or ""))
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.warning(
            "Failed to recompute session totals after add-quantity: %s",
            _safe_log_value(exc, max_length=200),
        )
    else:
        await _broadcast_dashboard_refresh(
            "count_line_quantity_updated",
            session_id=str(count_line.get("session_id") or ""),
            count_line=count_line,
        )

    return {
        "success": True,
        "message": "Quantity added successfully",
        "data": update_data,
        "financial_impact": update_data.get("financial_impact"),
    }


@router.put("/count-lines/{line_id}")
async def update_count_line(
    line_id: str,
    request: Request,
    payload: CountLineUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing count line.

    Currently used by bulk tooling to patch counted_qty. We keep the payload minimal
    to avoid accidental overwrites of governance fields.
    """
    db = _get_db_client()
    write_service = _get_count_line_write_service(db)

    count_line = await _find_count_line(db, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    session = await _ensure_count_line_mutable(db, count_line)
    await _enforce_count_line_logic_from_line(
        db=db,
        count_line=count_line,
        request=request,
        current_user=current_user,
        operation_name="update_count_line",
    )

    if payload.counted_qty is None and payload.batches is None:
        raise HTTPException(status_code=400, detail="No updatable fields provided")

    # Staff can only mutate their own count lines; supervisors/admin can mutate any.
    if current_user.get("role") not in {"supervisor", "admin"} and count_line.get(
        "counted_by"
    ) != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Not authorized to modify this count line")

    if payload.counted_qty is not None:
        new_counted_qty = float(payload.counted_qty)
        erp_item = await _get_erp_item_for_existing_count_line(db, count_line)
        update_data = {
            "counted_qty": new_counted_qty,
            "updated_at": _current_timestamp(),
            "updated_by": current_user.get("username"),
        }
    else:
        update_data = {
            "updated_at": _current_timestamp(),
            "updated_by": current_user.get("username"),
        }

    if payload.batches is not None:
        update_data["batches"] = payload.batches

    update_result = await write_service.process_write(
        {
            "operation": "update_one",
            "filter": {"_id": count_line["_id"]},
            "update": {"$set": update_data},
        },
        context={
            "session": session,
            "erp_item": erp_item if payload.counted_qty is not None else None,
            "username": current_user.get("username"),
            "variance_reason": count_line.get("variance_reason"),
            "correction_reason": count_line.get("correction_reason"),
            "location": str(count_line.get("floor_no") or ""),
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    try:
        await recompute_session_totals(db, str(count_line.get("session_id") or ""))
    except (RuntimeError, TypeError, ValueError, OSError) as exc:
        logger.warning(
            "Failed to recompute session totals after count-line update: %s",
            _safe_log_value(exc, max_length=200),
        )
    else:
        await _broadcast_dashboard_refresh(
            "count_line_updated",
            session_id=str(count_line.get("session_id") or ""),
            count_line=count_line,
        )

    return {"success": True, "message": "Count line updated successfully", "data": update_data}


async def _recalculate_session_stats(db, session_id: str) -> None:
    """Re-calculate session stats after line deletion."""
    try:
        await recompute_session_totals(db, session_id)
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Failed to update session stats after delete: %s",
            _safe_log_value(e, max_length=200),
        )


async def _log_delete_activity(
    count_line: dict, line_id: str, current_user: dict, request: Request
) -> None:
    """Log the delete activity if activity log service is available."""
    if not _activity_log_service:
        return
    await _activity_log_service.log_activity(
        user=current_user["username"],
        role=current_user.get("role", ""),
        action="delete_count_line",
        entity_type="count_line",
        entity_id=str(count_line.get("id", line_id)),
        details={
            "item_code": count_line.get("item_code"),
            "session_id": count_line.get("session_id"),
            "counted_qty": count_line.get("counted_qty"),
        },
        ip_address=request.client.host if request and request.client else None,
        user_agent=request.headers.get("user-agent") if request else None,
    )


@router.delete("/count-lines/{line_id}")
async def delete_count_line(
    line_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Delete a count line (requires supervisor override)."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        count_line = await _find_count_line(db, line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")
        await _ensure_count_line_mutable(db, count_line)
        await _enforce_count_line_logic_from_line(
            db=db,
            count_line=count_line,
            request=request,
            current_user=current_user,
            operation_name="delete_count_line",
        )

        write_service = _get_count_line_write_service(db)
        result = await write_service.process_write(
            {"operation": "delete_one", "filter": {"_id": count_line["_id"]}},
            context={
                "session_id": str(count_line.get("session_id") or ""),
                "governance_mode": "mutable_session",
            },
        )
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

        await _recalculate_session_stats(db, count_line["session_id"])
        await _broadcast_dashboard_refresh(
            "count_line_deleted",
            session_id=str(count_line.get("session_id") or ""),
            count_line=count_line,
        )
        await _log_delete_activity(count_line, line_id, current_user, request)

        return {"success": True, "message": "Count line deleted successfully"}

    except HTTPException:
        raise
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Error deleting count line %s: %s",
            _safe_log_value(line_id),
            _safe_log_value(e, max_length=200),
        )
        _raise_count_lines_internal_error("Failed to delete count line", e)


@router.get("/sessions/{session_id}/items/{item_code}/scan-status")
async def check_item_scan_status(
    session_id: str,
    item_code: str,
    current_user: dict = Depends(get_current_user),
):
    """Check if item has been scanned in this session and where"""
    db = _get_db_client()

    # Find all count lines for this item in this session
    count_lines = await _get_count_query_service(db).list_count_lines_for_item(
        session_id,
        item_code,
    )

    if not count_lines:
        return {"scanned": False, "total_qty": 0, "locations": []}

    total_qty = sum(line.get("counted_qty", 0) for line in count_lines)

    locations = []
    for line in count_lines:
        locations.append(
            {
                "floor_no": line.get("floor_no"),
                "rack_no": line.get("rack_no"),
                "counted_qty": line.get("counted_qty"),
                "counted_by": line.get("counted_by"),
                "counted_at": line.get("counted_at"),
            }
        )

    return {"scanned": True, "total_qty": total_qty, "locations": locations}


@router.post("/count-lines/bulk/approve")
async def bulk_approve_count_lines(
    request: Request,
    update_data: BulkCountLineUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Bulk approve count lines."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        # Build query to match any of the provided IDs (checking both id and _id)
        ids = update_data.count_line_ids
        object_ids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]

        query = {"$or": [{"id": {"$in": ids}}, {"_id": {"$in": object_ids}}]}
        candidate_lines = await _get_count_query_service(db).find_count_lines_by_query(
            query,
            length=max(len(ids), 1),
        )
        for candidate in candidate_lines:
            await _ensure_count_line_mutable(db, candidate)
            await _enforce_count_line_logic_from_line(
                db=db,
                count_line=candidate,
                request=request,
                current_user=current_user,
                operation_name="bulk_approve_count_lines",
            )

        session_ids = {
            str(candidate.get("session_id"))
            for candidate in candidate_lines
            if candidate.get("session_id")
        }
        write_service = _get_count_line_write_service(db)
        result = await write_service.process_write(
            {
                "operation": "update_many",
                "filter": query,
                "update": {
                    "$set": {
                        "status": "approved",
                        "approval_status": "APPROVED",
                        "approved_by": current_user["username"],
                        "approved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "verified": True,
                        "verified_by": current_user["username"],
                        "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "approval_note": update_data.notes,
                    }
                },
            },
            context={
                "candidate_lines": candidate_lines,
                "session_ids": list(session_ids),
                "governance_mode": "mutable_session",
            },
        )

        for session_id in session_ids:
            await recompute_session_totals(db, session_id)
        if session_ids:
            await _broadcast_dashboard_refresh(
                "count_lines_bulk_approved",
                session_ids=session_ids,
            )

        return {
            "success": True,
            "message": f"Approved {result.modified_count} items",
            "modified_count": result.modified_count,
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error bulk approving: %s", _safe_log_value(e, max_length=200))
        _raise_count_lines_internal_error("Failed to bulk approve count lines", e)


class CountLineBatchCreate(BaseModel):
    """Batch create payload for multiple count lines."""

    session_id: str
    lines: list[CountLineCreate]


@router.post("/count-lines/batch")
async def create_count_lines_batch(
    request: Request,
    batch_data: CountLineBatchCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create multiple count lines in a single request (batch operation)."""
    db = _get_db_client()
    results = []
    errors = []
    write_service = _get_count_line_write_service(db)

    session = await _get_mutable_session_or_409(db, batch_data.session_id)
    await _enforce_count_line_session_logic(
        db=db,
        session=session,
        request=request,
        current_user=current_user,
        operation_name="create_count_lines_batch",
    )
    if session.get("status") not in ["OPEN", "ACTIVE"]:
        raise HTTPException(status_code=400, detail="Session is not active")

    for idx, line_data in enumerate(batch_data.lines):
        try:
            enriched_line = CountLineCreate.model_validate(
                {
                    **line_data.model_dump(mode="json"),
                    "session_id": batch_data.session_id,
                    "batch_id": (
                        line_data.batch_id
                        or f"batch_{datetime.now(timezone.utc).replace(tzinfo=None).isoformat()}"
                    ),
                }
            )
            (
                count_line,
                _counted_at,
                _governance,
                _risk_flags,
                _financial_impact,
            ) = await _create_and_persist_count_line(
                db,
                session=session,
                line_data=enriched_line,
                current_user=current_user,
                write_service=write_service,
            )
            results.append({"index": idx, "id": str(count_line.get("id") or ""), "success": True})
        except (RuntimeError, TypeError, ValueError, OSError) as e:
            errors.append({"index": idx, "error": str(e)})

    await recompute_session_totals(db, batch_data.session_id)

    return {
        "success": len(results) > 0,
        "created": len(results),
        "failed": len(errors),
        "results": results,
        "errors": errors,
    }


@router.post("/count-lines/bulk/reject")
async def bulk_reject_count_lines(
    request: Request,
    update_data: BulkCountLineUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Bulk reject count lines."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        # Build query
        ids = update_data.count_line_ids
        object_ids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]

        query = {"$or": [{"id": {"$in": ids}}, {"_id": {"$in": object_ids}}]}
        candidate_lines = await _get_count_query_service(db).find_count_lines_by_query(
            query,
            length=max(len(ids), 1),
        )
        for candidate in candidate_lines:
            await _ensure_count_line_mutable(db, candidate)
            await _enforce_count_line_logic_from_line(
                db=db,
                count_line=candidate,
                request=request,
                current_user=current_user,
                operation_name="bulk_reject_count_lines",
            )

        session_ids = {
            str(candidate.get("session_id"))
            for candidate in candidate_lines
            if candidate.get("session_id")
        }
        write_service = _get_count_line_write_service(db)
        result = await write_service.process_write(
            {
                "operation": "update_many",
                "filter": query,
                "update": {
                    "$set": {
                        "status": "rejected",
                        "approval_status": "REJECTED",
                        "rejected_by": current_user["username"],
                        "rejected_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "verified": False,
                        "rejection_reason": update_data.notes,
                    }
                },
            },
            context={
                "candidate_lines": candidate_lines,
                "session_ids": list(session_ids),
                "governance_mode": "mutable_session",
            },
        )

        for session_id in session_ids:
            await recompute_session_totals(db, session_id)
        if session_ids:
            await _broadcast_dashboard_refresh(
                "count_lines_bulk_rejected",
                session_ids=session_ids,
            )

        return {
            "success": True,
            "message": f"Rejected {result.modified_count} items",
            "modified_count": result.modified_count,
        }
    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error("Error bulk rejecting: %s", _safe_log_value(e, max_length=200))
        _raise_count_lines_internal_error("Failed to bulk reject count lines", e)


# Canonical /api/item-batches/* route is served by erp_api.
# Keep this endpoint for count-lines specific workflows to avoid route shadowing.
def _sql_connector_is_connected(sql_connector: Any) -> bool:
    return bool(sql_connector and getattr(sql_connector, "connection", None))


def _build_mongo_item_batch_query(item_identifier: str) -> dict[str, Any]:
    query: dict[str, Any] = {"$or": [{"item_code": item_identifier}, {"barcode": item_identifier}]}
    if item_identifier.isdigit():
        query["$or"].append({"item_id": int(item_identifier)})
    return query


def _mongo_item_to_batch(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "batch_id": item.get("batch_id"),
        "batch_no": item.get("batch_no", ""),
        "barcode": item.get("barcode"),
        "mfg_date": item.get("mfg_date"),
        "expiry_date": item.get("expiry_date"),
        "stock_qty": item.get("stock_qty", 0),
        "mrp": item.get("mrp"),
        "warehouse_id": item.get("warehouse_id"),
        "warehouse_name": item.get("warehouse_name", "Cached"),
        "item_code": item.get("item_code"),
        "item_name": item.get("item_name"),
    }


def _normalize_batch_record(batch: dict[str, Any]) -> dict[str, Any]:
    barcode = batch.get("barcode") or batch.get("auto_barcode") or ""
    return {
        "batch_id": batch.get("batch_id"),
        "batch_no": batch.get("batch_no"),
        "barcode": barcode,
        "mfg_date": batch.get("mfg_date"),
        "expiry_date": batch.get("expiry_date"),
        "stock_qty": batch.get("stock_qty", 0),
        "mrp": batch.get("mrp"),
        "opening_stock": batch.get("opening_stock", 0),
        "warehouse_id": batch.get("warehouse_id"),
        "warehouse_name": batch.get("warehouse_name"),
        "shelf_id": batch.get("shelf_id"),
        "shelf_name": batch.get("shelf_name"),
        "item_code": batch.get("item_code"),
        "item_name": batch.get("item_name"),
    }


def _stock_sort_value(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _sort_batches_by_stock(batches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        batches,
        key=lambda batch: (
            -_stock_sort_value(batch.get("stock_qty")),
            str(batch.get("batch_no") or ""),
        ),
    )


def _load_batches_from_sql(
    item_identifier: str,
    sql_connector: Any,
) -> tuple[list[dict[str, Any]], bool]:
    if not sql_connector:
        return [], False

    try:
        if _sql_connector_is_connected(sql_connector):
            return list(sql_connector.get_item_batches(item_identifier)), True

        logger.info(
            "SQL connector available but not connected for '%s'",
            _safe_log_value(item_identifier),
        )
    except (RuntimeError, TypeError, ValueError, OSError) as sql_err:
        logger.warning(
            "SQL Server batch fetch failed for '%s': %s",
            _safe_log_value(item_identifier),
            _safe_log_value(sql_err, max_length=200),
        )

    return [], False


async def _load_batches_from_mongo(
    db: Any,
    item_identifier: str,
) -> list[dict[str, Any]]:
    logger.info(
        "Using MongoDB offline cache for item batches: %s",
        _safe_log_value(item_identifier),
    )
    mongo_items = await _get_count_query_service(db).load_item_batches(
        _build_mongo_item_batch_query(item_identifier)
    )
    return [_mongo_item_to_batch(item) for item in mongo_items]


@router.get("/count-lines/item-batches/{item_identifier}")
async def get_item_batches(
    item_identifier: str,
    current_user: dict = Depends(get_current_user),
    db_override=None,
):
    """
    Get all batches for a specific item by item code or item ID.
    Returns batch details including MRP, barcode, stock quantity, and location info.
    """
    try:
        db = _get_db_client(db_override)
        batches, fetched_from_sql = _load_batches_from_sql(item_identifier, _sql_connector)
        source = "sql_server" if fetched_from_sql else "mongodb_offline_cache"
        if not fetched_from_sql:
            batches = await _load_batches_from_mongo(db, item_identifier)

        transformed_batches = _sort_batches_by_stock(
            [_normalize_batch_record(batch) for batch in batches]
        )

        return {
            "success": True,
            "source": source,
            "batches": transformed_batches,
            "total_batches": len(transformed_batches),
            "item_identifier": item_identifier,
        }

    except (RuntimeError, TypeError, ValueError, OSError) as e:
        logger.error(
            "Error fetching item batches: %s",
            _safe_log_value(e, max_length=200),
        )
        _raise_count_lines_internal_error("Failed to fetch item batches", e)


class CountLineMergeRequest(BaseModel):
    """Request to merge duplicate count lines"""

    source_line_ids: list[str]
    target_line_id: str
    keep_target_qty: bool = True


@router.post("/count-lines/merge")
async def merge_count_lines(
    http_request: Request,
    payload: CountLineMergeRequest,
    current_user: dict = Depends(get_current_user),
    db_override=None,
):
    """Merge multiple count lines into one (deduplication)."""
    if current_user.get("role") not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Supervisor access required")

    db = _get_db_client(db_override)
    results: dict[str, list[Any]] = {"merged": [], "failed": []}
    write_service = _get_count_line_write_service(db)
    query_service = _get_count_query_service(db)

    target_line = await query_service.find_count_line_by_id_field(payload.target_line_id)
    if not target_line:
        raise HTTPException(status_code=404, detail="Target count line not found")
    await _enforce_count_line_logic_from_line(
        db=db,
        count_line=target_line,
        request=http_request,
        current_user=current_user,
        operation_name="merge_count_lines",
    )

    target_session = await _ensure_count_line_mutable(db, target_line)
    target_session_id = str(target_line.get("session_id") or "")
    target_qty = float(target_line.get("counted_qty", 0) or 0)
    merged_count = 0

    for source_id in payload.source_line_ids:
        if source_id == payload.target_line_id:
            continue

        source_line = await query_service.find_count_line_by_id_field(source_id)
        if not source_line:
            results["failed"].append({"id": source_id, "error": "Not found"})
            continue
        await _enforce_count_line_logic_from_line(
            db=db,
            count_line=source_line,
            request=http_request,
            current_user=current_user,
            operation_name="merge_count_lines",
        )
        source_session_id = str(source_line.get("session_id") or "")
        if source_session_id != target_session_id:
            results["failed"].append(
                {
                    "id": source_id,
                    "error": "Cross-session merge is not allowed",
                }
            )
            continue

        try:
            if payload.keep_target_qty:
                merged_qty = target_qty + float(source_line.get("counted_qty", 0) or 0)
            else:
                merged_qty = float(source_line.get("counted_qty", 0) or 0) + target_qty

            erp_item = await _get_erp_item_for_existing_count_line(db, target_line)
            async with write_service.transaction() as tx:
                await write_service.process_write(
                    {
                        "operation": "update_one",
                        "filter": {"id": payload.target_line_id},
                        "update": {
                            "$set": {"counted_qty": merged_qty},
                            "$push": {"merged_from": source_id},
                        },
                    },
                    context={
                        "session": target_session,
                        "erp_item": erp_item,
                        "variance_reason": target_line.get("variance_reason"),
                        "correction_reason": target_line.get("correction_reason"),
                        "location": target_line.get("floor_no"),
                        "username": current_user.get("username"),
                        "db_session": tx,
                        "governance_mode": "mutable_session",
                        "skip_session_totals_update": True,
                    },
                )

                await write_service.process_write(
                    {
                        "operation": "update_one",
                        "filter": {"id": source_id},
                        "update": {
                            "$set": {"merged_into_id": payload.target_line_id},
                        },
                    },
                    context={
                        "session_id": source_session_id,
                        "username": current_user.get("username"),
                        "db_session": tx,
                        "governance_mode": "mutable_session",
                        "skip_session_totals_update": True,
                    },
                )
            results["merged"].append(source_id)
            target_qty = merged_qty
            target_line["counted_qty"] = merged_qty
            merged_count += 1

        except (RuntimeError, TypeError, ValueError, OSError) as e:
            results["failed"].append({"id": source_id, "error": str(e)})

    if merged_count > 0 and target_session_id:
        try:
            await recompute_session_totals(db, target_session_id)
        except (RuntimeError, TypeError, ValueError, OSError) as exc:
            logger.warning(
                "Failed to recompute session totals after merge: %s",
                _safe_log_value(exc, max_length=200),
            )

    return {"success": True, "target_line_id": payload.target_line_id, **results}
