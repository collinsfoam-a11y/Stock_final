"""
Batch Sync API - High-performance batch synchronization
Handles offline queue sync with conflict detection and retry logic
and preserves backward compatibility with legacy offline payloads.
"""

import logging
from backend.utils.api_utils import sanitize_for_logging
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
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
from backend.services.redis_service import get_redis
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.sync_conflicts_service import SyncConflictsService
from backend.services.transaction_manager import mongo_transaction
from backend.services.validation_service import ValidationService

logger = logging.getLogger(__name__)


def _normalize_serial_numbers(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        serial = str(value or "").strip().upper()
        if serial and serial not in seen:
            seen.add(serial)
            normalized.append(serial)
    return normalized


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
    location_id: str = Field(..., description="Location ID")
    floor_id: str = Field(..., description="Floor ID")
    rack_id: str = Field(..., description="Rack ID")
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
    normalized_serials = _normalize_serial_numbers(record.serial_numbers)
    record.serial_numbers = normalized_serials

    # Check for duplicate serial numbers
    if normalized_serials:
        validation_service = ValidationService(db)
        for serial in normalized_serials:
            existing = await validation_service.find_serial_conflict(
                serial,
                item_code=record.item_code,
            )
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
                    message="Serial already exists for this item.",
                    details={
                        "serial": serial,
                        "existing_record": str(
                            existing.get("count_line_id") or existing.get("_id")
                        ),
                        "conflict_id": conflict_id,
                        "item_code": existing.get("item_code"),
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

    # Check rack lock (if rack_id provided).
    # FIX GROUP 3: Lock ownership is keyed by username, never session_id.
    if record.rack_id:
        owner = await lock_manager.get_rack_lock_owner(record.rack_id)
        if owner and owner != user_id:
            return SyncConflict(
                client_record_id=record.client_record_id,
                conflict_type="rack_locked",
                message=f"Rack {record.rack_id} is locked by another user",
                details={"rack_id": record.rack_id},
            )

    return None


async def sync_single_record(
    record: SyncRecord,
    db,
    user_id: str,
    *,
    user_role: Optional[str] = None,
    write_service: Optional[CountLineWriteService] = None,
    lifecycle_service: Optional[SessionLifecycleService] = None,
) -> tuple[bool, Optional[str]]:
    """
    Sync a single record to database

    Returns:
        (success: bool, error_message: Optional[str])
    """
    try:
        lifecycle_service = lifecycle_service or SessionLifecycleService(db)
        session = await lifecycle_service.ensure_session_active(record.session_id)
        if str(user_role or "").strip().lower() not in {"supervisor", "admin"}:
            owner = str(session.get("staff_user") or "").strip()
            if owner and owner != user_id:
                return False, "Not authorized to sync records for this session"

        floor_id = (record.floor_id or record.floor or "").strip()
        rack_id = (record.rack_id or "").strip()
        location_id = (record.location_id or "").strip()
        if not location_id or not floor_id or not rack_id:
            return (
                False,
                "CRITICAL: location_id, floor_id, and rack_id are required for sync writes",
            )

        status_normalized = (record.status or "").strip().lower()
        # AUTH-02: only supervisors/admins may finalize + approve a count line.
        # A non-privileged (staff) "finalized" sync payload is downgraded to a
        # pending, unverified line routed to supervisor review — it must never be
        # self-approved/self-finalized via the sync payload. Final approval is
        # owned by the audited governance/variance path in CountLineWriteService.
        has_approval_authority = str(user_role or "").strip().lower() in {"supervisor", "admin"}
        is_finalized = status_normalized == "finalized" and has_approval_authority
        counted_at = datetime.fromisoformat(record.created_at.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        updated_at = datetime.fromisoformat(record.updated_at.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        serial_numbers = _normalize_serial_numbers(record.serial_numbers)
        # FIX GROUP 1: For serial-tracked items quantity must equal actual serial count.
        # Override client-supplied verified_qty to prevent client-side inflation.
        if serial_numbers:
            counted_qty = float(len(serial_numbers))
        else:
            counted_qty = float(record.verified_qty)
        if record.damaged_qty > counted_qty:
            return (
                False,
                f"damaged_qty ({record.damaged_qty}) exceeds counted_qty ({counted_qty})",
            )
        doc = {
            "id": str(uuid.uuid4()),
            "client_record_id": record.client_record_id,
            "idempotency_key": record.client_record_id,
            "session_id": record.session_id,
            "location_id": location_id,
            "floor_id": floor_id,
            "rack_id": rack_id,
            "floor_no": floor_id,
            "rack_no": rack_id,
            "item_code": record.item_code,
            "counted_qty": counted_qty,
            "damaged_qty": record.damaged_qty,
            "serial_numbers": serial_numbers,
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

        if await _count_line_is_idempotent(db, record.session_id, doc):
            return True, None

        write_service = write_service or CountLineWriteService(db)
        existing_duplicate = await find_duplicate_count_line(db, doc)
        if existing_duplicate:
            await _handle_duplicate_count_line(
                db=db,
                session_id=record.session_id,
                line_data=doc,
                existing_duplicate=existing_duplicate,
                write_service=write_service,
                session=session,
                username=user_id,
            )
        else:
            await write_service.process_write(
                {"operation": "insert_one", "document": doc},
                context={"session": session, "username": user_id},
            )

        return True, None

    except GovernanceViolation as e:
        logger.error(
            "Governance violation syncing record {record.client_record_id}: %s",
            sanitize_for_logging(str(e)),
        )
        return False, str(e)
    except Exception as e:
        logger.error(
            "Error syncing record {record.client_record_id}: %s", sanitize_for_logging(str(e))
        )
        return False, str(e)


@router.post("/batch", response_model=BatchSyncResponse)
async def sync_batch(
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

    if request.operations:
        raise HTTPException(
            status_code=410,
            detail=(
                "CRITICAL: Legacy operations-based sync is disabled. "
                "Submit records-based payload only."
            ),
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
        write_service = CountLineWriteService(db)
        lifecycle_service = SessionLifecycleService(db)
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
                    user_id,
                    user_role=str(current_user.get("role") or ""),
                    write_service=write_service,
                    lifecycle_service=lifecycle_service,
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
        logger.error("Batch sync failed: %s", sanitize_for_logging(str(e)))
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

    # FIX GROUP 3: Renew rack lock using username (consistent with acquire).
    rack_renewed = False
    if rack_id:
        rack_renewed = await lock_manager.renew_rack_lock(rack_id, user_id, ttl=60)

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
    db: Any,
    operation: str,
    now: datetime,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.single_session_operation")


async def _process_session_mutation_operation(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
) -> Optional[str]:
    operation = _normalize_operation_name(session_data)
    if not operation:
        return None

    now = _utc_now()
    if operation in {"bulk_close", "bulk_reconcile"}:
        return await _apply_bulk_session_operation(
            session_data, current_user, id_mapping, db, operation, now
        )
    if operation in {"close", "reconcile"}:
        return await _apply_single_session_operation(
            session_data, current_user, id_mapping, db, operation, now
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
) -> str:
    raise_forbidden_direct_write("sync_batch_api.session_creation_operation")


async def _process_session_op(
    session_data: dict[str, Any],
    current_user: dict[str, Any],
    id_mapping: dict[str, str],
    db: Any,
) -> str:
    """Process a session sync operation."""
    operation_result = await _process_session_mutation_operation(
        session_data, current_user, id_mapping, db
    )
    if operation_result:
        return operation_result
    return await _process_session_creation(session_data, current_user, id_mapping, db)


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


async def _assert_session_accepts_offline_count(db: Any, session_id: str) -> dict[str, Any]:
    lifecycle_service = SessionLifecycleService(db)
    session = await lifecycle_service.ensure_session_active(session_id)
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


async def _populate_offline_count_line_stats(db: Any, line_data: dict[str, Any]) -> None:
    # Precompute fields from immutable baseline; CountLineWriteService re-validates on write.
    erp_item = await _find_erp_item_for_line(db, line_data)
    current_sql_qty = float((erp_item or {}).get("stock_qty") or 0.0)
    erp_mrp = float((erp_item or {}).get("mrp") or 0.0)
    counted_qty = float(line_data.get("counted_qty", 0.0))
    mrp_c = line_data.get("mrp_counted") or line_data.get("counted_mrp") or erp_mrp
    counted_mrp = float(mrp_c)

    write_service = CountLineWriteService(db)
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
    db: Any,
    session_id: str,
    line_data: dict[str, Any],
    existing_duplicate: dict[str, Any],
    *,
    write_service: CountLineWriteService,
    session: dict[str, Any],
    username: str,
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

    async with mongo_transaction(db.client) as tx:
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
    db: Any,
) -> str:
    """Process a count_line sync operation."""
    _remap_line_session_id(line_data, id_mapping)
    session_id = _require_count_line_session_id(line_data)
    session = await _assert_session_accepts_offline_count(db, session_id)
    _enforce_required_count_line_context(line_data)
    _set_count_line_defaults(line_data, current_user)
    if await _count_line_is_idempotent(db, session_id, line_data):
        return "Count line already synced"
    line_data.setdefault("status", "pending")
    write_service = CountLineWriteService(db)
    existing_duplicate = await find_duplicate_count_line(db, line_data)
    if existing_duplicate:
        return await _handle_duplicate_count_line(
            db=db,
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
    db: Any,
) -> str:
    raise_forbidden_direct_write("sync_batch_api.unknown_item_operation")


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
) -> BatchSyncResponse:
    raise HTTPException(
        status_code=410,
        detail=("CRITICAL: Legacy operations-based sync is disabled. Use records-based sync only."),
    )
