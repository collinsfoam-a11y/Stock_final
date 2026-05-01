"""
Rack Management API - Rack claiming, releasing, and status management
Supports multi-user concurrency with Redis-based locking
"""

import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pymongo.errors import PyMongoError
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.governance_guard import raise_forbidden_direct_write
from backend.services.lock_manager import get_lock_manager
from backend.services.pubsub_service import get_pubsub_service
from backend.services.rack_service import RackService, get_rack_service
from backend.services.session_state_machine import SessionStateMachine
from backend.services.redis_service import get_redis
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/racks", tags=["Rack Management"])
RACK_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


# Models


class RackStatus(BaseModel):
    """Rack status information"""

    rack_id: str
    floor: str
    status: str  # available, claimed, active, paused, completed
    claimed_by: Optional[str] = None
    session_id: Optional[str] = None
    lock_expires_at: Optional[float] = None
    updated_at: float


class RackClaimRequest(BaseModel):
    """Rack claim request"""

    floor: str = Field(..., description="Floor where rack is located")


class RackClaimResponse(BaseModel):
    """Rack claim response"""

    success: bool
    rack_id: str
    session_id: str
    floor: str
    lock_ttl: int
    message: str


class RackReleaseResponse(BaseModel):
    """Rack release response"""

    success: bool
    rack_id: str
    message: str


class AvailableRack(BaseModel):
    """Available rack information"""

    rack_id: str
    floor: str
    status: str
    item_count: int = 0  # Estimated items in rack


# Helper Functions


# Endpoints


@router.get("/available", response_model=list[AvailableRack])
async def get_available_racks(
    floor: Optional[str] = Query(None, description="Filter by floor"),
    current_user: dict[str, Any] = Depends(get_current_user),
    rack_service: RackService = Depends(get_rack_service),
) -> list[AvailableRack]:
    """
    Get list of available racks

    Filters:
    - floor: Optional floor filter
    - status: Only returns available or paused racks
    """
    result = []
    for rack in await rack_service.list_available_racks(floor):
        result.append(
            AvailableRack(
                rack_id=rack["rack_id"],
                floor=rack["floor"],
                status=rack["status"],
                item_count=int(rack.get("item_count", 0) or 0),
            )
        )

    logger.info(
        "Found %s available racks (floor=%s)",
        len(result),
        _safe_log_value(floor),
    )
    return result


@router.get("/floors", response_model=list[str])
async def get_floors(
    current_user: dict[str, Any] = Depends(get_current_user),
    rack_service: RackService = Depends(get_rack_service),
) -> list[str]:
    """Get list of all floors with racks"""
    return await rack_service.list_floors()


