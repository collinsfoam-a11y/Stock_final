"""
Batch Sync API - High-performance batch synchronization
Handles offline queue sync with conflict detection and retry logic
and enforces the records-only offline sync contract.
"""

import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from pymongo.errors import DuplicateKeyError, PyMongoError

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.contracts.states import (
    COUNT_LINE_STATES,
    normalize_count_line_state,
)
from backend.middleware.security import batch_rate_limiter
from backend.services.canonical_inventory import (
    can_reuse_rejected_count_line,
    extract_document_id,
    find_duplicate_count_line,
)
from backend.services.circuit_breaker import get_circuit_breaker
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation, raise_forbidden_direct_write
from backend.services.lock_manager import LockManager, get_lock_manager
from backend.services.metrics import (
    record_retry_count,
    record_sync_failures,
    record_sync_queue_size,
)
from backend.services.redis_service import get_redis
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.sync_batch_service import SyncBatchService, get_sync_batch_service
from backend.services.sync_conflicts_service import SyncConflictsService
from backend.services.transaction_manager import mongo_transaction
from backend.utils.api_utils import sanitize_for_logging
from backend.utils.request_context import get_request_id

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/sync", tags=["Sync"])


# Request/Response Models


class SyncRecord(BaseModel):
    """Single record to sync"""

    record_id: str = Field(..., description="Stable client-side idempotency record ID")
    client_record_id: str = Field(..., description="Unique client-side record ID")
    session_id: str = Field(..., description="Session ID")
    location_id: str = Field(..., description="Location ID")
    floor_id: str = Field(..., description="Floor ID")
    rack_id: str = Field(..., description="Rack ID")
    floor: Optional[str] = Field(None, description="Floor")
    item_code: str = Field(..., description="Item code")
    item_id: Optional[str] = Field(None, description="Canonical item identifier")
    barcode: Optional[str] = Field(None, description="Item barcode")
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
    event_id: Optional[str] = Field(
        None, description="Stable offline event identifier (falls back to record_id)"
    )
    status: str = Field("SUBMITTED", description="Canonical count-line lifecycle state")
    schema_version: str = Field("v1", description="Payload schema version")
    created_at: str = Field(..., description="Client creation timestamp")
    updated_at: str = Field(..., description="Client update timestamp")
    retry_count: int = Field(0, ge=0, description="Client-side retry count")


class BatchSyncRequest(BaseModel):
    """Records-only batch sync request."""

    records: list[SyncRecord] = Field(
        default_factory=list, description="Structured records to sync"
    )
    operations: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Rejected operations array from earlier clients",
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
        None, description="Compatibility summary: total operations processed"
    )
    success_count: Optional[int] = Field(
        None, description="Compatibility summary: successful operations"
    )
    failed_count: Optional[int] = Field(
        None, description="Compatibility summary: failed operations"
    )


class BatchSyncAtomicError(RuntimeError):
    """Raised when an atomic batch record write fails."""

    def __init__(self, record: SyncRecord, message: str) -> None:
        super().__init__(message)
        self.record = record
        self.message = message


# Sync Logic


def _as_sync_batch_service(value: Any) -> SyncBatchService:
    if isinstance(value, SyncBatchService):
        return value
    return SyncBatchService(value)


async def _record_item_code_is_known(
    sync_batch_service: SyncBatchService, record: SyncRecord
) -> bool:
    """Validate item_code against the session snapshot or ERP item cache."""

    item_code = str(record.item_code or "").strip()
    if not item_code:
        return False

    return await sync_batch_service.item_code_is_known(
        session_id=record.session_id,
        item_code=item_code,
    )


