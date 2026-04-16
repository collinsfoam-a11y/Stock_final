"""
Unknown Items API - Management of items scanned but not found in ERP/Cache
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/unknown-items", tags=["Unknown Items Management"])
public_router = APIRouter(prefix="/unknown-items", tags=["Unknown Items"])


class UnknownItemReportRequest(BaseModel):
    """Report an unknown barcode/item encountered during counting.

    Keep this schema flexible: clients may attach extra metadata which we persist.
    """

    model_config = ConfigDict(extra="allow")

    session_id: Optional[str] = None
    barcode: Optional[str] = None
    counted_qty: Optional[float] = None
    floor_no: Optional[str] = None
    rack_no: Optional[str] = None
    notes: Optional[str] = None


class MapUnknownItemRequest(BaseModel):
    item_code: str
    resolve_notes: Optional[str] = None


class CreateSKUFromUnknownRequest(BaseModel):
    item_code: str
    item_name: str
    category: str
    subcategory: Optional[str] = None
    mrp: float
    uom_code: str
    resolve_notes: Optional[str] = None


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
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    item_data: dict[str, Any] = request.model_dump(exclude_none=True)
    # Prevent clients from spoofing audit fields.
    item_data.pop("reported_by", None)
    item_data.pop("reported_at", None)
    item_data.pop("synced_at", None)

    item_data.setdefault("id", str(uuid.uuid4()))
    item_data.setdefault("counted_qty", 1.0)
    item_data["reported_by"] = current_user.get("username")
    item_data["reported_at"] = now
    item_data["synced_at"] = now

    await db.unknown_items.insert_one(item_data)

    return {"success": True, "data": {"id": item_data["id"]}}


@router.get("")
async def list_unknown_items(
    session_id: Optional[str] = None,
    reported_by: Optional[str] = None,
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
    # 1. Find the unknown item report
    unknown = await db.unknown_items.find_one({"$or": [{"id": item_id}, {"_id": item_id}]})
    if not unknown:
        # Try raw item_id if it's barcode
        unknown = await db.unknown_items.find_one({"barcode": item_id})
        if not unknown:
            raise HTTPException(status_code=404, detail="Unknown item report not found")

    # 2. Verify target item exists
    target = await db.erp_items.find_one({"item_code": request.item_code})
    if not target:
        raise HTTPException(
            status_code=404, detail=f"Target SKU {request.item_code} not found in ERP"
        )

    # 3. Create a count line for the target item based on the unknown report
    new_count_line = {
        "session_id": unknown["session_id"],
        "item_code": target["item_code"],
        "barcode": target.get("barcode") or unknown.get("barcode"),
        "counted_qty": unknown["counted_qty"],
        "counted_by": unknown["reported_by"],
        "counted_at": unknown["reported_at"],
        "synced_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "is_mapped_from_unknown": True,
        "mapping_notes": request.resolve_notes,
        "mapped_by": current_user["username"],
    }

    await db.count_lines.insert_one(new_count_line)

    # 4. Remove the unknown item report or mark as resolved
    # For now, we move it to resolved_unknown_items
    await db.resolved_unknown_items.insert_one(
        {
            **unknown,
            "resolved_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "resolved_by": current_user["username"],
            "resolution": "MAPPED",
            "target_item_code": request.item_code,
            "notes": request.resolve_notes,
        }
    )

    await db.unknown_items.delete_one({"_id": unknown["_id"]})

    return {"success": True, "message": f"Successfully mapped to {request.item_code}"}


@router.post("/{item_id}/create-sku")
async def create_sku_from_unknown(
    item_id: str,
    request: CreateSKUFromUnknownRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """Create a new Master SKU from an unknown item report"""
    unknown = await db.unknown_items.find_one({"$or": [{"id": item_id}, {"_id": item_id}]})
    if not unknown:
        raise HTTPException(status_code=404, detail="Unknown item report not found")

    # Check if SKU already exists
    existing = await db.erp_items.find_one({"item_code": request.item_code})
    if existing:
        raise HTTPException(status_code=400, detail="Item code already exists")

    new_item = {
        "item_code": request.item_code,
        "item_name": request.item_name,
        "barcode": unknown.get("barcode") or "",
        "category": request.category,
        "subcategory": request.subcategory,
        "mrp": request.mrp,
        "uom_code": request.uom_code,
        "stock_qty": 0.0,  # Initial system qty is 0 for newly created items
        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "created_by": current_user["username"],
        "is_manually_created": True,
    }

    await db.erp_items.insert_one(new_item)

    # Also resolve the unknown report by mapping it to the new SKU
    await map_unknown_to_sku(
        item_id=item_id,
        request=MapUnknownItemRequest(
            item_code=request.item_code, resolve_notes=request.resolve_notes
        ),
        db=db,
        current_user=current_user,
    )

    return {"success": True, "message": f"Created new SKU {request.item_code} and mapped report"}


@router.delete("/{item_id}")
async def delete_unknown_item(
    item_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(_require_admin),
):
    """Dismiss an unknown item report"""
    result = await db.unknown_items.delete_one({"$or": [{"id": item_id}, {"_id": item_id}]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Unknown item report not found")

    return {"success": True, "message": "Report dismissed"}
