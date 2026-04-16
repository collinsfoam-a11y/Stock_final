"""
Item Verification API - Verification, filtering, CSV export, and variance tracking
"""

import asyncio
import csv
import io
import logging
import traceback
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user_async as get_current_user

logger = logging.getLogger(__name__)

# These will be initialized at runtime
db: AsyncIOMotorDatabase = cast(AsyncIOMotorDatabase, None)
cache_service: Any = None
sql_sync_service: Any = None


def init_verification_api(
    database: AsyncIOMotorDatabase, cache_svc: Any = None, sql_svc: Any = None
) -> None:
    """Initialize verification API with dependencies"""
    global db, cache_service, sql_sync_service
    db = database
    cache_service = cache_svc
    sql_sync_service = sql_svc


verification_router = APIRouter(prefix="/api/v2/erp/items", tags=["Item Verification"])


def _regex_filter(value: Optional[str]) -> Optional[dict[str, str]]:
    if not value:
        return None
    return {"$regex": value, "$options": "i"}


def build_item_filter_query(
    *,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    floor: Optional[str] = None,
    rack: Optional[str] = None,
    warehouse: Optional[str] = None,
    uom_code: Optional[str] = None,
    verified: Optional[bool] = None,
    search: Optional[str] = None,
) -> dict[str, Any]:
    """Create a MongoDB filter dict for ERP items."""
    filter_query: dict[str, Any] = {}

    category_filter = _regex_filter(category)
    if category_filter:
        filter_query["category"] = category_filter

    subcategory_filter = _regex_filter(subcategory)
    if subcategory_filter:
        filter_query["subcategory"] = subcategory_filter

    floor_filter = _regex_filter(floor)
    if floor_filter:
        filter_query["floor"] = floor_filter

    rack_filter = _regex_filter(rack)
    if rack_filter:
        filter_query["rack"] = rack_filter

    warehouse_filter = _regex_filter(warehouse)
    if warehouse_filter:
        filter_query["warehouse"] = warehouse_filter

    if uom_code:
        filter_query["uom_code"] = uom_code

    if verified is not None:
        filter_query["verified"] = verified

    if search:
        filter_query["$or"] = [
            {"item_name": {"$regex": search, "$options": "i"}},
            {"item_code": {"$regex": search, "$options": "i"}},
            {"barcode": {"$regex": search, "$options": "i"}},
        ]

    return filter_query


def serialize_mongo_datetime(value: Optional[datetime]) -> str:
    return value.isoformat() if isinstance(value, datetime) else ""


def _serialize_export_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _render_xlsx_bytes(fieldnames: list[str], rows: list[dict[str, Any]]) -> bytes:
    try:
        import openpyxl
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="Excel export not available. Install openpyxl package.",
        ) from exc

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    if sheet is None:
        sheet = workbook.create_sheet("Export")

    for column_index, field in enumerate(fieldnames, 1):
        sheet.cell(row=1, column=column_index, value=field)

    for row_index, row in enumerate(rows, 2):
        for column_index, field in enumerate(fieldnames, 1):
            sheet.cell(
                row=row_index,
                column=column_index,
                value=_serialize_export_value(row.get(field, "")),
            )

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


ITEM_EXPORT_FIELDNAMES = [
    "ID",
    "item_code",
    "item_name",
    "barcode",
    "stock_qty",
    "mrp",
    "category",
    "subcategory",
    "uom_code",
    "uom_name",
    "floor",
    "rack",
    "warehouse",
    "verified",
    "verified_by",
    "verified_at",
    "last_scanned_at",
    "verified_qty",
    "damaged_qty",
    "non_returnable_damaged_qty",
    "variance",
    "item_condition",
    "serial_number",
    "is_serialized",
    "session_id",
    "verification_notes",
]


VARIANCE_EXPORT_FIELDNAMES = [
    "ID",
    "item_code",
    "item_name",
    "system_qty",
    "verified_qty",
    "variance",
    "verified_by",
    "verified_at",
    "category",
    "subcategory",
    "floor",
    "rack",
    "warehouse",
    "session_id",
    "count_line_id",
]