@router.post("/{rack_id}/claim", response_model=RackClaimResponse)
async def claim_rack(
    rack_id: str,
    request: RackClaimRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
    pubsub_service=Depends(get_pubsub_service),
    rack_service: RackService = Depends(get_rack_service),
) -> RackClaimResponse:
    """
    Claim a rack for exclusive use

    Process:
    1. Check if rack is available
    2. Acquire Redis lock
    3. Create session
    4. Update rack status
    5. Broadcast update
    """
    user_id = current_user["username"]
    lock_manager = get_lock_manager(redis_service)

    # Get or create rack
    rack = await rack_service.get_or_create_rack(rack_id, request.floor)

    # Check if rack is available
    if rack["status"] not in ["available", "paused"]:
        raise HTTPException(
            status_code=409,
            detail=f"Rack {rack_id} is not available (status: {rack['status']})",
        )

    # Try to acquire lock
    lock_ttl = 60
    acquired = await lock_manager.acquire_rack_lock(rack_id, user_id, ttl=lock_ttl)

    if not acquired:
        current_owner = await lock_manager.get_rack_lock_owner(rack_id)
        raise HTTPException(
            status_code=409,
            detail=f"Rack {rack_id} is locked by {current_owner}",
        )

    try:
        # Create session
        session_id = f"session_{user_id}_{rack_id}_{int(time.time())}"

        raise_forbidden_direct_write("rack_api.claim_rack.verification_sessions_insert")

        # Create session lock in Redis
        await lock_manager.create_session_lock(session_id, user_id, rack_id, ttl=3600)

        # Update rack status
        lock_expires_at = time.time() + lock_ttl
        await rack_service.update_rack_status(
            rack_id,
            status="active",
            claimed_by=user_id,
            session_id=session_id,
            lock_expires_at=lock_expires_at,
        )

        # Broadcast rack update
        await pubsub_service.publish_rack_update(
            rack_id,
            "claimed",
            {
                "user_id": user_id,
                "session_id": session_id,
                "floor": request.floor,
            },
        )

        logger.info(
            "Rack %s claimed by %s (session: %s)",
            _safe_log_value(rack_id),
            _safe_log_value(user_id),
            _safe_log_value(session_id),
        )

        return RackClaimResponse(
            success=True,
            rack_id=rack_id,
            session_id=session_id,
            floor=request.floor,
            lock_ttl=lock_ttl,
            message=f"Rack {rack_id} claimed successfully",
        )

    except RACK_ERRORS as e:
        # Release lock on error
        await lock_manager.release_rack_lock(rack_id, user_id)
        logger.error(
            "Error claiming rack %s: %s",
            _safe_log_value(rack_id),
            _safe_log_value(e, max_length=200),
        )
        raise HTTPException(status_code=500, detail=f"Failed to claim rack: {str(e)}")


@router.post("/{rack_id}/release", response_model=RackReleaseResponse)
async def release_rack(
    rack_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
    pubsub_service=Depends(get_pubsub_service),
    rack_service: RackService = Depends(get_rack_service),
) -> RackReleaseResponse:
    """
    Release rack lock

    Process:
    1. Verify ownership
    2. Release Redis lock
    3. Update rack status
    4. Update session status
    5. Broadcast update
    """
    user_id = current_user["username"]
    lock_manager = get_lock_manager(redis_service)

    # Get rack
    rack = await rack_service.get_rack(rack_id)
    if not rack:
        raise HTTPException(status_code=404, detail=f"Rack {rack_id} not found")

    # Verify ownership
    if rack["claimed_by"] != user_id:
        raise HTTPException(
            status_code=403,
            detail=f"Rack {rack_id} is not claimed by you",
        )

    # Release lock
    released = await lock_manager.release_rack_lock(rack_id, user_id)

    if not released:
        logger.warning("Failed to release Redis lock for rack %s", _safe_log_value(rack_id))

    # Update rack status
    await rack_service.update_rack_status(rack_id, status="available")

    # Update session status
    if rack["session_id"]:
        session = await rack_service.get_verification_session(rack["session_id"])
        if session and not SessionStateMachine.can_transition(
            session.get("status", ""), "completed"
        ):
            raise HTTPException(
                status_code=409,
                detail=(f"Invalid session transition: {session.get('status')} -> completed"),
            )
        raise_forbidden_direct_write("rack_api.release_rack.verification_sessions_update")

    # Broadcast update
    await pubsub_service.publish_rack_update(rack_id, "released", {"user_id": user_id})

    logger.info(
        "Rack %s released by %s",
        _safe_log_value(rack_id),
        _safe_log_value(user_id),
    )

    return RackReleaseResponse(
        success=True, rack_id=rack_id, message=f"Rack {rack_id} released successfully"
    )


