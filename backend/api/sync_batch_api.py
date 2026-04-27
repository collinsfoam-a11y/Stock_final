"""
Batch Sync API - High-performance batch synchronization
Handles offline queue sync with conflict detection and retry logic
and preserves backward compatibility with legacy offline payloads.
"""

import logging
import re
import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from backend.api.schemas import Session
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
from backend.middleware.security import batch_rate_limiter
from backend.services.canonical_inventory import (
    can_reuse_rejected_count_line,
    extract_document_id,
    find_duplicate_count_line,
    find_session,
    recompute_session_totals,
)
from backend.services.circuit_breaker import get_circuit_breaker
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.logic_guard import (
    RequestContext,
    apply_pin_to_new_session,
    build_request_context,
    enforce_session_logic,
)
from backend.services.lock_manager import LockManager, get_lock_manager
from backend.services.redis_service import get_redis
from backend.services.sync_conflicts_service import SyncConflictsService

logger = logging.getLogger(__name__)


def _build_sync_request_context(
    *,
    current_user: dict[str, Any],
    operation_name: str,
    session_id: Optional[str] = None,
    warehouse: Optional[str] = None,
    request_id: Optional[str] = None,
) -> RequestContext:
    context = build_request_context(
        request=None,
        current_user=current_user,
        session_id=session_id,
        warehouse=warehouse,
        endpoint_name="sync_batch_api",
        operation_name=operation_name,
    )
    if request_id:
        context = context.model_copy(update={"request_id": request_id})
    return context


async def _enforce_sync_session_logic(
    *,
    db: Any,
    session: dict[str, Any],
    current_user: dict[str, Any],
    operation_name: str,
    request_id: Optional[str],
) -> None:
    await enforce_session_logic(
        db=db,
        session=session,
        request_context=_build_sync_request_context(
            current_user=current_user,
            operation_name=operation_name,
            session_id=str(session.get("id") or session.get("session_id") or ""),
            warehouse=session.get("warehouse"),
            request_id=request_id,
        ),
        is_mutation=True,
    )


class LegacySyncOperation(BaseModel):
    """Legacy offline queue operation structure"""

    id: str
    type: str
    data: dict[str, Any]
    timestamp: Optional[str] = None

    model_config = ConfigDict(extra="allow")


router = APIRouter(prefix="/api/sync", tags=["Sync"])


# Request/Response Models


class SyncRecord(BaseModel):
    """Single record to sync"""

    client_record_id: str = Field(..., description="Unique client-side record ID")
    session_id: str = Field(..., description="Session ID")
    rack_id: Optional[str] = Field(None, description="Rack ID")
    floor: Optional[str] = Field(None, description="Floor")
    item_code: str = Field(..., description="Item code")
    verified_qty: float = Field(..., description="Verified quantity")
    damaged_qty: float = Field(0, description="Damage quantity")
    serial_numbers: list[str] = Field(default_factory=list, description="Serial numbers")
    mfg_date: Optional[str] = Field(None, description="Manufacturing date")
    mrp: Optional[float] = Field(None, description="MRP")
    uom: Optional[str] = Field(None, description="Unit of measure")
    category: Optional[str] = Field(None, description="Category")
    subcategory: Optional[str] = Field(None, description="Subcategory")
    item_condition: Optional[str] = Field(None, description="Item condition")
    evidence_photos: list[str] = Field(default_factory=list, description="Photo URLs")
    status: str = Field("finalized", description="Record status (partial/finalized)")
    created_at: str = Field(..., description="Client creation timestamp")
    updated_at: str = Field(..., description="Client update timestamp")


class BatchSyncRequest(BaseModel):
    """Batch sync request supporting modern records and legacy operations"""

    records: list[SyncRecord] = Field(
        default_factory=list, description="Structured records to sync"
    )
    operations: list[LegacySyncOperation] = Field(
        default_factory=list,
        description="Legacy operations array used by earlier clients",
    )
    batch_id: Optional[str] = Field(None, description="Client batch ID for tracking")

    model_config = ConfigDict(extra="ignore")


class SyncConflict(BaseModel):
    """Sync conflict details"""

    client_record_id: str
    conflict_type: str  # duplicate_serial, invalid_data, lock_conflict, etc.
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class SyncError(BaseModel):
    """Sync error details"""

    client_record_id: str
    error_type: str
    message: str


class SyncResult(BaseModel):
    """Per-record sync result for backward compatibility"""

    id: str = Field(..., description="Client record identifier")
    success: bool = Field(..., description="Whether the record synced successfully")
    message: Optional[str] = Field(
        None, description="Optional error or conflict message for the record"
    )