def _build_erpnext_item_export_row(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID": "",
        "item_code": item.get("item_code", ""),
        "item_name": item.get("item_name", ""),
        "barcode": item.get("barcode", ""),
        "stock_qty": item.get("stock_qty", 0.0),
        "mrp": item.get("mrp", 0.0),
        "category": item.get("category", ""),
        "subcategory": item.get("subcategory", ""),
        "uom_code": item.get("uom_code", ""),
        "uom_name": item.get("uom_name", ""),
        "floor": item.get("floor", ""),
        "rack": item.get("rack", ""),
        "warehouse": item.get("warehouse", ""),
        "verified": "Yes" if item.get("verified", False) else "No",
        "verified_by": item.get("verified_by", ""),
        "verified_at": serialize_mongo_datetime(item.get("verified_at")),
        "last_scanned_at": serialize_mongo_datetime(item.get("last_scanned_at")),
        "verified_qty": item.get("verified_qty", 0.0),
        "damaged_qty": item.get("damaged_qty", 0.0),
        "non_returnable_damaged_qty": item.get("non_returnable_damaged_qty", 0.0),
        "variance": item.get("variance", 0.0),
        "item_condition": item.get("item_condition", ""),
        "serial_number": item.get("serial_number", ""),
        "is_serialized": "Yes" if item.get("is_serialized", False) else "No",
        "session_id": item.get("session_id", ""),
        "verification_notes": item.get("verification_notes", ""),
    }


def _build_erpnext_variance_export_row(variance: dict[str, Any]) -> dict[str, Any]:
    return {
        "ID": "",
        "item_code": variance.get("item_code", ""),
        "item_name": variance.get("item_name", ""),
        "system_qty": variance.get("system_qty", 0.0),
        "verified_qty": variance.get("verified_qty", 0.0),
        "variance": variance.get("variance", 0.0),
        "verified_by": variance.get("verified_by", ""),
        "verified_at": serialize_mongo_datetime(variance.get("verified_at")),
        "category": variance.get("category", ""),
        "subcategory": variance.get("subcategory", ""),
        "floor": variance.get("floor", ""),
        "rack": variance.get("rack", ""),
        "warehouse": variance.get("warehouse", ""),
        "session_id": variance.get("session_id", ""),
        "count_line_id": variance.get("count_line_id", ""),
    }


def serialize_item_document(item: dict[str, Any]) -> dict[str, Any]:
    """Return a JSON-serializable copy of an ERP item document."""
    serialized = dict(item)
    if "_id" in serialized:
        serialized["_id"] = str(serialized["_id"])

    for field in ("verified_at", "last_scanned_at"):
        if field in serialized:
            serialized[field] = serialize_mongo_datetime(serialized.get(field))

    return serialized


class VerificationRequest(BaseModel):
    verified: bool
    verified_qty: Optional[float] = None
    damaged_qty: Optional[float] = 0.0
    non_returnable_damaged_qty: Optional[float] = 0.0
    item_condition: Optional[str] = "Good"
    serial_number: Optional[str] = None
    is_serialized: Optional[bool] = None
    notes: Optional[str] = None
    floor: Optional[str] = None
    rack: Optional[str] = None
    session_id: Optional[str] = None
    count_line_id: Optional[str] = None


class ItemUpdateRequest(BaseModel):
    mrp: Optional[float] = None
    sales_price: Optional[float] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    uom: Optional[str] = None


