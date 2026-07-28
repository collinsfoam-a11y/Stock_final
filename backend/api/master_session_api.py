"""Master Session API - Enterprise-level count programme management."""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.schemas import (
    LocationSessionStatus,
    MasterSession,
    MasterSessionCreate,
    MasterSessionStatus,
)
from backend.auth.dependencies import require_role
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/master-sessions", tags=["Master Sessions"])


@router.post("/", response_model=MasterSession)
async def create_master_session(
    request: MasterSessionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("staff", "supervisor", "admin")),
) -> MasterSession:
    """Create a new master session for a count programme."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    master_session = MasterSession(
        name=request.name,
        description=request.description,
        status=MasterSessionStatus.DRAFT,
        created_by=current_user["username"],
        created_by_name=current_user.get("full_name"),
        policy_version=request.policy_version,
        allow_zero_count=request.allow_zero_count,
        require_remark=request.require_remark,
        requires_supervisor_approval=request.requires_supervisor_approval,
        auto_approve_threshold=request.auto_approve_threshold,
        location_ids=request.location_ids,
        created_at=now,
    )

    result = await db.master_sessions.insert_one(master_session.model_dump(exclude_none=True))
    master_session.id = str(result.inserted_id)

    logger.info(
        "Master session created: %s by %s",
        master_session.name,
        current_user["username"],
    )

    return master_session


@router.get("/", response_model=list[MasterSession])
async def list_master_sessions(
    status: Optional[str] = Query(None, description="Filter by status"),
    created_by: Optional[str] = Query(None, description="Filter by creator"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("staff", "supervisor", "admin")),
) -> list[MasterSession]:
    """List master sessions with optional filters."""
    query: dict[str, Any] = {}

    if status:
        query["status"] = status.upper()
    if created_by:
        query["created_by"] = created_by

    if current_user.get("role") not in {"supervisor", "admin"}:
        query["created_by"] = current_user["username"]

    cursor = db.master_sessions.find(query).sort("created_at", -1).limit(100)
    sessions = await cursor.to_list(length=100)

    return [MasterSession(**s) for s in sessions]


@router.get("/{session_id}", response_model=MasterSession)
async def get_master_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("staff", "supervisor", "admin")),
) -> MasterSession:
    """Get a specific master session by ID."""
    session = await db.master_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Master session {session_id} not found")

    return MasterSession(**session)


@router.post("/{session_id}/activate", response_model=MasterSession)
async def activate_master_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("supervisor", "admin")),
) -> MasterSession:
    """Activate a master session, making locations available for staff."""
    session = await db.master_sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail=f"Master session {session_id} not found")

    if session.get("status") != MasterSessionStatus.DRAFT.value:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot activate a session in {session.get('status')} state.",
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.master_sessions.update_one(
        {"id": session_id},
        {
            "$set": {
                "status": MasterSessionStatus.ACTIVE.value,
                "started_at": now,
            }
        },
    )

    # Create location sessions for all locations in scope
    location_ids = session.get("location_ids", [])
    for location_id in location_ids:
        location = await db.locations.find_one({"id": location_id})
        if location:
            location_session = {
                "id": str(uuid.uuid4()),
                "master_session_id": session_id,
                "location_id": location_id,
                "location_name": location.get("name", ""),
                "location_level": location.get("level", "RACK"),
                "warehouse": location.get("warehouse"),
                "floor": location.get("floor"),
                "rack": location.get("rack"),
                "company": location.get("company"),
                "showroom": location.get("showroom"),
                "zone": location.get("zone"),
                "status": LocationSessionStatus.AVAILABLE.value,
                "created_by": current_user["username"],
                "created_by_name": current_user.get("full_name"),
                "created_at": now,
                "baseline_qty": session.get("baseline_qty"),
                "baseline_at": session.get("baseline_at"),
            }
            await db.location_sessions.insert_one(location_session)

    updated = await db.master_sessions.find_one({"id": session_id})
    return MasterSession(**updated) if updated else session