def _idempotency_replay_conflict(
    record: SyncRecord, existing_op: dict[str, Any]
) -> Optional[SyncConflict]:
    existing_client_record_id = str(existing_op.get("client_record_id") or "").strip()
    existing_session_id = str(existing_op.get("session_id") or "").strip()

    if existing_client_record_id and existing_client_record_id != record.client_record_id:
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="DUPLICATE_RECORD_ID",
            message="record_id has already been processed for a different client_record_id",
            details={
                "record_id": record.record_id,
                "existing_client_record_id": existing_client_record_id,
            },
        )

    if existing_session_id and existing_session_id != record.session_id:
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="DUPLICATE_RECORD_ID",
            message="record_id has already been processed for a different session_id",
            details={
                "record_id": record.record_id,
                "existing_session_id": existing_session_id,
            },
        )

    return None


def _record_payload_for_logging(record: SyncRecord) -> dict[str, Any]:
    payload = record.model_dump()
    # keep logs bounded and scrub long evidence payloads
    payload["evidence_photos"] = [str(value)[:128] for value in payload.get("evidence_photos", [])]
    payload["serial_numbers"] = [str(value)[:128] for value in payload.get("serial_numbers", [])]
    return payload


def _log_sync_failure(
    *,
    request_id: str,
    user_id: str,
    record: SyncRecord,
    status_code: int,
    error: str,
    session_state: Optional[str] = None,
) -> None:
    logger.warning(
        "sync_record_failed",
        extra={
            "request_id": request_id,
            "user": sanitize_for_logging(str(user_id)),
            "endpoint": "/api/sync/batch",
            "status": "failed",
            "status_code": status_code,
            "error": sanitize_for_logging(str(error)),
            "payload": _record_payload_for_logging(record),
            "idempotency_key": record.record_id,
            "event_id": str(record.event_id or record.record_id),
            "session_state": session_state or "UNKNOWN",
            "retry_count": max(int(record.retry_count or 0), 0),
        },
    )


def _emit_sync_failure_alert(
    *,
    failed_count: int,
    total_count: int,
    request_id: str,
    user_id: str,
    reason: str,
) -> None:
    if total_count <= 0:
        return
    failure_rate = float(failed_count) / float(total_count)
    if failure_rate <= 0.02:
        return
    logger.error(
        "sync_failure_rate_threshold_exceeded",
        extra={
            "request_id": request_id,
            "user": sanitize_for_logging(str(user_id)),
            "endpoint": "/api/sync/batch",
            "sync_failure_rate": round(failure_rate, 4),
            "failed_count": failed_count,
            "total_count": total_count,
            "threshold": 0.02,
            "reason": reason,
        },
    )


@asynccontextmanager
async def _reuse_or_open_transaction(database: Any, db_session: Optional[Any]):
    if db_session is not None:
        yield db_session
        return
    async with mongo_transaction(database.client) as tx:
        yield tx


