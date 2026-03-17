import inspect
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from backend.api.schemas import BulkCountLineUpdate, CountLineCreate
from backend.auth.dependencies import get_current_user
from backend.core.websocket_manager import manager
from backend.db.runtime import get_db
from backend.models.audit import AuditEventType, AuditLogStatus
from backend.services.activity_log import ActivityLogService
from backend.services.lock_service import LockService, ResourceLockedError
from backend.services.notification_service import NotificationService
from backend.services.snapshot_service import SnapshotService
from backend.services.variant_service import VariantService

logger = logging.getLogger(__name__)
router = APIRouter()


_activity_log_service: Optional[ActivityLogService] = None
_lock_service: Optional[LockService] = None
_snapshot_service: Optional[SnapshotService] = None
_variant_service: Optional[VariantService] = None


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
):
    global _activity_log_service, _lock_service, _snapshot_service, _variant_service
    _activity_log_service = activity_log_service
    _lock_service = lock_service
    _snapshot_service = snapshot_service
    _variant_service = variant_service


def _get_db_client(db_override=None):
    """Resolve the active database client, raising if not initialized."""
    if db_override:
        return db_override
    try:
        return get_db()
    except RuntimeError:
        raise HTTPException(status_code=500, detail="Database is not initialized")


def _require_supervisor(current_user: dict):
    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Supervisor access required")


# Helper function to detect high-risk corrections
def detect_risk_flags(erp_item: dict, line_data: CountLineCreate, variance: float) -> list[str]:
    """Detect high-risk correction patterns"""
    risk_flags = []

    # Get values
    erp_qty = erp_item.get("stock_qty", 0)
    erp_mrp = erp_item.get("mrp", 0)
    counted_mrp = line_data.mrp_counted or erp_mrp

    # Calculate percentages safely
    variance_percent = (abs(variance) / erp_qty * 100) if erp_qty > 0 else 100
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
def calculate_financial_impact(erp_mrp: float, counted_mrp: float, counted_qty: float) -> float:
    """Calculate revenue impact of MRP change"""
    old_value = erp_mrp * counted_qty
    new_value = counted_mrp * counted_qty
    return new_value - old_value


def _build_count_line_draft_filter(line_data: CountLineCreate, username: str) -> dict[str, Any]:
    return {
        "session_id": line_data.session_id,
        "item_code": line_data.item_code,
        "counted_by": username,
        "floor_no": line_data.floor_no,
        "rack_no": line_data.rack_no,
    }


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
    db = _get_db_client()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    draft_filter = _build_count_line_draft_filter(line_data, current_user["username"])
    draft_payload = {
        **line_data.model_dump(mode="json"),
        "barcode": line_data.barcode,
        "counted_by": current_user["username"],
        "status": "draft",
        "updated_at": now,
    }

    existing_draft_result = db.count_line_drafts.find_one(draft_filter)
    existing_draft = (
        await existing_draft_result
        if inspect.isawaitable(existing_draft_result)
        else existing_draft_result
    )
    if existing_draft:
        update_result = db.count_line_drafts.update_one(
            {"_id": existing_draft["_id"]},
            {"$set": draft_payload},
        )
        if inspect.isawaitable(update_result):
            await update_result
        draft_id = str(existing_draft["_id"])
    else:
        draft_payload["created_at"] = now
        insert_result = db.count_line_drafts.insert_one(draft_payload)
        result = await insert_result if inspect.isawaitable(insert_result) else insert_result
        draft_id = str(result.inserted_id)

    logger.debug(f"Draft saved for item {line_data.item_code}: {line_data.counted_qty}")
    return {
        "success": True,
        "message": "Draft saved successfully",
        "data": {
            "id": draft_id,
            **draft_payload,
        },
    }