@router.post("/{rack_id}/pause")
async def pause_rack(
    rack_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    pubsub_service=Depends(get_pubsub_service),
    rack_service: RackService = Depends(get_rack_service),
) -> dict[str, Any]:
    """
    Pause work on rack (keep lock)
    """
    user_id = current_user["username"]

    # Get rack
    rack = await rack_service.get_rack(rack_id)
    if not rack:
        raise HTTPException(status_code=404, detail=f"Rack {rack_id} not found")

    # Verify ownership
    if rack["claimed_by"] != user_id:
        raise HTTPException(status_code=403, detail=f"Rack {rack_id} is not claimed by you")

    # Update status
    await rack_service.update_rack_status(
        rack_id,
        status="paused",
        claimed_by=rack["claimed_by"],
        session_id=rack["session_id"],
        lock_expires_at=rack["lock_expires_at"],
    )

    # Update session
    if rack["session_id"]:
        session = await rack_service.get_verification_session(rack["session_id"])
        if session and not SessionStateMachine.can_transition(session.get("status", ""), "paused"):
            raise HTTPException(
                status_code=409,
                detail=f"Invalid session transition: {session.get('status')} -> paused",
            )
        raise_forbidden_direct_write("rack_api.pause_rack.verification_sessions_update")

    # Broadcast update
    await pubsub_service.publish_rack_update(rack_id, "paused", {"user_id": user_id})

    logger.info("Rack %s paused by %s", _safe_log_value(rack_id), _safe_log_value(user_id))

    return {"success": True, "rack_id": rack_id, "status": "paused"}


@router.post("/{rack_id}/resume")
async def resume_rack(
    rack_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    pubsub_service=Depends(get_pubsub_service),
    rack_service: RackService = Depends(get_rack_service),
) -> dict[str, Any]:
    """
    Resume work on paused rack
    """
    user_id = current_user["username"]

    # Get rack
    rack = await rack_service.get_rack(rack_id)
    if not rack:
        raise HTTPException(status_code=404, detail=f"Rack {rack_id} not found")

    # Verify ownership
    if rack["claimed_by"] != user_id:
        raise HTTPException(status_code=403, detail=f"Rack {rack_id} is not claimed by you")

    # Verify paused
    if rack["status"] != "paused":
        raise HTTPException(
            status_code=400,
            detail=f"Rack {rack_id} is not paused (status: {rack['status']})",
        )

    # Update status
    await rack_service.update_rack_status(
        rack_id,
        status="active",
        claimed_by=rack["claimed_by"],
        session_id=rack["session_id"],
        lock_expires_at=rack["lock_expires_at"],
    )

    # Update session
    if rack["session_id"]:
        session = await rack_service.get_verification_session(rack["session_id"])
        if session and not SessionStateMachine.can_transition(session.get("status", ""), "active"):
            raise HTTPException(
                status_code=409,
                detail=f"Invalid session transition: {session.get('status')} -> active",
            )
        raise_forbidden_direct_write("rack_api.resume_rack.verification_sessions_update")

    # Broadcast update
    await pubsub_service.publish_rack_update(rack_id, "resumed", {"user_id": user_id})

    logger.info("Rack %s resumed by %s", _safe_log_value(rack_id), _safe_log_value(user_id))

    return {"success": True, "rack_id": rack_id, "status": "active"}


@router.get("/{rack_id}/status", response_model=RackStatus)
async def get_rack_status(
    rack_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    rack_service: RackService = Depends(get_rack_service),
) -> RackStatus:
    """Get current rack status"""
    rack = await rack_service.get_rack(rack_id)
    if not rack:
        raise HTTPException(status_code=404, detail=f"Rack {rack_id} not found")

    return RackStatus(
        rack_id=rack["rack_id"],
        floor=rack["floor"],
        status=rack["status"],
        claimed_by=rack.get("claimed_by"),
        session_id=rack.get("session_id"),
        lock_expires_at=rack.get("lock_expires_at"),
        updated_at=rack["updated_at"],
    )


@router.get("/user/active")
async def get_user_active_racks(
    current_user: dict[str, Any] = Depends(get_current_user),
    rack_service: RackService = Depends(get_rack_service),
) -> list[RackStatus]:
    """Get all racks claimed by current user"""
    user_id = current_user["username"]

    racks = await rack_service.list_user_active_racks(user_id)

    return [
        RackStatus(
            rack_id=rack["rack_id"],
            floor=rack["floor"],
            status=rack["status"],
            claimed_by=rack.get("claimed_by"),
            session_id=rack.get("session_id"),
            lock_expires_at=rack.get("lock_expires_at"),
            updated_at=rack["updated_at"],
        )
        for rack in racks
    ]
