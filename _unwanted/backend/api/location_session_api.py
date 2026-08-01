"""Location Session API - Staff session management for physical locations."""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.api.schemas import (
    LocationSession,
    LocationSessionCreate,
    LocationSessionStatus,
)
from backend.auth.dependencies import get_current_user, require_role
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/location-sessions", tags=["Location Sessions"])


@router.post("/create", response_model=LocationSession)
async def create_location_session(
    request: LocationSessionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> LocationSession:
    """Create a new location session for the current master session and location."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    # Verify master session exists and is active
    master = await db.master_sessions.find_one({"id": request.master_session_id})
    if not master:
        raise HTTPException(
            status_code=404,
            detail=f"Master session {request.master_session_id} not found",
        )
    if master.get("status") != "ACTIVE":
        raise HTTPException(
            status_code=409,
            detail=f"Master session is in {master.get('status')} state, not ACTIVE.",
        )

    # Verify location exists and belongs to this master session
    location = await db.locations.find_one({"id": request.location_id})
    if not location:
        raise HTTPException(
            status_code=404,
            detail=f"Location {request.location_id} not found",
        )

    # Enforce one active location session per location
    existing = await db.location_sessions.find_one(
        {
            "location_id": request.location_id,
            "master_session_id": request.master_session_id,
            "status": {"$in": ["ACTIVE", "CLAIMED", "PAUSED", "RECONCILE"]},
        }
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Location {request.location_id} already has an active session.",
        )

    # Enforce one active session per employee
    employee_active = await db.location_sessions.find_one(
        {
            "created_by": current_user["username"],
            "status": {"$in": ["ACTIVE", "CLAIMED", "PAUSED", "RECONCILE"]},
        }
    )
    if employee_active:
        raise HTTPException(
            status_code=409,
            detail="Employee already has an active location session.",
        )

    location_session = LocationSession(
        master_session_id=request.master_session_id,
        location_id=request.location_id,
        location_name=location.get("name", ""),
        location_level=location.get("level", "RACK"),
        warehouse=location.get("warehouse"),
        floor=location.get("floor"),
        rack=location.get("rack"),
        company=location.get("company"),
        showroom=location.get("showroom"),
        zone=location.get("zone"),
        status=LocationSessionStatus.AVAILABLE,
        created_by=current_user["username"],
        created_by_name=current_user.get("full_name"),
        created_at=now,
        baseline_qty=master.get("baseline_qty"),
        baseline_at=master.get("baseline_at"),
        ownership_events=[
            {
                "event_type": "CREATED",
                "actor": current_user["username"],
                "actor_role": current_user.get("role", "staff"),
                "timestamp": now,
            }
        ],
    )

    result = await db.location_sessions.insert_one(
        location_session.model_dump(exclude_none=True)
    )
    location_session.id = str(result.inserted_id)

    logger.info(
        "Location session created: %s for location %s by %s",
        location_session.id,
        request.location_id,
        current_user["username"],
    )

    return location_session


@router.get("/", response_model=list[LocationSession])
async def list_location_sessions(
    master_session_id: Optional[str] = Query(None, description="Filter by master session"),
    status: Optional[str] = Query(None, description="Filter by status"),
    created_by: Optional[str] = Query(None, description="Filter by creator"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[LocationSession]:
    """List location sessions with optional filters."""
    query: dict[str, Any] = {}

    if master_session_id:
        query["master_session_id"] = master_session_id
    if status:
        query["status"] = status.upper()
    if created_by:
        query["created_by"] = created_by

    # Non-admin users can only see their own sessions
    if current_user.get("role") not in {"supervisor", "admin"}:
        query["created_by"] = current_user["username"]

    cursor = db.location_sessions.find(query).sort("created_at", -1).limit(100)
    sessions = await cursor.to_list(length=100)

    return [LocationSession(**s) for s in sessions]


@router.get("/{session_id}", response_model=LocationSession)
async def get_location_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("staff", "supervisor", "admin")),
) -> LocationSession:
    """Get a specific location session by ID."""
    session = await db.location_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Location session {session_id} not found")

    return LocationSession(**session)


@router.post("/{session_id}/claim", response_model=LocationSession)
async def claim_location_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> LocationSession:
    """Claim an available location session."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    session = await db.location_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Location session {session_id} not found")

    if session.get("status") != LocationSessionStatus.AVAILABLE.value:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot claim a session in {session.get('status')} state.",
        )

    # Enforce one active session per employee
    employee_active = await db.location_sessions.find_one(
        {
            "created_by": current_user["username"],
            "status": {"$in": ["ACTIVE", "CLAIMED", "PAUSED", "RECONCILE"]},
        }
    )
    if employee_active:
        raise HTTPException(
            status_code=409,
            detail="Employee already has an active location session.",
        )

    claim_version = (session.get("claim_version", 0) or 0) + 1

    await db.location_sessions.update_one(
        {"id": session_id},
        {
            "$set": {
                "status": LocationSessionStatus.CLAIMED.value,
                "claimed_by": current_user["username"],
                "claimed_at": now,
                "last_heartbeat": now,
                "claim_version": claim_version,
            },
            "$push": {
                "ownership_events": {
                    "event_type": "CLAIMED",
                    "actor": current_user["username"],
                    "actor_role": current_user.get("role", "staff"),
                    "timestamp": now,
                    "claim_version": claim_version,
                }
            },
        },
    )

    updated = await db.location_sessions.find_one({"id": session_id})
    return LocationSession(**updated) if updated else LocationSession(**session)


