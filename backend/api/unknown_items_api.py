"""
Unknown Items API - Management of items scanned but not found in ERP/Cache
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
from backend.services.unknown_item_service import UnknownItemService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/unknown-items", tags=["Unknown Items Management"])
public_router = APIRouter(prefix="/unknown-items", tags=["Unknown Items"])


class UnknownItemReportRequest(BaseModel):
    """Report an unknown barcode/item encountered during counting.

    Keep this schema flexible: clients may attach extra metadata which we persist.
    """

    model_config = ConfigDict(extra="allow")

    session_id: str
    location_id: str
    floor_id: str
    rack_id: str
    barcode: str | None = None
    counted_qty: float | None = None
    floor_no: str | None = None
    rack_no: str | None = None
    notes: str | None = None


class MapUnknownItemRequest(BaseModel):
    item_code: str
    resolve_notes: str | None = None


class CreateSKUFromUnknownRequest(BaseModel):
    item_code: str
    item_name: str
    category: str
    subcategory: str | None = None
    mrp: float
    uom_code: str
    resolve_notes: str | None = None


def _require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@public_router.post("")
async def report_unknown_item(
    request: UnknownItemReportRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create an unknown item report (staff/supervisor/admin)."""
    item_data: dict[str, Any] = request.model_dump(exclude_none=True)
    # Prevent clients from spoofing audit fields.
    item_data.pop("reported_by", None)
    item_data.pop("reported_at", None)
    item_data.pop("synced_at", None)
    service = UnknownItemService(db)
    created = await service.register_unknown_item(
        payload=item_data,
        actor_id=str(current_user.get("username") or "system"),
    )
    return {"success": True, "data": {"id": created["id"]}}


@router.get("")
async def list_unknown_items(
    session_id: str | None = None,
    reported_by: str | None = None,
    include_dismissed: bool = False,
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """List all reported unknown items"""
    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id
    if reported_by:
        query["reported_by"] = reported_by
    if not include_dismissed:
        query["status"] = {"$ne": "DISMISSED"}

    cursor = db.unknown_items.find(query).sort("reported_at", -1).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)

    # Simple conversion of ObjectId to string if any (though schemas.py uses UUID strings)
    for item in items:
        if "_id" in item:
            item["_id"] = str(item["_id"])

    total = await db.unknown_items.count_documents(query)

    return {
        "success": True,
        "data": items,
        "pagination": {"total": total, "limit": limit, "skip": skip},
    }


@router.post("/{item_id}/map")
async def map_unknown_to_sku(
    item_id: str,
    request: MapUnknownItemRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """Map an unknown item report to an existing SKU in ERP"""
    service = UnknownItemService(db)
    result = await service.resolve_to_known_item(
        item_id=item_id,
        item_code=request.item_code,
        actor_id=str(current_user.get("username") or "system"),
        resolve_notes=request.resolve_notes,
    )
    return {
        "success": True,
        "message": f"Successfully mapped to {request.item_code}",
        "data": result,
    }


@router.post("/{item_id}/create-sku")
async def create_sku_from_unknown(
    item_id: str,
    request: CreateSKUFromUnknownRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """Create a new Master SKU from an unknown item report"""
    service = UnknownItemService(db)
    result = await service.create_manual_sku_and_resolve(
        item_id=item_id,
        item_code=request.item_code,
        item_name=request.item_name,
        category=request.category,
        subcategory=request.subcategory,
        mrp=request.mrp,
        uom_code=request.uom_code,
        actor_id=str(current_user.get("username") or "system"),
        resolve_notes=request.resolve_notes,
    )
    return {
        "success": True,
        "message": f"Created new SKU {request.item_code} and mapped report",
        "data": result,
    }


@router.delete("/{item_id}")
async def delete_unknown_item(
    item_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """Dismiss an unknown item report"""
    service = UnknownItemService(db)
    dismissed = await service.dismiss_unknown_item(
        item_id=item_id,
        actor_id=str(current_user.get("username") or "system"),
    )
    return {
        "success": True,
        "message": "Unknown item report dismissed",
        "data": {
            "id": dismissed.get("id") or item_id,
            "status": dismissed.get("status") or "DISMISSED",
        },
    }