class BatchSyncResponse(BaseModel):
    """Batch sync response"""

    ok: list[str] = Field(default_factory=list, description="Successfully synced record IDs")
    conflicts: list[SyncConflict] = Field(
        default_factory=list, description="Records with conflicts"
    )
    errors: list[SyncError] = Field(default_factory=list, description="Failed records")
    batch_id: Optional[str] = Field(None, description="Batch ID from request")
    processing_time_ms: float = Field(..., description="Server processing time")
    total_records: int = Field(..., description="Total records in batch")
    results: list[SyncResult] = Field(
        default_factory=list,
        description="Backward compatible per-record results (id/success/message)",
    )
    processed_count: Optional[int] = Field(
        None, description="Legacy summary: total operations processed"
    )
    success_count: Optional[int] = Field(None, description="Legacy summary: successful operations")
    failed_count: Optional[int] = Field(None, description="Legacy summary: failed operations")


# Sync Logic


async def validate_record(
    record: SyncRecord,
    db,
    lock_manager: LockManager,
    sync_service: Optional[SyncConflictsService] = None,
    user_id: Optional[str] = None,
) -> Optional[SyncConflict]:
    """
    Validate a single record before syncing

    Returns:
        SyncConflict if validation fails, None if valid
    """
    # Check for duplicate serial numbers
    if record.serial_numbers:
        for serial in record.serial_numbers:
            existing = await db.item_serials.find_one({"serial_number": serial})
            if existing and existing.get("client_record_id") != record.client_record_id:
                conflict_id = None
                if sync_service and user_id:
                    # Convert ObjectIds in existing to strings for comparison
                    server_data = {
                        k: str(v) if isinstance(v, (ObjectId, uuid.UUID)) else v
                        for k, v in existing.items()
                        if k != "_id"
                    }

                    conflict_id = await sync_service.detect_conflict(
                        entity_type="item_serial",
                        entity_id=str(existing.get("_id")),
                        local_data=record.model_dump(),
                        server_data=server_data,
                        user=user_id,
                        session_id=record.session_id,
                    )

                return SyncConflict(
                    client_record_id=record.client_record_id,
                    conflict_type="duplicate_serial",
                    message=f"Serial number '{serial}' already exists",
                    details={
                        "serial": serial,
                        "existing_record": str(existing.get("_id")),
                        "conflict_id": conflict_id,
                    },
                )

    # Validate damage qty <= verified qty
    if record.damaged_qty > record.verified_qty:
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="invalid_quantity",
            message="Damage quantity cannot exceed verified quantity",
            details={
                "verified_qty": record.verified_qty,
                "damaged_qty": record.damaged_qty,
            },
        )

    # Check rack lock (if rack_id provided)
    if record.rack_id:
        owner = await lock_manager.get_rack_lock_owner(record.rack_id)
        if owner and owner != record.session_id:
            return SyncConflict(
                client_record_id=record.client_record_id,
                conflict_type="rack_locked",
                message=f"Rack {record.rack_id} is locked by another session",
                details={"rack_id": record.rack_id, "owner": owner},
            )

    return None


async def sync_single_record(
    record: SyncRecord,
    db,
    current_user: dict[str, Any] | str,
    request_id: Optional[str] = None,
) -> tuple[bool, Optional[str]]:
    """
    Sync a single record to database

    Returns:
        (success: bool, error_message: Optional[str])
    """
    try:
        actor = (
            current_user
            if isinstance(current_user, dict)
            else {"username": str(current_user), "id": str(current_user)}
        )
        # C2+MM2 fix: Check session status before writing (allowlist approach matching legacy path)
        session = await db.sessions.find_one(
            {"$or": [{"id": record.session_id}, {"session_id": record.session_id}]}
        )
        if session:
            await _enforce_sync_session_logic(
                db=db,
                session=session,
                current_user=actor,
                operation_name="sync_single_record",
                request_id=request_id,
            )

            session_status = str(session.get("status", "")).upper()
            if session.get("finalized_at"):
                return (
                    False,
                    f"Session {record.session_id} is finalized and cannot accept new records",
                )
            allowed = {"OPEN", "ACTIVE"}
            # Allow RECONCILE sessions if reconciled_at is set
            if session_status == "RECONCILE" or (
                session_status == "ACTIVE" and session.get("reconciled_at")
            ):
                pass  # allowed
            elif session_status not in allowed:
                return (
                    False,
                    f"Session {record.session_id} is {session_status} and cannot accept new records",
                )

        status_normalized = (record.status or "").strip().lower()
        is_finalized = status_normalized == "finalized"
        # Prepare document
        doc = {
            "id": record.client_record_id,
            "client_record_id": record.client_record_id,
            "idempotency_key": record.client_record_id,
            "session_id": record.session_id,
            "rack_no": record.rack_id,
            "floor_no": record.floor,
            "item_code": record.item_code,
            "counted_qty": record.verified_qty,
            "damaged_qty": record.damaged_qty,
            "serial_numbers": record.serial_numbers,
            "manufacturing_date": record.mfg_date,
            "mrp": record.mrp,
            "uom": record.uom,
            "category": record.category,
            "subcategory": record.subcategory,
            "item_condition": record.item_condition,
            "evidence_photos": record.evidence_photos,
            "status": "locked" if is_finalized else "pending",
            "approval_status": "APPROVED" if is_finalized else "PENDING",
            "verified": is_finalized,
            "verified_by": actor.get("username") if is_finalized else None,
            "verified_at": record.updated_at if is_finalized else None,
            "finalized_by": actor.get("username") if is_finalized else None,
            "finalized_at": record.updated_at if is_finalized else None,
            "counted_at": record.created_at,
            "updated_at": record.updated_at,
            "sync_status": "synced",
            "synced_by": actor.get("username"),
            "synced_at": time.time(),
        }

        write_service = CountLineWriteService(db)
        # Upsert record through authoritative write gate
        await write_service.process_write(
            {
                "operation": "update_one",
                "filter": {
                    "session_id": record.session_id,
                    "idempotency_key": record.client_record_id,
                },
                "update": {"$set": doc},
                "upsert": True,
            },
            context=(
                {
                    "session": session,
                    "username": actor.get("username"),
                    "location": record.floor,
                }
                if isinstance(session, dict)
                and (session.get("id") or session.get("session_id"))
                else {
                    "session_id": record.session_id,
                    "username": actor.get("username"),
                    "location": record.floor,
                }
            ),
        )
        await recompute_session_totals(db, record.session_id)

        # Insert serial numbers
        if record.serial_numbers:
            serial_docs = [
                {
                    "serial_number": serial,
                    "item_code": record.item_code,
                    "session_id": record.session_id,
                    "rack_id": record.rack_id,
                    "client_record_id": record.client_record_id,
                    "created_at": time.time(),
                }
                for serial in record.serial_numbers
            ]

            # Insert with ignore duplicates
            try:
                await db.item_serials.insert_many(serial_docs, ordered=False)
            except Exception as e:
                # Ignore duplicate key errors
                if "duplicate key" not in str(e).lower():
                    raise

        return True, None

    except Exception as e:
        logger.error(f"Error syncing record {record.client_record_id}: {str(e)}")
        return False, str(e)


