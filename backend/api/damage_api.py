"""
Damage, Condition and Return API

Handles damage cases, return statuses, and condition management.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.schemas import (
    DamageCase,
    DamageCaseCreate,
    DamageCaseDecision,
)
from backend.auth.dependencies import auth_deps
from backend.auth.permissions import Permission, require_permission
from backend.services.governance_guard import GovernanceViolation

logger = __import__("logging").getLogger(__name__)
router = APIRouter(prefix="/api/damage", tags=["Damage"])


def get_db() -> AsyncIOMotorDatabase:
    if not auth_deps.db:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database not initialized",
        )
    return auth_deps.db


class DamageCaseListResponse(BaseModel):
    cases: list[dict[str, Any]]
    total: int


@router.get("/cases")
async def list_damage_cases(
    session_id: str | None = Query(None),
    item_code: str | None = Query(None),
    damage_type: str | None = Query(None),
    condition: str | None = Query(None),
    return_status: str | None = Query(None),
    limit: int = Query(100),
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_READ),
):
    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id
    if item_code:
        query["item_code"] = item_code
    if damage_type:
        query["damage_type"] = damage_type
    if condition:
        query["condition"] = condition
    if return_status:
        query["return_status"] = return_status

    cursor = db["damage_logs"].find(query).limit(limit)
    cases = await cursor.to_list(length=limit)
    return {"success": True, "data": {"cases": cases, "total": len(cases)}}


@router.get("/cases/{case_id}")
async def get_damage_case(
    case_id: str,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_READ),
):
    case = await db["damage_logs"].find_one({"id": case_id})
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {"code": "NOT_FOUND", "message": "Damage case not found"},
            },
        )
    case.pop("_id", None)
    return {"success": True, "data": case}


@router.post("/cases", status_code=status.HTTP_201_CREATED)
async def create_damage_case(
    payload: DamageCaseCreate,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_CREATE),
):
    case = DamageCase(
        session_id=payload.session_id,
        item_code=payload.item_code,
        item_name=payload.item_name,
        batch_id=payload.batch_id,
        serial_numbers=payload.serial_numbers,
        qty=payload.qty,
        damage_type=payload.damage_type,
        condition=payload.condition,
        reason=payload.reason,
        condition_details=payload.condition_details,
        photo_urls=payload.photo_urls or [],
        reported_by=current_user.get("username") or current_user.get("id"),
        observation_id=payload.observation_id,
        count_line_id=payload.count_line_id,
    )
    doc = case.model_dump()
    await db["damage_logs"].insert_one(doc)
    doc.pop("_id", None)
    return {"success": True, "data": doc}


@router.post("/cases/{case_id}/decide")
async def decide_damage_case(
    case_id: str,
    payload: DamageCaseDecision,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
):
    case = await db["damage_logs"].find_one({"id": case_id})
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {"code": "NOT_FOUND", "message": "Damage case not found"},
            },
        )
    if str(case.get("reported_by")) == (current_user.get("username") or current_user.get("id")):
        raise GovernanceViolation("STAFF_CANNOT_APPROVE_OWN_DAMAGE_CASE")

    update: dict[str, Any] = {
        "return_status": payload.return_status.value
        if payload.return_status
        else case.get("return_status"),
        "decided_by": current_user.get("username") or current_user.get("id"),
        "decided_at": __import__("datetime")
        .datetime.now(__import__("datetime").timezone.utc)
        .replace(tzinfo=None),
        "updated_at": __import__("datetime")
        .datetime.now(__import__("datetime").timezone.utc)
        .replace(tzinfo=None),
    }
    if payload.reason:
        update["reason"] = payload.reason
    if payload.repair_notes:
        update["repair_notes"] = payload.repair_notes
    await db["damage_logs"].update_one({"id": case_id}, {"$set": update})
    updated = await db["damage_logs"].find_one({"id": case_id})
    updated.pop("_id", None)
    return {"success": True, "data": updated}


@router.get("/session/{session_id}/summary")
async def session_damage_summary(
    session_id: str,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_READ),
):
    pipeline = [
        {"$match": {"session_id": session_id}},
        {
            "$group": {
                "_id": "$condition",
                "qty": {"$sum": "$qty"},
                "cases": {"$sum": 1},
            }
        },
    ]
    cursor = db["damage_logs"].aggregate(pipeline)
    summary = await cursor.to_list(length=100)
    total_qty = sum(float(row.get("qty") or 0) for row in summary)
    return {"success": True, "data": {"by_condition": summary, "total_qty": total_qty}}