async def validate_record(
    record: SyncRecord,
    sync_batch_service: SyncBatchService,
    lock_manager: LockManager,
    sync_service: Optional[SyncConflictsService] = None,
    user_id: Optional[str] = None,
) -> Optional[SyncConflict]:
    """
    Validate a single record before syncing

    Returns:
        SyncConflict if validation fails, None if valid
    """
    if not all(
        [
            str(record.location_id or "").strip(),
            str(record.floor_id or "").strip(),
            str(record.rack_id or "").strip(),
        ]
    ):
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="INVALID_LOCATION",
            message="Missing required location hierarchy",
            details={"required_fields": ["location_id", "floor_id", "rack_id"]},
        )

    if not str(record.item_code or "").strip():
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="UNKNOWN_ITEM_CODE",
            message="Missing item_code",
        )

    if not await _record_item_code_is_known(sync_batch_service, record):
        return SyncConflict(
            client_record_id=record.client_record_id,
            conflict_type="UNKNOWN_ITEM_CODE",
            message=f"Unknown item_code '{record.item_code}'",
            details={"item_code": record.item_code},
        )

    # Check for duplicate serial numbers
    if record.serial_numbers:
        for serial in record.serial_numbers:
            existing = await sync_batch_service.find_item_serial(serial)
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
    sync_batch_service: SyncBatchService,
    user_id: str,
    *,
    user_role: Optional[str] = None,
    write_service: Optional[CountLineWriteService] = None,
    lifecycle_service: Optional[SessionLifecycleService] = None,
    db_session: Optional[Any] = None,
    session_cache: Optional[dict[str, dict[str, Any]]] = None,
) -> tuple[bool, Optional[str]]:
    """
    Sync a single record to database

    Returns:
        (success: bool, error_message: Optional[str])
    """
    sync_batch_service = _as_sync_batch_service(sync_batch_service)
    try:
        database = sync_batch_service.database
        lifecycle_service = lifecycle_service or SessionLifecycleService(database)

        floor_id = (record.floor_id or record.floor or "").strip()
        rack_id = (record.rack_id or "").strip()
        location_id = (record.location_id or "").strip()
        if not location_id or not floor_id or not rack_id:
            return (
                False,
                "CRITICAL: location_id, floor_id, and rack_id are required for sync writes",
            )

        status_normalized = normalize_count_line_state(record.status)
        if status_normalized not in COUNT_LINE_STATES:
            return False, f"Unsupported count-line status: {record.status}"
        is_finalized = status_normalized in {"APPROVED", "LOCKED"}
        mapped_status = {
            "DRAFT": "draft",
            "SUBMITTED": "pending",
            "PENDING_APPROVAL": "pending",
            "APPROVED": "locked",
            "REJECTED": "rejected",
            "LOCKED": "locked",
        }[status_normalized]
        counted_at = datetime.fromisoformat(record.created_at.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        updated_at = datetime.fromisoformat(record.updated_at.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        event_id = str(record.event_id or record.record_id).strip()
        doc = {
            "id": str(uuid.uuid4()),
            "event_id": event_id,
            "schema_version": str(record.schema_version or "v1"),
            "record_id": record.record_id,
            "client_record_id": record.client_record_id,
            "idempotency_key": record.record_id,
            "session_id": record.session_id,
            "location_id": location_id,
            "floor_id": floor_id,
            "rack_id": rack_id,
            "floor_no": floor_id,
            "rack_no": rack_id,
            "item_code": record.item_code,
            "item_id": str(record.item_id or record.item_code),
            "barcode": record.barcode,
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
            "status": mapped_status,
            "approval_status": "APPROVED" if is_finalized else "PENDING",
            "verified": is_finalized,
            "verified_by": user_id if is_finalized else None,
            "verified_at": updated_at if is_finalized else None,
            "finalized_by": user_id if is_finalized else None,
            "finalized_at": updated_at if is_finalized else None,
            "counted_at": counted_at,
            "updated_at": updated_at,
            "sync_status": "synced",
            "synced_by": user_id,
            "synced_at": time.time(),
            "version": 1,
            "previous_version_id": None,
            "recount_of_id": None,
        }

        write_service = write_service or CountLineWriteService(database)
        cache = session_cache if isinstance(session_cache, dict) else {}

        async with _reuse_or_open_transaction(database, db_session) as tx:
            session = cache.get(record.session_id)
            if session is None:
                session = await lifecycle_service.ensure_session_accepts_count_writes(
                    record.session_id,
                    actor=user_id,
                    db_session=tx,
                )
                cache[record.session_id] = session

            if str(user_role or "").strip().lower() not in {"supervisor", "admin"}:
                owner = str(session.get("staff_user") or "").strip()
                if owner and owner != user_id:
                    return False, "Not authorized to sync records for this session"

            existing_duplicate = await find_duplicate_count_line(database, doc)
            write_context = {"session": session, "username": user_id, "db_session": tx}
            try:
                if existing_duplicate:
                    await _handle_duplicate_count_line(
                        sync_batch_service=sync_batch_service,
                        session_id=record.session_id,
                        line_data=doc,
                        existing_duplicate=existing_duplicate,
                        write_service=write_service,
                        session=session,
                        username=user_id,
                        db_session=tx,
                    )
                else:
                    await write_service.process_write(
                        {"operation": "insert_one", "document": doc},
                        context=write_context,
                    )
            except DuplicateKeyError:
                # Treat duplicate record_id/idempotency key writes as safe replay success.
                return True, None

            if record.serial_numbers:
                serial_docs = [
                    {
                        "serial_number": serial,
                        "item_code": record.item_code,
                        "session_id": record.session_id,
                        "rack_id": record.rack_id,
                        "client_record_id": record.client_record_id,
                        "event_id": event_id,
                        "created_at": time.time(),
                        "schema_version": str(record.schema_version or "v1"),
                    }
                    for serial in record.serial_numbers
                ]
                await sync_batch_service.insert_item_serials_ignore_duplicates_with_session(
                    serial_docs,
                    db_session=tx,
                )

            await sync_batch_service.record_idempotency_operation(
                operation_id=record.record_id,
                client_record_id=record.client_record_id,
                session_id=record.session_id,
                db_session=tx,
            )

        return True, None

    except GovernanceViolation as e:
        logger.error(
            "Governance violation syncing record %s: %s",
            record.client_record_id,
            sanitize_for_logging(str(e)),
        )
        return False, str(e)
    except (PyMongoError, RuntimeError, TypeError, ValueError) as e:
        logger.error(
            "Error syncing record %s: %s",
            record.client_record_id,
            sanitize_for_logging(str(e)),
        )
        return False, str(e)


@router.post("/batch", response_model=BatchSyncResponse)
async def sync_batch(
    request: BatchSyncRequest,
    http_request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
    sync_batch_service: SyncBatchService = Depends(get_sync_batch_service),
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

    # Rate limiting check
    user_id = (
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or str(current_user.get("_id", "unknown"))
    )
    request_id = get_request_id(http_request.headers)
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

    if request.operations:
        raise HTTPException(
            status_code=410,
            detail=(
                "CRITICAL: operations-based sync is disabled. "
                "Submit records-based payload only."
            ),
        )

    if not request.records:
        raise HTTPException(
            status_code=400,
            detail="No records provided for batch sync",
        )
    try:
        for record in request.records:
            await record_retry_count(record.retry_count)
        await record_sync_queue_size(len(request.records))
    except (RuntimeError, TypeError, ValueError):
        logger.debug("Failed to publish sync queue/retry metrics", exc_info=True)

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
    database = sync_batch_service.database
    sync_service = SyncConflictsService(database) if database is not None else None

    # Check circuit breaker
    if not await circuit_breaker.acquire():
        raise HTTPException(
            status_code=503,
            detail="Sync service temporarily unavailable. Please try again later.",
        )

    ok_records: list[str] = []
    conflicts: list[SyncConflict] = []
    records_to_sync: list[SyncRecord] = []

    try:
        write_service = CountLineWriteService(database)
        lifecycle_service = SessionLifecycleService(database)
        session_cache: dict[str, dict[str, Any]] = {}

        # Phase 1: validate entire batch before mutating to enforce full-success-or-retry.
        for record in request.records:
            existing_op = await sync_batch_service.get_idempotency_operation(record.record_id)
            if existing_op:
                replay_conflict = _idempotency_replay_conflict(record, existing_op)
                if replay_conflict:
                    conflicts.append(replay_conflict)
                    _log_sync_failure(
                        request_id=request_id,
                        user_id=str(user_id),
                        record=record,
                        status_code=409,
                        error=replay_conflict.message,
                    )
                    continue
                ok_records.append(record.client_record_id)
                continue

            conflict = await validate_record(
                record, sync_batch_service, lock_manager, sync_service, str(user_id)
            )
            if conflict:
                conflicts.append(conflict)
                _log_sync_failure(
                    request_id=request_id,
                    user_id=str(user_id),
                    record=record,
                    status_code=409,
                    error=conflict.message,
                )
                continue

            records_to_sync.append(record)

        if conflicts:
            await circuit_breaker.record_failure()
            try:
                await record_sync_failures(len(conflicts))
            except (RuntimeError, TypeError, ValueError):
                logger.debug("Failed to publish sync failure metric", exc_info=True)
            try:
                await record_sync_queue_size(0)
            except (RuntimeError, TypeError, ValueError):
                logger.debug("Failed to publish sync queue size metric", exc_info=True)
            _emit_sync_failure_alert(
                failed_count=len(conflicts),
                total_count=len(request.records),
                request_id=request_id,
                user_id=str(user_id),
                reason="validation_conflict",
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "SYNC_BATCH_VALIDATION_FAILED",
                    "message": "Batch validation failed; no records were committed.",
                    "conflicts": [conflict.model_dump() for conflict in conflicts],
                    "retry_after_seconds": 2,
                },
            )

        # Phase 2: apply count-line writes atomically in one transaction.
        if records_to_sync:
            async with mongo_transaction(database.client) as tx:
                for record in records_to_sync:
                    success, error_msg = await sync_single_record(
                        record,
                        sync_batch_service,
                        str(user_id),
                        user_role=str(current_user.get("role") or ""),
                        write_service=write_service,
                        lifecycle_service=lifecycle_service,
                        db_session=tx,
                        session_cache=session_cache,
                    )
                    if not success:
                        raise BatchSyncAtomicError(record, error_msg or "Unknown sync error")
                    ok_records.append(record.client_record_id)

        await circuit_breaker.record_success()

    except BatchSyncAtomicError as exc:
        await circuit_breaker.record_failure()
        cached_session = session_cache.get(exc.record.session_id) if "session_cache" in locals() else {}
        _log_sync_failure(
            request_id=request_id,
            user_id=str(user_id),
            record=exc.record,
            status_code=409,
            error=exc.message,
            session_state=str((cached_session or {}).get("status") or "UNKNOWN"),
        )
        try:
            await record_sync_failures(max(len(records_to_sync), 1))
        except (RuntimeError, TypeError, ValueError):
            logger.debug("Failed to publish sync failure metric", exc_info=True)
        try:
            await record_sync_queue_size(0)
        except (RuntimeError, TypeError, ValueError):
            logger.debug("Failed to publish sync queue size metric", exc_info=True)
        _emit_sync_failure_alert(
            failed_count=max(len(records_to_sync), 1),
            total_count=len(request.records),
            request_id=request_id,
            user_id=str(user_id),
            reason="atomic_batch_failure",
        )
        raise HTTPException(
            status_code=409,
            detail={
                "code": "SYNC_BATCH_RETRY_REQUIRED",
                "message": "Atomic batch sync failed; no records were committed.",
                "failed_record_id": exc.record.client_record_id,
                "error": exc.message,
                "retry_after_seconds": 2,
            },
        )
    except (GovernanceViolation, PyMongoError, RuntimeError, TypeError, ValueError) as e:
        await circuit_breaker.record_failure()
        logger.error(
            "sync_batch_failed",
            extra={
                "request_id": request_id,
                "user": sanitize_for_logging(str(user_id)),
                "endpoint": "/api/sync/batch",
                "status": "failed",
                "error": sanitize_for_logging(str(e)),
            },
        )
        try:
            await record_sync_failures(len(request.records))
        except (RuntimeError, TypeError, ValueError):
            logger.debug("Failed to publish sync failure metric", exc_info=True)
        try:
            await record_sync_queue_size(0)
        except (RuntimeError, TypeError, ValueError):
            logger.debug("Failed to publish sync queue size metric", exc_info=True)
        _emit_sync_failure_alert(
            failed_count=len(request.records),
            total_count=len(request.records),
            request_id=request_id,
            user_id=str(user_id),
            reason="internal_error",
        )
        raise HTTPException(
            status_code=500,
            detail={
                "code": "SYNC_BATCH_INTERNAL_ERROR",
                "message": "Batch sync failed unexpectedly.",
            },
        )

    try:
        await record_sync_queue_size(0)
    except (RuntimeError, TypeError, ValueError):
        logger.debug("Failed to publish sync queue size metric", exc_info=True)

    processing_time = (time.time() - start_time) * 1000
    logger.info(
        "sync_batch_completed",
        extra={
            "request_id": request_id,
            "user": sanitize_for_logging(str(user_id)),
            "endpoint": "/api/sync/batch",
            "status": "completed",
            "ok_count": len(ok_records),
            "conflict_count": 0,
            "error_count": 0,
            "processing_time_ms": round(processing_time, 2),
        },
    )

    results = [SyncResult(id=record_id, success=True, message=None) for record_id in ok_records]

    return BatchSyncResponse(
        ok=ok_records,
        conflicts=[],
        errors=[],
        batch_id=request.batch_id,
        processing_time_ms=processing_time,
        total_records=len(request.records),
        results=results,
        processed_count=len(request.records),
        success_count=len(ok_records),
        failed_count=0,
    )


@router.post("/heartbeat")
async def session_heartbeat(
    session_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
    rack_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Session heartbeat - maintain rack lock and user presence

    Should be called every 20-30 seconds by active clients
    """
    lock_manager = get_lock_manager(redis_service)
    user_id = current_user["username"]

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
    sync_batch_service: SyncBatchService,
    operation: str,
    now: datetime,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.bulk_session_operation")


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
    sync_batch_service: SyncBatchService,
    operation: str,
    now: datetime,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.single_session_operation")


async def _process_session_mutation_operation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    sync_batch_service: SyncBatchService,
) -> Optional[str]:
    operation = _normalize_operation_name(session_data)
    if not operation:
        return None

    now = _utc_now()
    if operation in {"bulk_close", "bulk_reconcile"}:
        return await _apply_bulk_session_operation(
            session_data, current_user, id_mapping, sync_batch_service, operation, now
        )
    if operation in {"close", "reconcile"}:
        return await _apply_single_session_operation(
            session_data, current_user, id_mapping, sync_batch_service, operation, now
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
    sync_batch_service: SyncBatchService, offline_id: Optional[Any]
) -> Optional[dict[str, Any]]:
    return await sync_batch_service.find_session_by_offline_id(offline_id)


async def _find_existing_open_session(
    sync_batch_service: SyncBatchService, staff_user: str, warehouse: str
) -> Optional[dict[str, Any]]:
    return await sync_batch_service.find_existing_open_session(
        staff_user=staff_user,
        warehouse_query={"$regex": f"^{re.escape(warehouse)}$", "$options": "i"},
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
    sync_batch_service: SyncBatchService,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.session_creation_operation")


async def _process_session_op(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    sync_batch_service: SyncBatchService,
) -> str:
    """Process a session sync operation."""
    operation_result = await _process_session_mutation_operation(
        session_data, current_user, id_mapping, sync_batch_service
    )
    if operation_result:
        return operation_result
    return await _process_session_creation(
        session_data, current_user, id_mapping, sync_batch_service
    )


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


async def _assert_session_accepts_offline_count(
    sync_batch_service: SyncBatchService,
    session_id: str,
    *,
    actor: str = "system",
) -> dict[str, Any]:
    lifecycle_service = SessionLifecycleService(sync_batch_service.database)
    session = await lifecycle_service.ensure_session_accepts_count_writes(
        session_id,
        actor=actor,
    )
    return session


def _enforce_required_count_line_context(line_data: dict[str, Any]) -> None:
    location_id = str(line_data.get("location_id") or "").strip()
    floor_id = str(
        line_data.get("floor_id") or line_data.get("floor_no") or line_data.get("floor") or ""
    ).strip()
    rack_id = str(line_data.get("rack_id") or line_data.get("rack_no") or "").strip()
    if not location_id or not floor_id or not rack_id:
        raise ValueError(
            "CRITICAL: location_id, floor_id, rack_id are mandatory for count-line sync"
        )
    line_data["location_id"] = location_id
    line_data["floor_id"] = floor_id
    line_data["rack_id"] = rack_id
    line_data.setdefault("floor_no", floor_id)
    line_data.setdefault("rack_no", rack_id)


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
    line_data.setdefault("version", 1)
    line_data.setdefault("previous_version_id", None)
    line_data.setdefault("recount_of_id", None)


async def _count_line_is_idempotent(
    sync_batch_service: SyncBatchService, session_id: str, line_data: dict[str, Any]
) -> bool:
    idempotency_key = line_data.get("idempotency_key")
    return await sync_batch_service.count_line_is_idempotent(
        session_id=session_id,
        idempotency_key=idempotency_key,
    )


async def _find_erp_item_for_line(
    sync_batch_service: SyncBatchService, line_data: dict[str, Any]
) -> Optional[dict[str, Any]]:
    return await sync_batch_service.find_erp_item_for_line(line_data)


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
    sync_batch_service: SyncBatchService, line_data: dict[str, Any]
) -> None:
    # Precompute fields from immutable baseline; CountLineWriteService re-validates on write.
    erp_item = await _find_erp_item_for_line(sync_batch_service, line_data)
    current_sql_qty = float((erp_item or {}).get("stock_qty") or 0.0)
    erp_mrp = float((erp_item or {}).get("mrp") or 0.0)
    counted_qty = float(line_data.get("counted_qty", 0.0))
    mrp_c = line_data.get("mrp_counted") or line_data.get("counted_mrp") or erp_mrp
    counted_mrp = float(mrp_c)

    write_service = CountLineWriteService(sync_batch_service.database)
    baseline_qty, baseline_hash = await write_service.resolve_baseline(
        session_id=str(line_data.get("session_id") or ""),
        item_code=str(line_data.get("item_code") or ""),
        username=str(line_data.get("synced_by") or line_data.get("counted_by") or "sync"),
        erp_item=erp_item or {},
    )

    variance = counted_qty - baseline_qty
    variance_percent = _compute_variance_percent(baseline_qty, counted_qty, variance)
    financial_impact = (counted_mrp * counted_qty) - (erp_mrp * baseline_qty)
    risk_flags = _collect_risk_flags(
        line_data,
        variance=variance,
        variance_percent=variance_percent,
        erp_mrp=erp_mrp,
        counted_mrp=counted_mrp,
    )
    is_misplaced = _mark_misplacement_if_needed(line_data, erp_item, risk_flags)

    line_data["variance"] = variance
    line_data["erp_qty"] = baseline_qty
    line_data["baseline_hash"] = baseline_hash
    line_data["current_sql_qty"] = current_sql_qty
    line_data["erp_drift"] = current_sql_qty - baseline_qty
    line_data["final_gap"] = counted_qty - current_sql_qty
    line_data["mrp_erp"] = erp_mrp
    line_data["mrp_counted"] = counted_mrp
    line_data["financial_impact"] = financial_impact
    _merge_risk_flags(line_data, risk_flags)
    line_data["is_misplaced"] = line_data.get("is_misplaced", False) or is_misplaced
    _set_approval_status(line_data)


async def _handle_duplicate_count_line(
    sync_batch_service: SyncBatchService,
    session_id: str,
    line_data: dict[str, Any],
    existing_duplicate: dict[str, Any],
    *,
    write_service: CountLineWriteService,
    session: dict[str, Any],
    username: str,
    db_session: Optional[Any] = None,
) -> str:
    if not can_reuse_rejected_count_line(existing_duplicate, line_data):
        raise ValueError(
            "Duplicate Scan: This item has already been counted in this specific location (Floor/Rack)."
        )

    previous_line_id = extract_document_id(existing_duplicate) or str(existing_duplicate.get("_id"))
    root_recount_id = (
        existing_duplicate.get("recount_of_id") or existing_duplicate.get("id") or previous_line_id
    )
    new_line_data = dict(line_data)
    # Never carry legacy Mongo _id into new version inserts.
    new_line_data.pop("_id", None)
    new_line_data["id"] = str(uuid.uuid4())
    new_line_data["status"] = "pending"
    new_line_data["approval_status"] = new_line_data.get("approval_status") or "PENDING"
    new_line_data["verified"] = False
    new_line_data["verified_by"] = None
    new_line_data["verified_at"] = None
    new_line_data["rejected_by"] = None
    new_line_data["rejected_at"] = None
    new_line_data["assigned_to"] = None
    new_line_data["recount_requested_at"] = None
    new_line_data["recount_requested_by"] = None
    new_line_data["recount_iteration"] = (
        int(existing_duplicate.get("recount_iteration", 0) or 0) + 1
    )
    new_line_data["version"] = int(existing_duplicate.get("version", 1) or 1) + 1
    new_line_data["previous_version_id"] = previous_line_id
    new_line_data["recount_of_id"] = root_recount_id

    if db_session is not None:
        tx_context = db_session
    else:
        tx_context = None

    tx_manager = mongo_transaction(sync_batch_service.client)
    if tx_context is not None:
        class _NoopTx:
            async def __aenter__(self):
                return tx_context

            async def __aexit__(self, exc_type, exc, tb):
                return False

        tx_manager = _NoopTx()

    async with tx_manager as tx:
        await write_service.process_write(
            {"operation": "insert_one", "document": new_line_data},
            context={
                "session": session,
                "username": username,
                "db_session": tx,
                "skip_session_totals_update": True,
            },
        )
        await write_service.process_write(
            {
                "operation": "update_one",
                "filter": {"_id": existing_duplicate["_id"]},
                "update": {
                    "$set": {
                        "status": "SUPERSEDED",
                        "superseded_at": _utc_now(),
                        "superseded_by": username,
                        "superseded_by_version_id": new_line_data["id"],
                        "location_id": new_line_data.get("location_id"),
                        "floor_id": new_line_data.get("floor_id"),
                        "rack_id": new_line_data.get("rack_id"),
                    }
                },
            },
            context={
                "session": session,
                "username": username,
                "session_id": session_id,
                "db_session": tx,
            },
        )
    return "Rejected count line superseded by new recount version"


async def _process_count_line_op(
    line_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    sync_batch_service: SyncBatchService,
) -> str:
    """Process a count_line sync operation."""
    sync_batch_service = _as_sync_batch_service(sync_batch_service)
    _remap_line_session_id(line_data, id_mapping)
    session_id = _require_count_line_session_id(line_data)
    session = await _assert_session_accepts_offline_count(
        sync_batch_service,
        session_id,
        actor=str(current_user.get("username") or "system"),
    )
    _enforce_required_count_line_context(line_data)
    _set_count_line_defaults(line_data, current_user)
    if await _count_line_is_idempotent(sync_batch_service, session_id, line_data):
        return "Count line already synced"
    line_data.setdefault("status", "pending")
    database = sync_batch_service.database
    write_service = CountLineWriteService(database)
    existing_duplicate = await find_duplicate_count_line(database, line_data)
    if existing_duplicate:
        return await _handle_duplicate_count_line(
            sync_batch_service=sync_batch_service,
            session_id=session_id,
            line_data=line_data,
            existing_duplicate=existing_duplicate,
            write_service=write_service,
            session=session,
            username=str(current_user.get("username") or "system"),
        )
    await write_service.process_write(
        {"operation": "insert_one", "document": line_data},
        context={"session": session, "username": str(current_user.get("username") or "system")},
    )
    return "Count line synced with canonical duplicate validation"


async def _process_unknown_item_op(
    item_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    sync_batch_service: SyncBatchService,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.unknown_item_operation")