@router.post("/count-lines")
async def create_count_line(
    request: Request,
    line_data: CountLineCreate,
    current_user: dict = Depends(get_current_user),
):
    db = _get_db_client()

    # Validate session exists (support both async and sync mocks)
    result = db.sessions.find_one({"id": line_data.session_id})
    session = await result if inspect.isawaitable(result) else result
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Enforce session status
    # Allow OPEN or ACTIVE. Reject CLOSED or RECONCILE
    # (if we consider RECONCILE as closed for counting)
    if session.get("status") not in ["OPEN", "ACTIVE"]:
        raise HTTPException(status_code=400, detail="Session is not active")

    # Check if session is in reconciliation mode (ACTIVE but reconciled_at is set)
    if session.get("reconciled_at"):
        raise HTTPException(status_code=400, detail="Session is in reconciliation mode")

    # Get ERP item - prefer barcode for exact batch identification if provided
    erp_item = None
    if line_data.barcode:
        result_item = db.erp_items.find_one({"barcode": line_data.barcode})
        erp_item = await result_item if inspect.isawaitable(result_item) else result_item

    if not erp_item:
        # Fallback to item_code
        result_item = db.erp_items.find_one({"item_code": line_data.item_code})
        erp_item = await result_item if inspect.isawaitable(result_item) else result_item

    if not erp_item:
        raise HTTPException(status_code=404, detail="Item not found in ERP")

    # --- Rule 2: Stock Snapshot Control ---
    # Instead of live ERP qty, we must use a frozen snapshot.
    # Verification triggers the snapshot creation if it doesn't exist.
    erp_snapshot = None
    if _snapshot_service:
        erp_snapshot = await _snapshot_service.get_or_create_snapshot(
            line_data.session_id, line_data.item_code, current_user["username"]
        )

    # Use snapshot qty if available, fallback to live (emergency only)
    erp_qty = erp_snapshot.get("erp_qty") if erp_snapshot else erp_item.get("stock_qty", 0)
    baseline_hash = erp_snapshot.get("baseline_hash") if erp_snapshot else "UNHASHED_FALLBACK"

    # Calculate variance using snapshot quantity (Rule 2 + Rule 4)
    variance = line_data.counted_qty - erp_qty

    # Validate mandatory correction reason for variance
    if abs(variance) > 0 and not line_data.correction_reason and not line_data.variance_reason:
        raise HTTPException(
            status_code=400,
            detail="Correction reason is mandatory when variance exists",
        )

    # Detect risk flags
    risk_flags = detect_risk_flags(erp_item, line_data, variance)

    # --- Misplaced Stock Logic ---
    # Compare found location (line_data) vs expected (erp_item)
    is_misplaced = False

    # Normalize inputs: Empty string equals None for comparison
    found_floor = (line_data.floor_no or "").strip().upper()
    found_rack = (line_data.rack_no or "").strip().upper()

    # ERP location might be stored in 'floor'/'rack' OR 'location' field.
    # Schema says: floor: Optional[str], rack: Optional[str], location: Optional[str]
    expected_floor = (erp_item.get("floor") or "").strip().upper()
    expected_rack = (erp_item.get("rack") or "").strip().upper()

    # If ERP has no specific location defined, we can't mark it misplaced?
    # Or if logic mandates strict slotting?
    # Let's assume if ERP has location info, we validate.

    if expected_floor or expected_rack:
        # Check mismatch
        floor_mismatch = found_floor and expected_floor and found_floor != expected_floor
        rack_mismatch = found_rack and expected_rack and found_rack != expected_rack

        if floor_mismatch or rack_mismatch:
            is_misplaced = True
            risk_flags.append("MISPLACED_ITEM")
            # If not already flagged by variance/etc, ensure we force review
            line_data.is_misplaced = True
            line_data.expected_location = f"{expected_floor}/{expected_rack}"
            line_data.found_location = f"{found_floor}/{found_rack}"

            # --- Rule Compliance: Ensure RelocationStatus is typed correctly ---
            from backend.api.schemas import RelocationStatus

            line_data.relocation_status = RelocationStatus.PENDING

    # Enforce strict mode validation
    if session.get("type") == "STRICT" and abs(variance) > 0:
        risk_flags.append("STRICT_MODE_VARIANCE")

    # Calculate financial impact
    counted_mrp = line_data.mrp_counted or erp_item["mrp"]
    financial_impact = calculate_financial_impact(
        erp_item["mrp"], counted_mrp, line_data.counted_qty
    )

    # --- Strict Governance: Atomic Locking & Uniqueness Gate ---
    # Rule 5: Variant Propagation Engine
    # We lock the item_id family in addition to the location specific lock
    item_id = erp_item.get("item_id")
    variant_lock_key = f"product:{item_id}" if item_id else None

    lock_key = (
        f"{line_data.session_id}:{line_data.item_code}:{line_data.floor_no}:{line_data.rack_no}"
    )
    lock_acquired = False
    variant_lock_acquired = False

    try:
        if _lock_service:
            try:
                # 1. Acquire Variant Family Lock (Rule 5)
                if variant_lock_key and _variant_service:
                    # We use a session-scoped product lock to allow parallel counts in different sessions
                    # BUT for Rule 5 strictness, we might want global product lock if specified.
                    # Mandate says: "locks/flags on any batch must propagate to all related SKUs"
                    session_variant_lock = f"session:{line_data.session_id}:{variant_lock_key}"
                    variant_lock_acquired = await _lock_service.acquire_lock(
                        session_variant_lock, current_user["username"]
                    )

                # 2. Acquire Specific Item/Location Lock
                # 30s TTL default
                lock_acquired = await _lock_service.acquire_lock(lock_key, current_user["username"])
            except ResourceLockedError as e:
                # If we failed to acquire variant lock, specifically call it out
                lock_error_detail = (
                    "Item or one of its variants is currently being counted by another user."
                )
                if "session" in str(e):
                    lock_error_detail = "A related SKU/Variant is currently being counted in this session. Please wait."

                raise HTTPException(
                    status_code=423,
                    detail=lock_error_detail,
                )

        # Uniqueness Gate: Block duplicate location scans
        # Rule: UNIQUE(window_id, item_code, location_code, zone)
        # Using floor_no + rack_no as proxy for location+zone
        unique_filter = {
            "session_id": line_data.session_id,
            "item_code": line_data.item_code,
            "floor_no": line_data.floor_no,
            "rack_no": line_data.rack_no,
        }
        # If barcode is present, strict check against barcode too?
        # No, duplicate items in same rack is the issue.

        # Check if already exists to handle forks/conflicts
        existing_counts = await db.count_lines.find(unique_filter).sort("counted_at", -1).to_list(1)
        existing_count = existing_counts[0] if existing_counts else None

        is_conflict = False
        previous_version_id = None
        version = 1

        if existing_count:
            previous_version_id = existing_count.get("id")
            version = existing_count.get("version", 1) + 1

            # If the existing count is pending or approved, this new scan creates a governance conflict
            if existing_count.get("status") in ["pending", "approved"]:
                is_conflict = True
                risk_flags.append("CONFLICTING_COUNT")
            # If it's rejected, it's a standard recount fork, no special conflict flag needed
        # We can keep it for checking duplicates across *different* locations? No, that's allowed.
        # So the below logic is mostly covered by Strict Gate above.
        # But let's check if the user wanted to flag something else.
        # The legacy check was: session + item + username. (Prevents same user scanning same item ANYWHERE?)
        # That was invalid logic. We replace it.

        # Determine approval status based on risk
        # High-risk corrections require supervisor review
        approval_status = "NEEDS_REVIEW" if risk_flags else "PENDING"

        # Create count line with enhanced fields
        count_line = {
            "id": str(uuid.uuid4()),
            "session_id": line_data.session_id,
            "item_code": line_data.item_code,
            "barcode": line_data.barcode or erp_item.get("barcode"),
            "item_name": erp_item["item_name"],
            "erp_qty": erp_qty,  # Rule 2: Frozen quantity
            "baseline_hash": baseline_hash,  # Rule 2: Snapshot Hash
            "counted_qty": line_data.counted_qty,
            "variance": variance,
            # Legacy fields
            "variance_reason": line_data.variance_reason,
            "variance_note": line_data.variance_note,
            "remark": line_data.remark,
            "photo_base64": line_data.photo_base64,
            # Enhanced fields
            "damaged_qty": line_data.damaged_qty,
            "item_condition": line_data.item_condition,
            "floor_no": line_data.floor_no,
            "rack_no": line_data.rack_no,
            "mark_location": line_data.mark_location,
            "sr_no": line_data.sr_no,
            "manufacturing_date": line_data.manufacturing_date,
            "mfg_date_format": (
                line_data.mfg_date_format.value if line_data.mfg_date_format else None
            ),
            "expiry_date": line_data.expiry_date,
            "expiry_date_format": (
                line_data.expiry_date_format.value if line_data.expiry_date_format else None
            ),
            "non_returnable_damaged_qty": line_data.non_returnable_damaged_qty,
            "correction_reason": (
                line_data.correction_reason.model_dump() if line_data.correction_reason else None
            ),
            "photo_proofs": (
                [p.model_dump() for p in line_data.photo_proofs] if line_data.photo_proofs else None
            ),
            "correction_metadata": (
                line_data.correction_metadata.model_dump()
                if line_data.correction_metadata
                else None
            ),
            "approval_status": approval_status,
            "approval_by": None,
            "approval_at": None,
            "rejection_reason": None,
            # Misplaced Stock Fields
            "is_misplaced": is_misplaced,
            "expected_location": line_data.expected_location,
            "found_location": line_data.found_location,
            "relocation_status": line_data.relocation_status,  # PENDING/MOVED/IGNORED
            "risk_flags": risk_flags,
            "financial_impact": financial_impact,
            # User and timestamp
            "created_by": current_user["username"],  # Legacy field
            "counted_by": current_user["username"],
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            # Lineage fields
            "version": version,
            "previous_version_id": previous_version_id,
            "is_conflict": is_conflict,
            # MRP tracking
            "mrp_erp": erp_item["mrp"],
            "mrp_counted": line_data.mrp_counted,
            # Additional fields
            "split_section": line_data.split_section,
            "category_correction": line_data.category_correction,
            "subcategory_correction": line_data.subcategory_correction,
            "serial_numbers": (line_data.serial_numbers if line_data.serial_numbers else None),
            # Enhanced serial entries with per-serial attributes
            "serial_entries": (
                [s.model_dump() for s in line_data.serial_entries]
                if line_data.serial_entries
                else None
            ),
            # Legacy approval fields
            "status": "pending",
            "verified": False,
            "verified_at": None,
            "verified_by": None,
        }

        await db.count_lines.insert_one(count_line)

        draft_update_result = db.count_line_drafts.update_one(
            _build_count_line_draft_filter(line_data, current_user["username"]),
            {
                "$set": {
                    "status": "submitted",
                    "submitted_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "submitted_count_line_id": count_line["id"],
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )
        if inspect.isawaitable(draft_update_result):
            await draft_update_result

    finally:
        if _lock_service:
            if lock_acquired:
                await _lock_service.release_lock(lock_key, current_user["username"])
            if variant_lock_acquired:
                session_variant_lock = f"session:{line_data.session_id}:{variant_lock_key}"
                await _lock_service.release_lock(session_variant_lock, current_user["username"])

    # Real-time Broadcast: Notify active subscribers (e.g. Watchtower)
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
        # Also broadcast global "new_scan" for Watchtower aggregate view
        # (all active sessions) if needed.
        # But efficiently, Watchtower can just subscribe to key channels
        # or we broadcast to a 'global_watchtower' channel?
        # Current manager doesn't have channels, just user/session.
        # Watchtower user is a supervisor. They might be watching ALL sessions?
        # For now, let's also broadcast to ALL connected supervisors or a "watchtower" channel.
        # Since manager.broadcast_all sends to everyone, maybe too much.
        # Let's rely on supervisor being subscribed to active sessions they care about,
        # OR specific watchtower polling.
        # Actually, let's simplify: Watchtower polls for aggregate stats.
        # But individual session view (if we implement it) uses this.
        # Also, if we want Watchtower to be live, we can just poll.
        # BUT the user asked for "Real-Time".
        # Let's emit to the "watchtower" topic if we had one.
        # For now, let's just emit to the session channel.

    except Exception as e:
        logger.warning(f"Failed to broadcast scan event: {e}")

    # Update session stats atomically using aggregation
    try:
        pipeline: list[dict[str, Any]] = [
            {"$match": {"session_id": line_data.session_id}},
            {
                "$group": {
                    "_id": None,
                    "total_items": {"$sum": 1},
                    "total_variance": {"$sum": "$variance"},
                }
            },
        ]
        cursor = db.count_lines.aggregate(pipeline)
        if hasattr(cursor, "__await__"):
            cursor = await cursor
        stats = await cursor.to_list(1)
        if stats:
            await db.sessions.update_one(
                {"id": line_data.session_id},
                {
                    "$set": {
                        "total_items": stats[0]["total_items"],
                        "total_variance": stats[0]["total_variance"],
                    }
                },
            )
    except Exception as e:
        logger.error(f"Failed to update session stats: {str(e)}")
        # Non-critical error, continue execution

    # Update session barcode if this count line has a barcode and session doesn't have one yet
    try:
        if line_data.barcode:
            session_result = await db.sessions.find_one({"id": line_data.session_id})
            if session_result and not session_result.get("barcode"):
                await db.sessions.update_one(
                    {"id": line_data.session_id}, {"$set": {"barcode": line_data.barcode}}
                )
                logger.info(
                    f"Updated session {line_data.session_id} with barcode {line_data.barcode}"
                )
    except Exception as e:
        logger.error(f"Failed to update session barcode: {str(e)}")
        # Non-critical error, continue execution

    # Log high-risk correction
    if risk_flags:
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

        # Audit Log for High Risk
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
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

    # Remove the MongoDB _id field before returning
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

    update_result = await db_client.count_lines.update_one(
        {"id": line_id},
        update={
            "$set": {
                "verified": True,
                "verified_by": current_user["username"],
                "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

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

    update_result = await db_client.count_lines.update_one(
        {"id": line_id},
        update={"$set": {"verified": False, "verified_by": None, "verified_at": None}},
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

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
    skip = (page - 1) * page_size
    filter_query: dict[str, Any] = {"session_id": session_id}

    if verified is not None:
        filter_query["verified"] = verified

    db_client = _get_db_client(db_override)
    total = await db_client.count_lines.count_documents(filter_query)
    lines_cursor = (
        db_client.count_lines.find(filter_query, {"_id": 0})
        .sort("counted_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    lines = await lines_cursor.to_list(page_size)

    return {
        "items": lines,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "has_next": skip + page_size < total,
            "has_prev": page > 1,
        },
    }


@router.get("/count-lines")
async def list_count_lines(
    current_user: dict = Depends(get_current_user),
    session_id: Optional[str] = Query(None),
    item_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    limit: Optional[int] = Query(None, ge=1, le=200),
):
    db_client = _get_db_client()
    filter_query: dict[str, Any] = {}
    if session_id:
        filter_query["session_id"] = session_id
    if item_code:
        filter_query["item_code"] = item_code

    effective_page_size = limit if limit is not None else page_size
    skip = (page - 1) * effective_page_size
    total = await db_client.count_lines.count_documents(filter_query)
    lines_cursor = (
        db_client.count_lines.find(filter_query, {"_id": 0})
        .sort("counted_at", -1)
        .skip(skip)
        .limit(effective_page_size)
    )
    lines = await lines_cursor.to_list(effective_page_size)
    total_pages = (
        (total + effective_page_size - 1) // effective_page_size if effective_page_size else 0
    )

    return {
        "items": lines,
        "pagination": {
            "page": page,
            "page_size": effective_page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": skip + effective_page_size < total,
            "has_prev": page > 1,
        },
    }


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
    return count_line


@router.put("/count-lines/{line_id}/approve")
async def approve_count_line(
    line_id: str,
    request: Optional[CountLineApprovalRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """Approve a count line variance."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        count_line = await _find_count_line(db, line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")

        approved_at = _current_timestamp()

        result = await db.count_lines.update_one(
            {"_id": count_line["_id"]},
            {
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
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

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
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

        return {"success": True, "message": "Count line approved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving count line {line_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/count-lines/{line_id}/reject")
async def reject_count_line(
    line_id: str,
    request: Optional[CountLineRejectRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """Reject a count line (request recount)."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        count_line = await _find_count_line(db, line_id)
        if not count_line:
            raise HTTPException(status_code=404, detail="Count line not found")

        rejected_at = _current_timestamp()
        owner_id = count_line.get("counted_by") or count_line.get("created_by")
        assigned_to = (request.assign_to if request else None) or owner_id
        rejection_reason = (
            request.notes if request and request.notes else "Supervisor requested recount"
        )

        result = await db.count_lines.update_one(
            {"_id": count_line["_id"]},
            {
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
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

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
    except Exception as e:
        logger.error(f"Error rejecting count line {line_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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
        cursor = db.count_lines.find({"session_id": session_id, "item_code": item_code})
        count_lines = await cursor.to_list(length=None)

        # Convert ObjectId to string
        for line in count_lines:
            line["_id"] = str(line["_id"])
            # Frontend expects a stable `line_id` field for follow-up actions (add qty, etc).
            line.setdefault("line_id", line.get("id") or line["_id"])

        return {"already_counted": len(count_lines) > 0, "count_lines": count_lines}
    except Exception as e:
        logger.error(f"Error checking item count: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


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
        existing = await db.count_lines.find_one(
            {
                "session_id": session_id,
                "$or": [
                    {"serial_numbers": candidate},
                    {"serial_entries.serial_number": candidate},
                ],
            },
            projection,
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
    count_line = await db.count_lines.find_one({"id": line_id})
    if count_line:
        return count_line
    try:
        return await db.count_lines.find_one({"_id": ObjectId(line_id)})
    except Exception:
        return None


def _current_timestamp() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.patch("/count-lines/{line_id}/add-quantity")
async def add_quantity_to_count_line(
    line_id: str,
    payload: AddQuantityRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Increment the counted quantity on an existing count line.

    Used by the UI when the same item_code is scanned again and the user chooses
    "Add to Existing" instead of creating a new count line.
    """
    db = _get_db_client()

    count_line = await _find_count_line(db, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")

    if payload.additional_qty == 0:
        raise HTTPException(status_code=400, detail="additional_qty must be non-zero")

    # Staff can only mutate their own count lines; supervisors/admin can mutate any.
    if current_user.get("role") not in {"supervisor", "admin"} and count_line.get(
        "counted_by"
    ) != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Not authorized to modify this count line")

    old_counted_qty = float(count_line.get("counted_qty") or 0)
    new_counted_qty = old_counted_qty + float(payload.additional_qty)

    erp_qty = float(count_line.get("erp_qty") or 0)
    old_variance = float(count_line.get("variance") or (old_counted_qty - erp_qty))
    new_variance = new_counted_qty - erp_qty

    mrp_erp = float(count_line.get("mrp_erp") or 0)
    mrp_counted = float(count_line.get("mrp_counted") or mrp_erp)
    financial_impact = (mrp_counted * new_counted_qty) - (mrp_erp * new_counted_qty)

    update_data: dict[str, Any] = {
        "counted_qty": new_counted_qty,
        "variance": new_variance,
        "financial_impact": financial_impact,
        "updated_at": _current_timestamp(),
        "updated_by": current_user.get("username"),
    }
    if payload.batches is not None:
        update_data["batches"] = payload.batches

    update_result = await db.count_lines.update_one(
        {"_id": count_line["_id"]}, {"$set": update_data}
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    # Best-effort: keep session totals consistent (variance is additive).
    try:
        delta = new_variance - old_variance
        session_id = count_line.get("session_id")
        if session_id and delta != 0:
            await db.sessions.update_one({"id": session_id}, {"$inc": {"total_variance": delta}})
    except Exception as exc:
        logger.warning(f"Failed to update session variance totals after add-quantity: {exc}")

    return {"success": True, "message": "Quantity added successfully", "data": update_data}


@router.put("/count-lines/{line_id}")
async def update_count_line(
    line_id: str,
    payload: CountLineUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing count line.

    Currently used by bulk tooling to patch counted_qty. We keep the payload minimal
    to avoid accidental overwrites of governance fields.
    """
    db = _get_db_client()

    count_line = await _find_count_line(db, line_id)
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")

    if payload.counted_qty is None and payload.batches is None:
        raise HTTPException(status_code=400, detail="No updatable fields provided")

    # Staff can only mutate their own count lines; supervisors/admin can mutate any.
    if current_user.get("role") not in {"supervisor", "admin"} and count_line.get(
        "counted_by"
    ) != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Not authorized to modify this count line")

    old_variance = float(count_line.get("variance") or 0)

    update_data: dict[str, Any] = {
        "updated_at": _current_timestamp(),
        "updated_by": current_user.get("username"),
    }

    if payload.counted_qty is not None:
        new_counted_qty = float(payload.counted_qty)
        erp_qty = float(count_line.get("erp_qty") or 0)
        new_variance = new_counted_qty - erp_qty

        mrp_erp = float(count_line.get("mrp_erp") or 0)
        mrp_counted = float(count_line.get("mrp_counted") or mrp_erp)
        financial_impact = (mrp_counted * new_counted_qty) - (mrp_erp * new_counted_qty)

        update_data.update(
            {
                "counted_qty": new_counted_qty,
                "variance": new_variance,
                "financial_impact": financial_impact,
            }
        )

    if payload.batches is not None:
        update_data["batches"] = payload.batches

    update_result = await db.count_lines.update_one(
        {"_id": count_line["_id"]}, {"$set": update_data}
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    # Best-effort: keep session totals consistent if qty was updated.
    try:
        if payload.counted_qty is not None:
            new_variance = (
                float(update_data["variance"]) if "variance" in update_data else old_variance
            )
            delta = new_variance - old_variance
            session_id = count_line.get("session_id")
            if session_id and delta != 0:
                await db.sessions.update_one(
                    {"id": session_id}, {"$inc": {"total_variance": delta}}
                )
    except Exception as exc:
        logger.warning(f"Failed to update session variance totals after count-line update: {exc}")

    return {"success": True, "message": "Count line updated successfully", "data": update_data}


async def _recalculate_session_stats(db, session_id: str) -> None:
    """Re-calculate session stats after line deletion."""
    try:
        pipeline: list[dict[str, Any]] = [
            {"$match": {"session_id": session_id}},
            {
                "$group": {
                    "_id": None,
                    "total_items": {"$sum": 1},
                    "total_variance": {"$sum": "$variance"},
                }
            },
        ]
        stats = await db.count_lines.aggregate(pipeline).to_list(1)
        update_data = {
            "total_items": stats[0]["total_items"] if stats else 0,
            "total_variance": stats[0]["total_variance"] if stats else 0,
        }
        await db.sessions.update_one({"id": session_id}, {"$set": update_data})
    except Exception as e:
        logger.error(f"Failed to update session stats after delete: {str(e)}")


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

        result = await db.count_lines.delete_one({"_id": count_line["_id"]})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Count line not found")

        await _recalculate_session_stats(db, count_line["session_id"])
        await _log_delete_activity(count_line, line_id, current_user, request)

        return {"success": True, "message": "Count line deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting count line {line_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/items/{item_code}/scan-status")
async def check_item_scan_status(
    session_id: str,
    item_code: str,
    current_user: dict = Depends(get_current_user),
):
    """Check if item has been scanned in this session and where"""
    db = _get_db_client()

    # Find all count lines for this item in this session
    cursor = db.count_lines.find({"session_id": session_id, "item_code": item_code})

    count_lines = await cursor.to_list(None)

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

        result = await db.count_lines.update_many(
            query,
            {
                "$set": {
                    "status": "APPROVED",
                    "approval_status": "APPROVED",
                    "approved_by": current_user["username"],
                    "approved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "verified": True,
                    "verified_by": current_user["username"],
                    "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "approval_note": update_data.notes,
                }
            },
        )

        return {
            "success": True,
            "message": f"Approved {result.modified_count} items",
            "modified_count": result.modified_count,
        }
    except Exception as e:
        logger.error(f"Error bulk approving: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/count-lines/bulk/reject")
async def bulk_reject_count_lines(
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

        result = await db.count_lines.update_many(
            query,
            {
                "$set": {
                    "status": "REJECTED",
                    "approval_status": "REJECTED",
                    "rejected_by": current_user["username"],
                    "rejected_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "verified": False,
                    "rejection_reason": update_data.notes,
                }
            },
        )

        return {
            "success": True,
            "message": f"Rejected {result.modified_count} items",
            "modified_count": result.modified_count,
        }
    except Exception as e:
        logger.error(f"Error bulk rejecting: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class ConflictResolutionRequest(BaseModel):
    winning_line_id: str
    losing_line_ids: list[str]
    resolution_notes: Optional[str] = None


@router.post("/count-lines/resolve-conflict")
async def resolve_conflict(
    request: ConflictResolutionRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Supervisor conflict resolution API.
    Resolves a conflict by marking one count line as the winner (pending approval)
    and the others as superseded (rejected/obsoleted).
    """
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    db = _get_db_client()

    try:
        winner = await _find_count_line(db, request.winning_line_id)
        if not winner:
            raise HTTPException(
                status_code=404, detail=f"Winning line {request.winning_line_id} not found"
            )

        # Mark losers as superseded
        losers_query = {"id": {"$in": request.losing_line_ids}}
        await db.count_lines.update_many(
            losers_query,
            {
                "$set": {
                    "status": "superseded",
                    "is_conflict": False,
                    "resolution_notes": request.resolution_notes,
                    "resolved_by": current_user["username"],
                    "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

        # Remove conflict flag from winner and set it to pending (or approved)
        await db.count_lines.update_one(
            {"_id": winner["_id"]},
            {
                "$set": {
                    "status": "pending",
                    "is_conflict": False,
                    "resolution_notes": request.resolution_notes,
                    "resolved_by": current_user["username"],
                    "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

        # Remove CONFLICTING_COUNT flag from risk_flags if present
        if "CONFLICTING_COUNT" in (winner.get("risk_flags") or []):
            await db.count_lines.update_one(
                {"_id": winner["_id"]}, {"$pull": {"risk_flags": "CONFLICTING_COUNT"}}
            )

        # Log resolution
        if _activity_log_service:
            await _activity_log_service.log_activity(
                user=current_user["username"],
                role=current_user.get("role", ""),
                action="resolve_conflict",
                entity_type="count_line",
                entity_id=winner["id"],
                details={
                    "winning_line_id": winner["id"],
                    "losing_line_ids": request.losing_line_ids,
                    "resolution_notes": request.resolution_notes,
                },
            )

        return {
            "success": True,
            "message": "Conflict resolved successfully",
            "winning_line_id": winner["id"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resolving conflict: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Canonical /api/item-batches/* route is served by erp_api.
# Keep this endpoint for count-lines specific workflows to avoid route shadowing.
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

        # Get SQL connector from app state
        sql_connector = getattr(router, "sql_connector", None)

        batches = []
        fetch_success = False
        source = "mongodb_offline_fallback"

        # 1. Try fetching from SQL Server if available
        if sql_connector:
            try:
                # Check if SQL connector is actually connected
                if getattr(sql_connector, "connection", None):
                    batches = sql_connector.get_item_batches(item_identifier)
                    fetch_success = True
                    source = "sql_server"
                else:
                    logger.info(
                        f"SQL connector available but not connected for '{item_identifier}'"
                    )
            except Exception as sql_err:
                logger.warning(f"SQL Server batch fetch failed for '{item_identifier}': {sql_err}")

        # 2. Fallback to MongoDB if SQL failed or not available
        if not fetch_success:
            logger.info(f"Using MongoDB fallback for item batches: {item_identifier}")
            query: dict[str, Any] = {
                "$or": [{"item_code": item_identifier}, {"barcode": item_identifier}]
            }
            # Add item_id if it's a number
            if item_identifier.isdigit():
                query["$or"].append({"item_id": int(item_identifier)})

            cursor = db.erp_items.find(query)
            mongo_items = await cursor.to_list(length=100)

            # Transform MongoDB items to batch format
            for item in mongo_items:
                batches.append(
                    {
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
                )

        # Transform batch data to include both manual and auto barcodes
        transformed_batches = []
        for batch in batches:
            # Use manual barcode if available, otherwise auto barcode
            barcode = batch.get("barcode") or batch.get("auto_barcode") or ""

            transformed_batch = {
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
            transformed_batches.append(transformed_batch)

        def _stock_value(value: Any) -> float:
            try:
                return float(value or 0)
            except (TypeError, ValueError):
                return 0.0

        transformed_batches = sorted(
            transformed_batches,
            key=lambda batch: (
                -_stock_value(batch.get("stock_qty")),
                str(batch.get("batch_no") or ""),
            ),
        )

        return {
            "success": True,
            "source": source,
            "batches": transformed_batches,
            "total_batches": len(transformed_batches),
            "item_identifier": item_identifier,
        }

    except Exception as e:
        logger.error(f"Error fetching item batches: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch item batches: {str(e)}")