@router.post("/batch", response_model=BatchSyncResponse)
async def sync_batch(
    http_request: Request,
    request: BatchSyncRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> BatchSyncResponse:
    """
    Batch sync endpoint - sync multiple records in one request

    Features:
    - Rate limiting: 10 requests per minute per user
    - Validates all records before syncing
    - Detects conflicts (duplicate serials, invalid data, etc.)
    - Uses circuit breaker for resilience
    - Returns detailed success/conflict/error breakdown
    """
    start_time = time.time()
    request_id = (
        http_request.headers.get("x-request-id")
        or http_request.headers.get("x-correlation-id")
        or getattr(http_request.state, "request_id", None)
    )

    # Rate limiting check
    user_id = (
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or str(current_user.get("_id", "unknown"))
    )
    is_allowed, rate_info = batch_rate_limiter.is_allowed(user_id)
    if not is_allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "message": "Rate limit exceeded for batch sync",
                "retry_after": rate_info.get("retry_after", 60),
                "limit": rate_info.get("limit", 10),
            },
            headers={"Retry-After": str(rate_info.get("retry_after", 60))},
        )

    # Legacy payloads only provided an operations array
    if not request.records and request.operations:
        return await _process_legacy_operations(
            operations=request.operations,
            batch_id=request.batch_id,
            current_user=current_user,
            start_time=start_time,
            request_id=str(request_id).strip() if request_id else None,
        )

    if not request.records:
        raise HTTPException(
            status_code=400,
            detail="No records provided for batch sync",
        )

    # Get database
    db = get_db()

    # Get lock manager
    lock_manager = get_lock_manager(redis_service)

    # Get circuit breaker
    from backend.services.circuit_breaker import CircuitBreakerConfig

    circuit_breaker = await get_circuit_breaker(
        "batch_sync",
        config=CircuitBreakerConfig(
            failure_threshold=5,
            success_threshold=3,
            timeout_seconds=30,
            half_open_max_calls=2,
        ),
    )

    # Initialize Sync Service
    sync_service = SyncConflictsService(db) if db else None

    # Check circuit breaker
    if not await circuit_breaker.acquire():
        raise HTTPException(
            status_code=503,
            detail="Sync service temporarily unavailable. Please try again later.",
        )

    ok_records = []
    conflicts = []
    errors = []

    try:
        # Validate all records first
        for record in request.records:
            # Check idempotency first using client_record_id as operation_id
            existing_op = await db.idempotency_operations.find_one(
                {"operation_id": record.client_record_id}
            )
            if existing_op:
                ok_records.append(record.client_record_id)
                continue

            conflict = await validate_record(record, db, lock_manager, sync_service, user_id)
            if conflict:
                conflicts.append(conflict)
            else:
                # Sync valid record
                success, error_msg = await sync_single_record(
                    record,
                    db,
                    current_user,
                    request_id=str(request_id).strip() if request_id else None,
                )

                if success:
                    # Record idempotency
                    await db.idempotency_operations.insert_one(
                        {
                            "operation_id": record.client_record_id,
                            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        }
                    )
                    ok_records.append(record.client_record_id)
                else:
                    errors.append(
                        SyncError(
                            client_record_id=record.client_record_id,
                            error_type="sync_error",
                            message=error_msg or "Unknown error",
                        )
                    )

        # Record success in circuit breaker
        await circuit_breaker.record_success()

    except Exception as e:
        # Record failure in circuit breaker
        await circuit_breaker.record_failure()
        logger.error(f"Batch sync failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Batch sync failed: {str(e)}")

    processing_time = (time.time() - start_time) * 1000

    logger.info(
        f"Batch sync completed: {len(ok_records)} ok, "
        f"{len(conflicts)} conflicts, {len(errors)} errors "
        f"({processing_time:.2f}ms)"
    )

    # Build per-record results for legacy clients that expect flat success flags
    results = [SyncResult(id=record_id, success=True, message=None) for record_id in ok_records]

    results.extend(
        SyncResult(id=conflict.client_record_id, success=False, message=conflict.message)
        for conflict in conflicts
    )

    results.extend(
        SyncResult(id=error.client_record_id, success=False, message=error.message)
        for error in errors
    )

    return BatchSyncResponse(
        ok=ok_records,
        conflicts=conflicts,
        errors=errors,
        batch_id=request.batch_id,
        processing_time_ms=processing_time,
        total_records=len(request.records),
        results=results,
        processed_count=len(request.records),
        success_count=len(ok_records),
        failed_count=len(request.records) - len(ok_records),
    )