@router.post("/{session_id}/pause", response_model=LocationSession)
async def pause_location_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> LocationSession:
    """Pause an active location session. PAUSED is a real state."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    session = await db.location_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Location session {session_id} not found")

    canonical = session.get("status", "")
    if canonical not in {"ACTIVE", "CLAIMED"}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot pause a session in {canonical} state.",
        )

    if session.get("created_by") != current_user["username"] and current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Not your session to pause")

    claim_version = (session.get("claim_version", 0) or 0) + 1

    await db.location_sessions.update_one(
        {"id": session_id},
        {
            "$set": {
                "status": LocationSessionStatus.PAUSED.value,
                "last_heartbeat": now,
                "claim_version": claim_version,
                "paused_at": now,
                "paused_by": current_user["username"],
            },
            "$push": {
                "ownership_events": {
                    "event_type": "PAUSED",
                    "actor": current_user["username"],
                    "actor_role": current_user.get("role", "staff"),
                    "timestamp": now,
                    "claim_version": claim_version,
                }
            },
        },
    )

    updated = await db.location_sessions.find_one({"id": session_id})
    return LocationSession(**updated) if updated else LocationSession(**session)


@router.post("/{session_id}/release", response_model=LocationSession)
async def release_location_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> LocationSession:
    """Release an active location session, making it available for others."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    session = await db.location_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Location session {session_id} not found")

    canonical = session.get("status", "")
    if canonical not in {"ACTIVE", "CLAIMED", "PAUSED"}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot release a session in {canonical} state.",
        )

    if session.get("created_by") != current_user["username"] and current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Not your session to release")

    claim_version = (session.get("claim_version", 0) or 0) + 1

    await db.location_sessions.update_one(
        {"id": session_id},
        {
            "$set": {
                "status": LocationSessionStatus.RELEASED.value,
                "last_heartbeat": now,
                "claim_version": claim_version,
                "released_at": now,
                "released_by": current_user["username"],
                "release_reason": "manual",
            },
            "$push": {
                "ownership_events": {
                    "event_type": "RELEASED",
                    "actor": current_user["username"],
                    "actor_role": current_user.get("role", "staff"),
                    "timestamp": now,
                    "claim_version": claim_version,
                }
            },
        },
    )

    updated = await db.location_sessions.find_one({"id": session_id})
    return LocationSession(**updated) if updated else LocationSession(**session)


@router.post("/{session_id}/takeover", response_model=LocationSession)
async def takeover_location_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("supervisor", "admin")),
) -> LocationSession:
    """Takeover a stale location session. Supervisor/admin only."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    session = await db.location_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Location session {session_id} not found")

    canonical = session.get("status", "")
    if canonical != LocationSessionStatus.STALE.value:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot take over a session in {canonical} state. Only STALE sessions can be taken over.",
        )

    claim_version = (session.get("claim_version", 0) or 0) + 1

    await db.location_sessions.update_one(
        {"id": session_id},
        {
            "$set": {
                "created_by": current_user["username"],
                "created_by_name": current_user.get("full_name"),
                "status": LocationSessionStatus.CLAIMED.value,
                "last_heartbeat": now,
                "claim_version": claim_version,
                "claimed_at": now,
                "claimed_by": current_user["username"],
                "ownership_events": session.get("ownership_events", [])
                + [
                    {
                        "event_type": "TAKEN_OVER",
                        "actor": current_user["username"],
                        "actor_role": current_user.get("role", "admin"),
                        "timestamp": now,
                        "claim_version": claim_version,
                        "previous_owner": session.get("created_by"),
                    }
                ],
            },
        },
    )

    updated = await db.location_sessions.find_one({"id": session_id})
    return LocationSession(**updated) if updated else LocationSession(**session)