@verification_router.patch("/{barcode}/update-master")
async def update_item_master(
    barcode: str,
    request: ItemUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Update item master details (MRP, Price, Category, etc.)
    """
    try:
        # Get current item by barcode
        item = await db.erp_items.find_one({"barcode": barcode})
        if not item:
            # Fallback to item_code for legacy support
            item = await db.erp_items.find_one({"item_code": barcode})
            if not item:
                raise HTTPException(
                    status_code=404, detail=f"Item with barcode/code {barcode} not found"
                )

        # Use the actual item_code and barcode for updates and logging
        actual_barcode = item.get("barcode")
        actual_item_code = item.get("item_code") or barcode

        update_filter: dict[str, Any]
        if actual_item_code:
            update_filter = {"item_code": actual_item_code}
        elif actual_barcode:
            update_filter = {"barcode": actual_barcode}
        else:
            update_filter = {"barcode": barcode}

        update_doc = {
            "$set": {
                "last_updated_by": current_user["username"],
                "last_updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        }

        if request.mrp is not None:
            update_doc["$set"]["mrp"] = request.mrp
        if request.sales_price is not None:
            update_doc["$set"]["sales_price"] = request.sales_price
        if request.category is not None:
            update_doc["$set"]["category"] = request.category
        if request.subcategory is not None:
            update_doc["$set"]["subcategory"] = request.subcategory
        if request.uom is not None:
            update_doc["$set"]["uom"] = request.uom

        await db.erp_items.update_one(update_filter, update_doc)

        # Invalidate cache for this item
        if cache_service:
            if actual_barcode:
                await cache_service.delete_async("items", f"enhanced_{actual_barcode}")
            if actual_item_code:
                await cache_service.delete_async("items", f"enhanced_{actual_item_code}")

        # Log the change
        await db.audit_logs.insert_one(
            {
                "action": "MASTER_UPDATE",
                "item_code": actual_item_code,
                "barcode": actual_barcode or barcode,
                "changes": request.model_dump(exclude_none=True),
                "user": current_user["username"],
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        return {"success": True, "message": "Item details updated successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating item master {barcode}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@verification_router.post("/{barcode}/refresh-sql-qty")
async def refresh_item_qty_from_sql(
    barcode: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Manually refresh item quantity from SQL Server.
    Updates MongoDB if there's a difference.
    """
    if not sql_sync_service:
        raise HTTPException(
            status_code=503,
            detail="SQL Sync Service not available (SQL Server might be disabled or offline)",
        )

    try:
        # Check if SQL is connected (wrapped to avoid blocking event loop)
        is_connected = await asyncio.to_thread(sql_sync_service.sql_connector.test_connection)
        if not is_connected:
            raise HTTPException(status_code=503, detail="SQL Server is currently unreachable")

        # Attempt to sync single item
        # Try finding by barcode first, as the param suggests
        updated_item = await sql_sync_service.sync_single_item_by_barcode(barcode)

        if not updated_item:
            # If not found by barcode, try as item_code (legacy support)
            # This requires looking up the item code first or trusting the caller
            # For now, we assume barcode is barcode.
            # If we want to support item_code, we might need a separate service method
            # or try to interpret the barcode.
            pass

        if not updated_item:
            raise HTTPException(
                status_code=404, detail=f"Item with barcode {barcode} not found in SQL Server"
            )

        updated_item["_id"] = str(updated_item["_id"])

        # Invalidate cache
        if cache_service:
            if updated_item.get("barcode"):
                await cache_service.delete_async("items", f"enhanced_{updated_item['barcode']}")
            if updated_item.get("item_code"):
                await cache_service.delete_async("items", f"enhanced_{updated_item['item_code']}")

        return {
            "success": True,
            "message": "Quantity refreshed from SQL Server",
            "item": serialize_item_document(updated_item),
        }

    except HTTPException:
        raise
    except Exception as e:
        error_details = traceback.format_exc()
        logger.error(f"Error refreshing SQL qty for {barcode}: {str(e)}\n{error_details}")
        raise HTTPException(status_code=500, detail=f"Refresh failed: {str(e)}")


def _calculate_variance(request: VerificationRequest, system_qty: float) -> Optional[float]:
    """Calculates the variance based on verified and damaged quantities."""
    if request.verified_qty is not None:
        total_assets = request.verified_qty + (request.damaged_qty or 0.0)
        return total_assets - system_qty
    return None


def _build_item_update_doc(
    request: VerificationRequest, current_user: dict, existing_item: dict
) -> dict[str, Any]:
    """Builds the update document for the erp_items collection."""
    update_fields = {
        "verified": request.verified,
        "verified_by": current_user["username"],
        "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "last_scanned_at": datetime.now(timezone.utc).replace(tzinfo=None),
    }

    if request.verified_qty is not None:
        update_fields["verified_qty"] = request.verified_qty
        update_fields["variance"] = _calculate_variance(
            request, existing_item.get("stock_qty", 0.0)
        )

    # Map request fields to update_fields, handling None values
    field_mapping = {
        "damaged_qty": "damaged_qty",
        "non_returnable_damaged_qty": "non_returnable_damaged_qty",
        "item_condition": "item_condition",
        "serial_number": "serial_number",
        "is_serialized": "is_serialized",
        "notes": "verification_notes",
        "session_id": "session_id",
    }

    for req_field, doc_field in field_mapping.items():
        req_value = getattr(request, req_field)
        if req_value is not None:  # Check for None explicitly, as 0.0 or False are valid
            update_fields[doc_field] = req_value

    # Special handling for serial_number to set is_serialized
    if request.serial_number:
        update_fields["is_serialized"] = True

    # Special handling for floor and rack
    if request.floor:
        update_fields["verified_floor"] = request.floor
        if existing_item.get("floor") in (None, ""):
            update_fields["floor"] = request.floor
    if request.rack:
        update_fields["verified_rack"] = request.rack
        if existing_item.get("rack") in (None, ""):
            update_fields["rack"] = request.rack

    return {"$set": update_fields}


def _build_verification_log_doc(
    request: VerificationRequest,
    current_user: dict,
    item: dict,
    variance: Optional[float],
    is_serialized_from_update: Optional[bool],
) -> dict[str, Any]:
    """Builds the document for verification_logs and item_variances collections."""
    return {
        "item_code": item.get("item_code", ""),
        "item_name": item.get("item_name", ""),
        "system_qty": item.get("stock_qty", 0.0),
        "verified_qty": request.verified_qty,
        "damaged_qty": request.damaged_qty,
        "non_returnable_damaged_qty": request.non_returnable_damaged_qty,
        "variance": variance,
        "verified_by": current_user["username"],
        "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
        "category": item.get("category", ""),
        "subcategory": item.get("subcategory", ""),
        "floor": request.floor or item.get("floor", ""),
        "rack": request.rack or item.get("rack", ""),
        "warehouse": item.get("warehouse", ""),
        "session_id": request.session_id,
        "count_line_id": request.count_line_id,
        "item_condition": request.item_condition,
        "serial_number": request.serial_number,
        "is_serialized": is_serialized_from_update,
    }


@verification_router.patch("/{barcode}/verify")
async def verify_item(
    barcode: str,
    request: VerificationRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Mark an item as verified/unverified with user tracking and timestamp
    """
    try:
        item = None

        # 1. Try to auto-refresh from SQL first (FR requirement)
        if sql_sync_service:
            try:
                if sql_sync_service.sql_connector.test_connection():
                    item = await sql_sync_service.sync_single_item_by_barcode(barcode)
            except Exception as e:
                logger.warning(f"Failed to auto-refresh item {barcode} from SQL: {e}")

        # 2. If no item from SQL (or offline), get from MongoDB
        if not item:
            # Get current item by barcode
            item = await db.erp_items.find_one({"barcode": barcode})
            if not item:
                # Fallback to item_code
                item = await db.erp_items.find_one({"item_code": barcode})
                if not item:
                    raise HTTPException(
                        status_code=404, detail=f"Item with barcode/code {barcode} not found"
                    )

        actual_barcode = item.get("barcode")
        actual_item_code = item.get("item_code") or barcode

        update_filter: dict[str, Any]
        if actual_item_code:
            update_filter = {"item_code": actual_item_code}
        elif actual_barcode:
            update_filter = {"barcode": actual_barcode}
        else:
            update_filter = {"barcode": barcode}

        # GOVERNANCE FIX: Optimistic Locking (Rule 3)
        # We MUST ensure stock_qty hasn't changed since we read it
        expected_stock_qty = item.get("stock_qty")
        if expected_stock_qty is not None:
            update_filter["stock_qty"] = expected_stock_qty

        # ... (Conflict Forking Logic remains here) ...
        # GOVERNANCE: Conflict Forking Engine
        # Check if item is already approved
        if item.get("verified") is True:
            # Check for material differences in the verification request
            existing_qty = item.get("verified_qty")
            # Calculate variance for new request
            # new_variance = _calculate_variance(request, item.get("stock_qty", 0.0))

            # Simple conflict check: if quantity differs or condition differs
            is_conflict = False
            if request.verified_qty is not None and request.verified_qty != existing_qty:
                is_conflict = True

            if is_conflict:
                from backend.core.schemas.conflict import ConflictFork

                # Create Fork
                fork = ConflictFork(
                    original_item_id=str(item.get("_id")),
                    session_id=request.session_id or "unknown",
                    user_id=current_user["username"],
                    conflicting_payload=request.model_dump(exclude_none=True),
                    reason=f"Attempted to overwrite APPROVED qty {existing_qty} with {request.verified_qty}",
                )

                await db.conflict_forks.insert_one(fork.model_dump())

                logger.warning(f"Conflict detected for {barcode}. Fork created: {fork.fork_id}")

                return {
                    "success": True,
                    "item": serialize_item_document(item),  # Return ORIGINAL item
                    "variance": item.get("variance"),
                    "message": f"Conflict detected! Original verification preserved. Fork ID: {fork.fork_id}",
                    "fork_id": fork.fork_id,
                }

        variance = _calculate_variance(request, item.get("stock_qty", 0.0))
        update_doc = _build_item_update_doc(request, current_user, item)

        result = await db.erp_items.update_one(update_filter, update_doc)

        if result.matched_count == 0:
            # Optimistic Lock Failure
            # We assume the item exists because we read it, so valid match_count=0 means predicates failed
            # i.e. stock_qty changed
            logger.warning(
                f"Optimistic Lock Failed for {barcode}. Expected qty: {expected_stock_qty}"
            )
            raise HTTPException(
                status_code=409,
                detail="Data changed during verification (Optimistic Lock). Please refresh and try again.",
            )

        # Invalidate cache for this item
        if cache_service:
            if actual_barcode:
                await cache_service.delete_async("items", f"enhanced_{actual_barcode}")
            if actual_item_code:
                await cache_service.delete_async("items", f"enhanced_{actual_item_code}")

        # Get the actual is_serialized value that was set in the update_doc
        is_serialized_from_update = update_doc["$set"].get("is_serialized")

        verification_log = _build_verification_log_doc(
            request, current_user, item, variance, is_serialized_from_update
        )

        await db.verification_logs.insert_one(verification_log)

        if variance is not None and variance != 0:
            await db.item_variances.insert_one(verification_log)

        updated_item = await db.erp_items.find_one(update_filter)
        if not updated_item and actual_barcode:
            updated_item = await db.erp_items.find_one({"barcode": actual_barcode})
        if not updated_item:
            raise HTTPException(status_code=500, detail="Verification updated item not found")

        updated_item["_id"] = str(updated_item["_id"])

        return {
            "success": True,
            "item": updated_item,
            "variance": variance,
            "message": (
                f"Item {actual_item_code} marked as {'verified' if request.verified else 'unverified'}"
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying item {barcode}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@verification_router.get("/filtered")
async def get_filtered_items(
    category: Optional[str] = Query(None, description="Filter by category"),
    subcategory: Optional[str] = Query(None, description="Filter by subcategory"),
    floor: Optional[str] = Query(None, description="Filter by floor"),
    rack: Optional[str] = Query(None, description="Filter by rack"),
    warehouse: Optional[str] = Query(None, description="Filter by warehouse"),
    uom_code: Optional[str] = Query(None, description="Filter by UOM code"),
    verified: Optional[bool] = Query(None, description="Filter by verification status"),
    search: Optional[str] = Query(None, description="Search in item name/code"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    skip: int = Query(0, ge=0, description="Skip results"),
    current_user: dict = Depends(get_current_user),
):
    """
    Get filtered list of items with various filter options
    """
    try:
        filter_query = build_item_filter_query(
            category=category,
            subcategory=subcategory,
            floor=floor,
            rack=rack,
            warehouse=warehouse,
            uom_code=uom_code,
            verified=verified,
            search=search,
        )

        verified_filter = deepcopy(filter_query)
        verified_filter["verified"] = True

        items_task = (
            db.erp_items.find(filter_query, {"_id": 0})  # Added projection to exclude _id
            .skip(skip)
            .limit(limit)
            .to_list(length=limit)
        )
        total_count_task = db.erp_items.count_documents(filter_query)
        verified_count_task = db.erp_items.count_documents(verified_filter)

        items, total_count, verified_count = await asyncio.gather(
            items_task, total_count_task, verified_count_task
        )

        items = [serialize_item_document(item) for item in items]
        total_qty = sum(item.get("stock_qty", 0.0) for item in items)

        return {
            "success": True,
            "items": items,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "skip": skip,
                "returned": len(items),
            },
            "statistics": {
                "total_items": total_count,
                "verified_items": verified_count,
                "unverified_items": total_count - verified_count,
                "total_qty": total_qty,
            },
        }

    except Exception as e:
        logger.error(f"Error getting filtered items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get items: {str(e)}")


@verification_router.get("/sync")
async def sync_items_for_offline_cache(
    since: Optional[datetime] = Query(
        None, description="Return items updated after this timestamp (ISO 8601)"
    ),
    limit: int = Query(5000, ge=1, le=20000, description="Maximum items to return"),
    current_user: dict = Depends(get_current_user),
):
    """
    Incremental item sync for offline caching.

    Used by the mobile app to keep its local SQLite item table fresh for offline search.
    """
    try:
        query: dict[str, Any] = {"barcode": {"$exists": True, "$ne": ""}}

        if since:
            # Items can be updated via verification, scanning, or master updates.
            query["$or"] = [
                {"last_scanned_at": {"$gt": since}},
                {"verified_at": {"$gt": since}},
                {"last_updated_at": {"$gt": since}},
            ]

        projection = {
            "_id": 0,
            "barcode": 1,
            "item_code": 1,
            "item_name": 1,
            "category": 1,
            "verified": 1,
            "verified_at": 1,
            "last_scanned_at": 1,
        }

        cursor = db.erp_items.find(query, projection).sort("last_scanned_at", -1).limit(limit)
        items = await cursor.to_list(length=limit)
        items = [serialize_item_document(item) for item in items]

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        return {
            "success": True,
            "items": items,
            "count": len(items),
            "since": serialize_mongo_datetime(since) if since else None,
            "server_time": now.isoformat(),
        }

    except Exception as e:
        logger.error(f"Error syncing items: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to sync items: {str(e)}")


@verification_router.get("/export/csv")
async def export_items_csv(
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    rack: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    verified: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
    current_user: dict = Depends(get_current_user),
):
    """
    Export filtered items to ERPNext-compatible CSV
    """
    try:
        filter_query = build_item_filter_query(
            category=category,
            subcategory=subcategory,
            floor=floor,
            rack=rack,
            warehouse=warehouse,
            verified=verified,
            search=search,
        )

        async def generate_csv_rows():
            output = io.StringIO()
            writer = csv.DictWriter(
                output, fieldnames=ITEM_EXPORT_FIELDNAMES, extrasaction="ignore"
            )
            writer.writeheader()
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            cursor = db.erp_items.find(filter_query).limit(max_rows)

            count = 0
            async for item in cursor:
                if count >= max_rows:
                    break
                row = _build_erpnext_item_export_row(item)
                writer.writerow(row)
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)
                count += 1

        filename = (
            f"items_erpnext_import_"
            f"{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')}.csv"
        )

        return StreamingResponse(
            generate_csv_rows(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except Exception as e:
        logger.error(f"Error exporting items to CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"CSV export failed: {str(e)}")


@verification_router.get("/export/xlsx")
async def export_items_xlsx(
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    rack: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    verified: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
    current_user: dict = Depends(get_current_user),
):
    """Export filtered items to ERPNext-compatible Excel."""
    try:
        filter_query = build_item_filter_query(
            category=category,
            subcategory=subcategory,
            floor=floor,
            rack=rack,
            warehouse=warehouse,
            verified=verified,
            search=search,
        )

        items = await db.erp_items.find(filter_query).limit(max_rows).to_list(length=max_rows)
        rows = [_build_erpnext_item_export_row(item) for item in items]
        content = _render_xlsx_bytes(ITEM_EXPORT_FIELDNAMES, rows)
        filename = (
            f"items_erpnext_import_"
            f"{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')}.xlsx"
        )

        return StreamingResponse(
            iter([content]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting items to XLSX: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Excel export failed: {str(e)}")


@verification_router.get("/variances")
async def get_variances(
    category: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    rack: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """
    Get list of items with variances (verified qty != system qty)
    """
    try:
        filter_query: dict[str, Any] = {}

        if category:
            filter_query["category"] = {"$regex": category, "$options": "i"}

        if floor:
            filter_query["floor"] = {"$regex": floor, "$options": "i"}

        if rack:
            filter_query["rack"] = {"$regex": rack, "$options": "i"}

        if warehouse:
            filter_query["warehouse"] = {"$regex": warehouse, "$options": "i"}

        # Only get variances (non-zero)
        filter_query["variance"] = {"$ne": 0}
        # Optionally, filter for only approved/active count lines if required by logic
        # filter_query["status"] = {"$in": ["approved", "pending"]}

        # Get total count
        total_count = await db.count_lines.count_documents(filter_query)

        # Get variances
        cursor = db.count_lines.find(filter_query).sort("counted_at", -1).skip(skip).limit(limit)
        variances = await cursor.to_list(length=limit)

        # Convert ObjectId to string
        for variance in variances:
            variance["_id"] = str(variance["_id"])
            if "counted_at" in variance and isinstance(variance.get("counted_at"), datetime):
                variance["counted_at"] = variance["counted_at"].isoformat()
            # Compatibility map: frontend expects verified_at
            if "verified_at" in variance and isinstance(variance.get("verified_at"), datetime):
                variance["verified_at"] = variance["verified_at"].isoformat()
            elif "counted_at" in variance:
                variance["verified_at"] = variance["counted_at"]

        return {
            "success": True,
            "variances": variances,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "skip": skip,
                "returned": len(variances),
            },
        }

    except Exception as e:
        logger.error(f"Error getting variances: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get variances: {str(e)}")


async def _fetch_variance_export_rows(
    *,
    category: Optional[str],
    floor: Optional[str],
    rack: Optional[str],
    warehouse: Optional[str],
    max_rows: int,
) -> list[dict[str, Any]]:
    filter_query: dict[str, Any] = {"variance": {"$ne": 0}}

    if category:
        filter_query["category"] = {"$regex": category, "$options": "i"}
    if floor:
        filter_query["floor"] = {"$regex": floor, "$options": "i"}
    if rack:
        filter_query["rack"] = {"$regex": rack, "$options": "i"}
    if warehouse:
        filter_query["warehouse"] = {"$regex": warehouse, "$options": "i"}

    variances = await (
        db.item_variances.find(filter_query)
        .sort("verified_at", -1)
        .limit(max_rows)
        .to_list(length=max_rows)
    )
    return [_build_erpnext_variance_export_row(variance) for variance in variances]


@verification_router.get("/variances/export/csv")
async def export_variances_csv(
    category: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    rack: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
    current_user: dict = Depends(get_current_user),
):
    """Export variances to ERPNext-compatible CSV."""
    try:
        rows = await _fetch_variance_export_rows(
            category=category,
            floor=floor,
            rack=rack,
            warehouse=warehouse,
            max_rows=max_rows,
        )

        output = io.StringIO()
        writer = csv.DictWriter(
            output, fieldnames=VARIANCE_EXPORT_FIELDNAMES, extrasaction="ignore"
        )
        writer.writeheader()
        writer.writerows(rows)

        filename = (
            f"variances_erpnext_import_"
            f"{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')}.csv"
        )
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        logger.error(f"Error exporting variances to CSV: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Variance CSV export failed: {str(e)}")


@verification_router.get("/variances/export/xlsx")
async def export_variances_xlsx(
    category: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    rack: Optional[str] = Query(None),
    warehouse: Optional[str] = Query(None),
    max_rows: int = Query(10000, ge=1, le=100000, description="Maximum rows to export"),
    current_user: dict = Depends(get_current_user),
):
    """Export variances to ERPNext-compatible Excel."""
    try:
        rows = await _fetch_variance_export_rows(
            category=category,
            floor=floor,
            rack=rack,
            warehouse=warehouse,
            max_rows=max_rows,
        )
        content = _render_xlsx_bytes(VARIANCE_EXPORT_FIELDNAMES, rows)
        filename = (
            f"variances_erpnext_import_"
            f"{datetime.now(timezone.utc).replace(tzinfo=None).strftime('%Y%m%d_%H%M%S')}.xlsx"
        )
        return StreamingResponse(
            iter([content]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting variances to XLSX: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Variance Excel export failed: {str(e)}")


@verification_router.get("/live/users")
async def get_live_users(current_user: dict = Depends(get_current_user)):
    """
    Get list of currently active users (users who have verified items in last hour)
    """
    try:
        one_hour_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)

        # Get distinct users who verified items in last hour
        pipeline: list[dict[str, Any]] = [
            {
                "$match": {
                    "verified_at": {"$gte": one_hour_ago},
                    "verified_by": {"$exists": True, "$ne": None},
                }
            },
            {
                "$group": {
                    "_id": "$verified_by",
                    "last_activity": {"$max": "$verified_at"},
                    "items_verified": {"$sum": 1},
                }
            },
            {"$sort": {"last_activity": -1}},
        ]

        cursor = db.erp_items.aggregate(pipeline)
        users = await cursor.to_list(length=None)

        result = [
            {
                "username": user["_id"],
                "last_activity": (
                    user["last_activity"].isoformat()
                    if isinstance(user["last_activity"], datetime)
                    else user["last_activity"]
                ),
                "items_verified": user["items_verified"],
            }
            for user in users
        ]

        return {"success": True, "users": result, "count": len(result)}

    except Exception as e:
        logger.error(f"Error getting live users: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get live users: {str(e)}")


@verification_router.get("/live/verifications")
async def get_live_verifications(
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """
    Get live feed of recent item verifications
    """
    try:
        # Get recent verifications
        cursor = (
            db.erp_items.find(
                {
                    "verified": True,
                    "verified_at": {"$exists": True},
                }
            )
            .sort("verified_at", -1)
            .limit(limit)
        )

        verifications = await cursor.to_list(length=limit)

        result = []
        for item in verifications:
            result.append(
                {
                    "item_code": item.get("item_code", ""),
                    "item_name": item.get("item_name", ""),
                    "verified_by": item.get("verified_by", ""),
                    "verified_at": (
                        item.get("verified_at").isoformat() if item.get("verified_at") else None
                    ),
                    "floor": item.get("floor", ""),
                    "rack": item.get("rack", ""),
                    "category": item.get("category", ""),
                    "variance": item.get("variance", 0.0),
                }
            )

        return {"success": True, "verifications": result, "count": len(result)}

    except Exception as e:
        logger.error(f"Error getting live verifications: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get live verifications: {str(e)}")