@router.post("/heartbeat")
async def session_heartbeat(
    session_id: str,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: Any = Depends(get_db),
    redis_service=Depends(get_redis),
    rack_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Session heartbeat - maintain rack lock and user presence

    Should be called every 20-30 seconds by active clients
    """
    lock_manager = get_lock_manager(redis_service)
    user_id = current_user["username"]

    session = await find_session(db, session_id)
    if session:
        request_id = (
            request.headers.get("x-request-id")
            or request.headers.get("x-correlation-id")
            or getattr(request.state, "request_id", None)
        )
        await _enforce_sync_session_logic(
            db=db,
            session=session,
            current_user=current_user,
            operation_name="sync_session_heartbeat",
            request_id=str(request_id).strip() if request_id else None,
        )

    # Update user heartbeat
    await lock_manager.update_user_heartbeat(user_id, ttl=90)

    # Renew rack lock if provided
    rack_renewed = False
    if rack_id:
        rack_renewed = await lock_manager.renew_rack_lock(rack_id, session_id, ttl=60)

    return {
        "success": True,
        "session_id": session_id,
        "user_id": user_id,
        "rack_renewed": rack_renewed,
        "timestamp": time.time(),
    }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_operation_name(session_data: dict[str, Any]) -> Optional[str]:
    operation_raw = session_data.get("operation")
    return operation_raw.strip().lower() if isinstance(operation_raw, str) else None


def _resolve_session_id(value: Any, id_mapping: dict[str, str]) -> Optional[str]:
    if value is None:
        return None
    key = str(value)
    return id_mapping.get(key, key)


def _is_privileged_session_user(current_user: dict[str, Any]) -> bool:
    return current_user.get("role") in {"supervisor", "admin"}


def _session_status_update(operation: str, now: datetime) -> dict[str, Any]:
    if operation in {"bulk_close", "close"}:
        return {"$set": {"status": "CLOSED", "closed_at": now, "ended_at": now}}
    return {"$set": {"status": "RECONCILE", "reconciled_at": now}}


def _extract_bulk_session_ids(session_data: dict[str, Any]) -> list[Any]:
    raw_ids = (
        session_data.get("sessionIds")
        or session_data.get("session_ids")
        or session_data.get("session_ids".upper())  # defensive
    )
    if not isinstance(raw_ids, list) or not raw_ids:
        raise ValueError("Missing sessionIds for bulk session operation")
    return raw_ids


def _resolve_bulk_session_ids(raw_ids: list[Any], id_mapping: dict[str, str]) -> list[str]:
    return [
        resolved
        for value in raw_ids
        for resolved in [_resolve_session_id(value, id_mapping)]
        if resolved
    ]


async def _apply_bulk_session_operation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    operation: str,
    now: datetime,
    request_id: Optional[str] = None,
) -> str:
    if not _is_privileged_session_user(current_user):
        raise ValueError("Insufficient permissions for bulk session operation")

    resolved_ids = _resolve_bulk_session_ids(_extract_bulk_session_ids(session_data), id_mapping)
    update_doc = _session_status_update(operation, now)
    updated = 0
    for session_id in resolved_ids:
        session = await db.sessions.find_one({"id": session_id})
        if not session:
            continue
        await _enforce_sync_session_logic(
            db=db,
            session=session,
            current_user=current_user,
            operation_name=f"legacy_session_{operation}",
            request_id=request_id,
        )
        result = await db.sessions.update_one({"id": session_id}, update_doc)
        if getattr(result, "modified_count", 0) > 0:
            updated += 1
    return f"Bulk session operation '{operation}' applied (updated={updated})"


def _extract_single_session_operation_id(
    session_data: dict[str, Any], id_mapping: dict[str, str]
) -> str:
    raw_session_id = (
        session_data.get("sessionId") or session_data.get("session_id") or session_data.get("id")
    )
    resolved_session_id = _resolve_session_id(raw_session_id, id_mapping)
    if not resolved_session_id:
        raise ValueError("Missing sessionId for session operation")
    return resolved_session_id


def _assert_single_session_permission(
    session: dict[str, Any], current_user: dict[str, Any]
) -> None:
    if _is_privileged_session_user(current_user):
        return
    if session.get("staff_user") != current_user.get("username"):
        raise ValueError("Not authorized to modify this session")


async def _apply_single_session_operation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    operation: str,
    now: datetime,
    request_id: Optional[str] = None,
) -> str:
    resolved_session_id = _extract_single_session_operation_id(session_data, id_mapping)
    session = await db.sessions.find_one({"id": resolved_session_id})
    if not session:
        raise ValueError("Session not found")

    _assert_single_session_permission(session, current_user)
    await _enforce_sync_session_logic(
        db=db,
        session=session,
        current_user=current_user,
        operation_name=f"legacy_session_{operation}",
        request_id=request_id,
    )
    await db.sessions.update_one(
        {"id": resolved_session_id}, _session_status_update(operation, now)
    )
    return f"Session operation '{operation}' applied"


async def _process_session_mutation_operation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    request_id: Optional[str] = None,
) -> Optional[str]:
    operation = _normalize_operation_name(session_data)
    if not operation:
        return None

    now = _utc_now()
    if operation in {"bulk_close", "bulk_reconcile"}:
        return await _apply_bulk_session_operation(
            session_data, current_user, id_mapping, db, operation, now, request_id
        )
    if operation in {"close", "reconcile"}:
        return await _apply_single_session_operation(
            session_data, current_user, id_mapping, db, operation, now, request_id
        )
    return None


def _extract_warehouse(session_data: dict[str, Any]) -> str:
    warehouse = (session_data.get("warehouse") or "").strip()
    if not warehouse:
        raise ValueError("Missing warehouse for session operation")
    return warehouse


def _normalize_session_type(value: Any) -> str:
    normalized_type = value.strip().upper() if isinstance(value, str) else "STANDARD"
    if normalized_type not in {"STANDARD", "BLIND", "STRICT"}:
        return "STANDARD"
    return normalized_type


async def _find_session_by_offline_id(
    db: Any, offline_id: Optional[Any]
) -> Optional[dict[str, Any]]:
    if not offline_id:
        return None
    return await db.sessions.find_one({"offline_id": str(offline_id)})


async def _find_existing_open_session(
    db: Any, staff_user: str, warehouse: str
) -> Optional[dict[str, Any]]:
    return await db.sessions.find_one(
        {
            "staff_user": staff_user,
            "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]},
            "warehouse": {"$regex": f"^{re.escape(warehouse)}$", "$options": "i"},
        }
    )


def _link_offline_id_to_session(
    id_mapping: dict[str, str], offline_id: Optional[Any], session_id: Optional[str]
) -> None:
    if offline_id and session_id:
        id_mapping[str(offline_id)] = session_id


async def _process_session_creation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    request_id: Optional[str] = None,
) -> str:
    warehouse = _extract_warehouse(session_data)
    staff_user = current_user.get("username", "unknown_user")
    staff_name = current_user.get("full_name") or staff_user
    offline_id = session_data.get("session_id") or session_data.get("id")

    existing_by_offline = await _find_session_by_offline_id(db, offline_id)
    if existing_by_offline:
        session_id = existing_by_offline.get("id") or str(existing_by_offline.get("_id"))
        _link_offline_id_to_session(id_mapping, offline_id, session_id)
        return "Session already synced"

    existing_session = await _find_existing_open_session(db, staff_user, warehouse)
    if existing_session:
        session_id = existing_session.get("id") or str(existing_session.get("_id"))
        _link_offline_id_to_session(id_mapping, offline_id, session_id)
        await _enforce_sync_session_logic(
            db=db,
            session=existing_session,
            current_user=current_user,
            operation_name="legacy_session_create_existing",
            request_id=request_id,
        )
        if offline_id:
            await db.sessions.update_one(
                {"id": session_id},
                {"$set": {"offline_id": str(offline_id), "created_offline": True}},
            )
        return "Session already exists"

    session = Session(
        warehouse=warehouse,
        staff_user=staff_user,
        staff_name=staff_name,
        status=session_data.get("status", "OPEN"),
        type=_normalize_session_type(session_data.get("type")),
    )
    guard_context = await enforce_session_logic(
        db=db,
        session=None,
        request_context=_build_sync_request_context(
            current_user=current_user,
            operation_name="legacy_session_create",
            warehouse=warehouse,
            request_id=request_id,
        ),
        is_mutation=True,
    )
    apply_pin_to_new_session(session, guard_context)

    session_doc = session.model_dump()
    if offline_id:
        session_doc["offline_id"] = offline_id
        id_mapping[str(offline_id)] = session.id

    session_doc.update({"created_offline": True, "synced_at": _utc_now()})
    await db.sessions.insert_one(session_doc)
    return "Session synced"


async def _process_session_op(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    request_id: Optional[str] = None,
) -> str:
    """Process a session sync operation."""
    operation_result = await _process_session_mutation_operation(
        session_data, current_user, id_mapping, db, request_id
    )
    if operation_result:
        return operation_result
    return await _process_session_creation(session_data, current_user, id_mapping, db, request_id)


def _remap_line_session_id(line_data: dict[str, Any], id_mapping: dict[str, str]) -> None:
    temp_session_id = line_data.get("session_id")
    if temp_session_id is None:
        return
    lookup_key = str(temp_session_id)
    if lookup_key in id_mapping:
        line_data["session_id"] = id_mapping[lookup_key]


def _require_count_line_session_id(line_data: dict[str, Any]) -> str:
    session_id = str(line_data.get("session_id") or "")
    if not session_id:
        raise ValueError("Missing session_id for count line operation")
    return session_id


async def _assert_session_accepts_offline_count(db: Any, session_id: str) -> None:
    session = await find_session(db, session_id)
    if not session:
        raise ValueError("Session not found for count line operation")
    if session.get("finalized_at") or str(session.get("status", "")).upper() in {
        "COMPLETED",
        "CLOSED",
    }:
        raise ValueError("Session is finalized and cannot accept offline counts")
    if str(session.get("status", "")).upper() in {"OPEN", "ACTIVE"}:
        return
    if not session.get("reconciled_at"):
        raise ValueError("Session is not active")


def _set_count_line_defaults(line_data: dict[str, Any], current_user: dict[str, Any]) -> None:
    line_data.setdefault("counted_by", current_user.get("username"))
    line_data.setdefault("counted_at", _utc_now())
    line_data.setdefault("synced_at", _utc_now())
    line_data.setdefault("created_by", line_data.get("counted_by"))
    line_data.setdefault("verified", False)
    audit_metadata = line_data.get("audit")
    audit_idempotency_key = (
        audit_metadata.get("idempotency_key") if isinstance(audit_metadata, dict) else None
    )
    line_data.setdefault(
        "idempotency_key",
        audit_idempotency_key
        or line_data.get("idempotency_key")
        or line_data.get("_id")
        or line_data.get("id"),
    )
    # L1 fix: Overwrite None/falsy id values instead of using setdefault
    # (setdefault won't overwrite explicit None)
    if not line_data.get("id"):
        line_data["id"] = line_data.get("_id") or str(uuid.uuid4())


async def _count_line_is_idempotent(db: Any, session_id: str, line_data: dict[str, Any]) -> bool:
    idempotency_key = line_data.get("idempotency_key")
    if not idempotency_key:
        return False
    existing_idempotent = await db.count_lines.find_one(
        {"session_id": session_id, "idempotency_key": idempotency_key}
    )
    return bool(existing_idempotent)


async def _find_erp_item_for_line(db: Any, line_data: dict[str, Any]) -> Optional[dict[str, Any]]:
    barcode = line_data.get("barcode")
    item_code = line_data.get("item_code")
    if barcode:
        item = await db.erp_items.find_one({"barcode": barcode})
        if item:
            return item
    if item_code:
        return await db.erp_items.find_one({"item_code": item_code})
    return None


def _compute_variance_percent(erp_qty: float, counted_qty: float, variance: float) -> float:
    if erp_qty > 0:
        return abs(variance) / erp_qty * 100
    return 0 if counted_qty == 0 else 100


def _collect_risk_flags(
    line_data: dict[str, Any],
    *,
    variance: float,
    variance_percent: float,
    erp_mrp: float,
    counted_mrp: float,
) -> list[str]:
    risk_flags: list[str] = []
    mrp_change_percent = ((counted_mrp - erp_mrp) / erp_mrp * 100) if erp_mrp > 0 else 0
    if abs(variance) > 100 or variance_percent > 50:
        risk_flags.append("LARGE_VARIANCE")
    if mrp_change_percent < -20:
        risk_flags.append("MRP_REDUCED_SIGNIFICANTLY")
    if erp_mrp > 10000 and variance_percent > 5:
        risk_flags.append("HIGH_VALUE_VARIANCE")

    has_serials = bool(line_data.get("serial_numbers")) or bool(line_data.get("serial_entries"))
    if erp_mrp > 5000 and not has_serials:
        risk_flags.append("SERIAL_MISSING_HIGH_VALUE")

    has_reason = bool(line_data.get("correction_reason")) or bool(line_data.get("variance_reason"))
    if abs(variance) > 0 and not has_reason:
        risk_flags.append("MISSING_CORRECTION_REASON")
    if abs(mrp_change_percent) > 5 and not has_reason:
        risk_flags.append("MRP_CHANGE_WITHOUT_REASON")

    photo_required = (
        abs(variance) > 100
        or variance_percent > 50
        or abs(mrp_change_percent) > 20
        or erp_mrp > 10000
    )
    has_photo = bool(line_data.get("photo_base64")) or bool(line_data.get("photo_proofs"))
    if photo_required and not has_photo:
        risk_flags.append("PHOTO_PROOF_REQUIRED")
    return risk_flags


def _mark_misplacement_if_needed(
    line_data: dict[str, Any], erp_item: Optional[dict[str, Any]], risk_flags: list[str]
) -> bool:
    if not erp_item:
        return False

    found_floor = (line_data.get("floor_no") or "").strip().upper()
    found_rack = (line_data.get("rack_no") or "").strip().upper()
    expected_floor = (erp_item.get("floor") or "").strip().upper()
    expected_rack = (erp_item.get("rack") or "").strip().upper()
    if not (expected_floor or expected_rack):
        return False

    floor_mismatch = found_floor and expected_floor and found_floor != expected_floor
    rack_mismatch = found_rack and expected_rack and found_rack != expected_rack
    if not (floor_mismatch or rack_mismatch):
        return False

    risk_flags.append("MISPLACED_ITEM")
    line_data["expected_location"] = f"{expected_floor}/{expected_rack}"
    line_data["found_location"] = f"{found_floor}/{found_rack}"
    line_data["relocation_status"] = "PENDING"
    return True


def _merge_risk_flags(line_data: dict[str, Any], risk_flags: list[str]) -> None:
    existing_flags = set(line_data.get("risk_flags", []))
    existing_flags.update(risk_flags)
    line_data["risk_flags"] = list(existing_flags)


def _set_approval_status(line_data: dict[str, Any]) -> None:
    if line_data.get("risk_flags") and line_data.get("approval_status") not in [
        "APPROVED",
        "REJECTED",
    ]:
        line_data["approval_status"] = "NEEDS_REVIEW"
        return
    if not line_data.get("approval_status"):
        line_data["approval_status"] = "PENDING"


async def _populate_offline_count_line_stats(
    db: Any,
    line_data: dict[str, Any],
    *,
    current_user: dict[str, Any],
    session: dict[str, Any],
) -> None:
    # Fill baseline and item metadata. Variance governance is applied by CountLineWriteService.
    try:
        write_service = CountLineWriteService(db)
        await write_service.assert_session_integrity(session=session)
        erp_item = await _find_erp_item_for_line(db, line_data)
        baseline_hash = str(line_data.get("baseline_hash") or "").strip()
        erp_qty = float(line_data.get("erp_qty") or 0.0)
        if not baseline_hash:
            erp_qty, baseline_hash = await write_service.resolve_baseline(
                session_id=str(line_data.get("session_id") or ""),
                item_code=str(line_data.get("item_code") or ""),
                username=str(current_user.get("username") or "unknown_user"),
                erp_item=erp_item,
            )
        line_data["erp_qty"] = erp_qty
        line_data["baseline_hash"] = baseline_hash
        if erp_item:
            line_data.setdefault("barcode", erp_item.get("barcode"))
            line_data.setdefault("item_name", erp_item.get("item_name"))
            line_data.setdefault("mrp_erp", erp_item.get("mrp", 0.0))
        if "mrp_counted" not in line_data or line_data.get("mrp_counted") in (None, ""):
            line_data["mrp_counted"] = (
                line_data.get("counted_mrp")
                or line_data.get("mrp")
                or line_data.get("mrp_erp")
                or 0.0
            )
    except Exception as e:
        logger.error(f"Failed to calculate missing stats for offline count: {e}")


def _apply_recount_reset_fields(
    line_data: dict[str, Any], existing_duplicate: dict[str, Any]
) -> None:
    line_data["id"] = extract_document_id(existing_duplicate) or line_data["id"]
    line_data["verified"] = False
    line_data["verified_by"] = None
    line_data["verified_at"] = None
    line_data["approved_by"] = line_data.get("approved_by")
    line_data["approved_at"] = line_data.get("approved_at")
    line_data["rejected_by"] = None
    line_data["rejected_at"] = None
    line_data["assigned_to"] = None
    line_data["recount_requested_at"] = None
    line_data["recount_requested_by"] = None
    line_data["recount_iteration"] = int(existing_duplicate.get("recount_iteration", 0) or 0) + 1


async def _handle_duplicate_count_line(
    db: Any,
    session_id: str,
    line_data: dict[str, Any],
    existing_duplicate: dict[str, Any],
) -> str:
    if not can_reuse_rejected_count_line(existing_duplicate, line_data):
        raise ValueError(
            "Duplicate Scan: This item has already been counted in this specific location (Floor/Rack)."
        )

    _apply_recount_reset_fields(line_data, existing_duplicate)
    update_payload = dict(line_data)
    update_payload.pop("_id", None)
    await CountLineWriteService(db).process_write(
        {
            "operation": "update_one",
            "filter": {"_id": existing_duplicate["_id"]},
            "update": {"$set": update_payload},
        },
        context={
            "session_id": session_id,
            "username": str(line_data.get("updated_by") or line_data.get("counted_by") or ""),
            "location": line_data.get("floor_no"),
        },
    )
    await recompute_session_totals(db, session_id)
    return "Rejected count line updated through explicit recount sync"


async def _process_count_line_op(
    line_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    request_id: Optional[str] = None,
) -> str:
    """Process a count_line sync operation."""
    _remap_line_session_id(line_data, id_mapping)
    session_id = _require_count_line_session_id(line_data)
    await _assert_session_accepts_offline_count(db, session_id)
    session = await find_session(db, session_id)
    if not session:
        raise ValueError("Session not found for count line operation")
    await _enforce_sync_session_logic(
        db=db,
        session=session,
        current_user=current_user,
        operation_name="legacy_count_line_sync",
        request_id=request_id,
    )
    _set_count_line_defaults(line_data, current_user)
    if await _count_line_is_idempotent(db, session_id, line_data):
        return "Count line already synced"
    await _populate_offline_count_line_stats(
        db,
        line_data,
        current_user=current_user,
        session=session,
    )
    existing_duplicate = await find_duplicate_count_line(db, line_data)
    if existing_duplicate:
        return await _handle_duplicate_count_line(
            db=db,
            session_id=session_id,
            line_data=line_data,
            existing_duplicate=existing_duplicate,
        )
    await CountLineWriteService(db).process_write(
        {"operation": "insert_one", "document": line_data},
        context={
            "session": session,
            "username": current_user.get("username"),
            "location": line_data.get("floor_no"),
        },
    )
    await recompute_session_totals(db, session_id)
    return "Count line synced with canonical duplicate validation"


async def _process_unknown_item_op(
    item_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
    request_id: Optional[str] = None,
) -> str:
    """Process an unknown_item sync operation."""
    temp_session_id = item_data.get("session_id")
    if temp_session_id is not None:
        lookup_key = str(temp_session_id)
        if lookup_key in id_mapping:
            item_data["session_id"] = id_mapping[lookup_key]

    item_data.setdefault("reported_by", current_user.get("username"))
    item_data.setdefault("reported_at", datetime.now(timezone.utc).replace(tzinfo=None))
    item_data.setdefault("synced_at", datetime.now(timezone.utc).replace(tzinfo=None))
    await db.unknown_items.insert_one(item_data)
    return "Unknown item synced"


# Operation type → handler mapping
_LEGACY_OP_HANDLERS: dict[str, Any] = {
    "session": _process_session_op,
    "count_line": _process_count_line_op,
    "unknown_item": _process_unknown_item_op,
}


async def _process_legacy_operations(
    operations: list[LegacySyncOperation],
    batch_id: Optional[str],
    current_user: dict[str, Any],
    start_time: float,
    request_id: Optional[str],
) -> BatchSyncResponse:
    """Handle legacy offline queue operations payloads."""
    db = get_db()

    id_mapping: dict[str, str] = {}
    results: list[SyncResult] = []
    ok_ids: list[str] = []
    error_entries: list[SyncError] = []

    ordered_ops = sorted(operations, key=lambda op: op.timestamp or "")

    for op in ordered_ops:
        success = False
        message: Optional[str] = None

        try:
            # Check idempotency
            existing_op = await db.idempotency_operations.find_one({"operation_id": op.id})
            if existing_op:
                success = True
                message = "Already processed (idempotency)"
            else:
                handler = _LEGACY_OP_HANDLERS.get(op.type)
                if handler:
                    data = deepcopy(op.data)
                    message = await handler(data, current_user, id_mapping, db, request_id)
                    success = True
                    # Record idempotency
                    await db.idempotency_operations.insert_one(
                        {
                            "operation_id": op.id,
                            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        }
                    )
                else:
                    message = f"Unknown operation type: {op.type}"
        except Exception as exc:
            logger.error(f"Legacy sync operation failed ({op.id}): {exc}")
            message = str(exc)

        results.append(SyncResult(id=op.id, success=success, message=message))
        if success:
            ok_ids.append(op.id)
        else:
            error_entries.append(
                SyncError(
                    client_record_id=op.id,
                    error_type="legacy_sync_error",
                    message=message or "Unknown legacy sync error",
                )
            )

    processing_time = (time.time() - start_time) * 1000

    return BatchSyncResponse(
        ok=ok_ids,
        conflicts=[],
        errors=error_entries,
        batch_id=batch_id,
        processing_time_ms=processing_time,
        total_records=len(operations),
        results=results,
        processed_count=len(operations),
        success_count=len(ok_ids),
        failed_count=len(operations) - len(ok_ids),
    )
