from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.auth.dependencies import require_role
from backend.db.runtime import get_db
from backend.services.canonical_inventory import build_session_lookup
from backend.services.enterprise_audit import AuditEventType
from backend.services.movement_service import MovementService
from backend.utils.api_utils import sanitize_for_logging
from backend.utils.enterprise_audit_logger import log_enterprise_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/movements", tags=["Movements"])


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _get_db() -> AsyncIOMotorDatabase:
    return get_db()


def _user_can_view_session(session: dict[str, Any], current_user: dict[str, Any]) -> bool:
    role = str(current_user.get("role") or "").strip().lower()
    if role in {"admin", "supervisor"}:
        return True

    username = str(current_user.get("username") or "").strip()
    if not username:
        return False
    session_owner = str(session.get("staff_user") or session.get("user_id") or "").strip()
    return bool(session_owner) and session_owner == username


class ManualMovementRequest(BaseModel):
    session_id: Optional[str] = None
    warehouse: str = Field(..., min_length=1)
    item_code: str = Field(..., min_length=1)
    movement_type: str = Field(..., min_length=1)
    quantity: float
    occurred_at: Optional[datetime] = None
    reason_code: str = Field(..., min_length=1)
    reason: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class ErpMovementItem(BaseModel):
    id: Optional[str] = None
    warehouse: str = Field(..., min_length=1)
    item_code: str = Field(..., min_length=1)
    movement_type: str = Field(..., min_length=1)
    quantity: float
    occurred_at: datetime
    external_ref: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class ErpMovementIngestRequest(BaseModel):
    source_system: str = Field(..., min_length=1)
    movements: list[ErpMovementItem]


@router.post("/manual")
async def create_manual_movement(
    http_request: Request,
    payload: ManualMovementRequest,
    current_user: dict = Depends(require_role("admin", "supervisor")),
):
    db = _get_db()
    service = MovementService(db)

    try:
        movement_doc = await service.create_manual_movement(
            session_id=payload.session_id,
            warehouse=payload.warehouse,
            item_code=payload.item_code,
            movement_type=payload.movement_type,
            quantity=payload.quantity,
            occurred_at=payload.occurred_at,
            reason_code=payload.reason_code,
            reason=payload.reason,
            actor_username=str(current_user.get("username") or "").strip(),
            device_id=http_request.headers.get("x-device-id"),
            metadata=payload.metadata,
        )
        await log_enterprise_audit(
            http_request,
            event_type=AuditEventType.DATA_CREATE,
            action="inventory_movements.create_manual",
            current_user=current_user,
            resource_type="inventory_movement",
            resource_id=str(movement_doc.get("id") or ""),
            details={
                "source": movement_doc.get("source"),
                "warehouse": movement_doc.get("warehouse"),
                "item_code": movement_doc.get("item_code"),
                "movement_type": movement_doc.get("movement_type"),
                "quantity": movement_doc.get("quantity"),
                "occurred_at": (
                    movement_doc.get("occurred_at").isoformat()
                    if isinstance(movement_doc.get("occurred_at"), datetime)
                    else None
                ),
                "reason_code": movement_doc.get("reason_code"),
                "session_id": movement_doc.get("session_id"),
            },
            session_id=movement_doc.get("session_id"),
        )
        return {"success": True, "movement": movement_doc}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Error creating manual movement: %s",
            _safe_log_value(exc, max_length=200),
        )
        raise HTTPException(status_code=500, detail="Failed to create movement")


@router.post("/erp-ingest")
async def ingest_erp_movements(
    http_request: Request,
    payload: ErpMovementIngestRequest,
    current_user: dict = Depends(require_role("admin")),
):
    db = _get_db()
    service = MovementService(db)
    try:
        result = await service.ingest_erp_movements(
            movements=[movement.model_dump() for movement in payload.movements],
            source_system=payload.source_system,
            ingested_by=str(current_user.get("username") or "").strip(),
        )
        await log_enterprise_audit(
            http_request,
            event_type=AuditEventType.DATA_IMPORT,
            action="inventory_movements.ingest_erp",
            current_user=current_user,
            resource_type="inventory_movement_batch",
            resource_id=str(payload.source_system),
            details={"source_system": payload.source_system, **result},
        )
        return {"success": True, **result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Error ingesting ERP movements for %s: %s",
            _safe_log_value(payload.source_system),
            _safe_log_value(exc, max_length=200),
        )
        raise HTTPException(status_code=500, detail="Failed to ingest movements")


@router.get("/session/{session_id}")
async def list_session_movements(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = _get_db()
    session = await db.sessions.find_one(build_session_lookup(session_id))
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not _user_can_view_session(session, current_user):
        raise HTTPException(status_code=403, detail="Not authorized to view this session")

    warehouse = str(session.get("warehouse") or "").strip()
    if not warehouse:
        raise HTTPException(status_code=409, detail="Session warehouse is missing")

    started_at = session.get("started_at")
    end_at = session.get("finalized_at") or session.get("closed_at") or session.get("completed_at")
    if not isinstance(started_at, datetime):
        raise HTTPException(status_code=409, detail="Session started_at is missing")
    if end_at is not None and not isinstance(end_at, datetime):
        raise HTTPException(status_code=409, detail="Session end timestamp invalid")

    match: dict[str, Any] = {"warehouse": warehouse, "occurred_at": {"$gte": started_at}}
    if end_at is not None:
        match["occurred_at"]["$lte"] = end_at

    movements = (
        await db.inventory_movements.find(match, {"_id": 0})
        .sort("occurred_at", 1)
        .to_list(length=5000)
    )
    return {"success": True, "session_id": session_id, "warehouse": warehouse, "items": movements}
