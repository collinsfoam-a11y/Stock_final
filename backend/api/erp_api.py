import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.api.schemas import ERPItem
from backend.auth.dependencies import get_current_user
from backend.error_messages import get_error_message
from backend.services.cache_service import CacheService

logger = logging.getLogger(__name__)
router = APIRouter()

_db: Optional[AsyncIOMotorDatabase[Any]] = None
_cache_service: Optional[CacheService] = None


def init_erp_api(
    db: AsyncIOMotorDatabase,
    cache_service: CacheService,
):
    global _db, _cache_service
    _db = db
    _cache_service = cache_service


_ALPHANUMERIC_PATTERN = re.compile(r"^[A-Z0-9_\-]+$")


def _normalize_barcode_input(
    barcode: str, *, allow_alphanumeric: bool = True, strict_numeric: bool = True
) -> str:
    """Normalize and validate barcode or item code input.

    Rules derived from tests and existing usage:
    - Empty values are rejected with 400.
    - Numeric barcodes must be exactly 6 digits and start with 51, 52 or 53
      (when strict_numeric is True).
    - When ``allow_alphanumeric`` is True, non-numeric item codes such as
      "TEST001" are allowed for endpoints like refresh-stock.
    """

    logger.info(
        f"Normalizing barcode: {barcode}, allow_alphanumeric={allow_alphanumeric}, strict_numeric={strict_numeric}"
    )
    if not barcode or not barcode.strip():
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Barcode cannot be empty",
                "error_code": "INVALID_BARCODE_EMPTY",
            },
        )

    normalized = barcode.strip().upper()

    # Strict rules for numeric barcodes used in public barcode endpoints
    if strict_numeric and normalized.isdigit():
        if len(normalized) != 6:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Numeric barcode must be exactly 6 digits",
                    "barcode": normalized,
                    "error_code": "INVALID_BARCODE_LENGTH",
                },
            )

        if normalized[:2] not in {"51", "52", "53"}:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid barcode prefix. Allowed prefixes are 51, 52, 53.",
                    "barcode": normalized,
                    "error_code": "INVALID_BARCODE_PREFIX",
                },
            )

        return normalized

    # For barcode endpoints we do not allow non-numeric values
    if not allow_alphanumeric and not normalized.isdigit():
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Barcode must be numeric for this endpoint",
                "barcode": normalized,
                "error_code": "INVALID_BARCODE_FORMAT",
            },
        )

    # Alphanumeric validation for item_code-style inputs (e.g. refresh-stock)
    if _ALPHANUMERIC_PATTERN.fullmatch(normalized):
        if len(normalized) < 2:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Item code must be at least 2 characters",
                    "barcode": normalized,
                    "error_code": "INVALID_ITEM_CODE_LENGTH",
                },
            )
        if len(normalized) > 50:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Item code is too long (max 50 characters)",
                    "barcode": normalized,
                    "error_code": "INVALID_ITEM_CODE_LENGTH",
                },
            )
        return normalized

    raise HTTPException(
        status_code=400,
        detail={
            "message": "Invalid barcode format. Use letters, numbers, hyphens, or underscores.",
            "barcode": normalized,
            "error_code": "INVALID_BARCODE_FORMAT",
        },
    )


@router.get("/erp/items/barcode/{barcode}", response_model=ERPItem)
async def get_item_by_barcode(barcode: str, current_user: dict = Depends(get_current_user)):
    """
    Get item details by barcode from MongoDB.
    """
    if _db is None or _cache_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # For barcode lookups, we only accept numeric barcodes with valid prefixes
    normalized_barcode = _normalize_barcode_input(
        barcode, allow_alphanumeric=False, strict_numeric=True
    )

    # Check cache first
    cached_item = await _cache_service.get("items", normalized_barcode)
    if cached_item:
        logger.debug(f"Item found in cache: {barcode}")
        return ERPItem(**cached_item)

    # Fallback to MongoDB
    regex_match = {"$regex": f"^{re.escape(normalized_barcode)}$", "$options": "i"}
    item = await _db.erp_items.find_one(
        {
            "$or": [
                {"barcode": normalized_barcode},
                {"autobarcode": normalized_barcode},
                {"manual_barcode": normalized_barcode},
                {"item_code": normalized_barcode},
                {"item_code": regex_match},
            ]
        }
    )
    if not item:
        error = get_error_message("DB_ITEM_NOT_FOUND", {"barcode": barcode})
        logger.warning(f"Item not found in MongoDB: barcode={normalized_barcode}")
        raise HTTPException(
            status_code=error["status_code"],
            detail={
                "message": error["message"],
                "detail": f"{error['detail']} Barcode: {normalized_barcode}.",
                "code": error["code"],
                "category": error["category"],
                "barcode": normalized_barcode,
                "source": "mongodb",
            },
        )

    # Cache for 1 hour
    await _cache_service.set("items", normalized_barcode, item, ttl=3600)
    logger.debug(f"Item fetched from MongoDB: barcode={normalized_barcode}")

    return ERPItem(**item)


@router.post("/erp/items/{item_code}/refresh-stock")
async def refresh_item_stock(
    request: Request, item_code: str, current_user: dict = Depends(get_current_user)
):
    """
    Refresh item stock from ERP and update MongoDB
    (Now just returns the data from MongoDB as ERP is disabled)
    """
    if _db is None or _cache_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # For refresh-stock we accept both numeric barcodes and item codes
    # We disable strict numeric checks because item codes might be numeric but not follow barcode rules
    normalized_code = _normalize_barcode_input(item_code, strict_numeric=False)

    regex_match = {"$regex": f"^{re.escape(normalized_code)}$", "$options": "i"}
    item = await _db.erp_items.find_one(
        {
            "$or": [
                {"item_code": normalized_code},
                {"item_code": regex_match},
                {"barcode": normalized_code},
                {"manual_barcode": normalized_code},
            ]
        }
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    return {
        "success": True,
        "item": ERPItem(**item),
        "message": "Stock from MongoDB (ERP connection is disabled)",
    }


@router.get("/erp/config")
async def get_erp_config(current_user: dict = Depends(get_current_user)):
    """
    Get ERP configuration and connection status for the frontend.
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    config = await _db.erp_config.find_one({}, {"_id": 0})

    # Get health status from global service
    from backend.core.globals import database_health_service

    sql_health = "unknown"
    error_msg = None

    if database_health_service:
        # Use existing health check if available, or trigger a fresh one
        health = await database_health_service.check_sql_server_health()
        if health.get("status") == "healthy":
            sql_health = "connected"
        else:
            sql_health = "error"
            error_msg = health.get("error")
    else:
        sql_health = "not_configured"

    if not config:
        return {
            "configured": False,
            "use_sql_server": False,
            "connection_status": "not_configured",
            "error": "ERP configuration not found in database",
        }

    return {
        "configured": True,
        "use_sql_server": config.get("use_sql_server", False),
        "connection_status": sql_health,
        "host": config.get("host"),
        "database": config.get("database"),
        "port": config.get("port"),
        "last_check": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "error": error_msg,
    }


@router.get("/item-batches/{item_code}")
async def get_item_batches(
    item_code: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get batches/variants for a specific item code.
    Used by the frontend to show all variants (same item code, different barcodes/stock).
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    normalized_code = _normalize_barcode_input(item_code, strict_numeric=False)
    source = "mongodb_offline_fallback"
    batches: list[dict[str, Any]] = []

    sql_connector = getattr(router, "sql_connector", None)
    if sql_connector is None:
        try:
            from backend.api.count_lines_api import router as count_lines_router

            sql_connector = getattr(count_lines_router, "sql_connector", None)
        except Exception:
            sql_connector = None

    if sql_connector is not None:
        try:
            if getattr(sql_connector, "connection", None):
                sql_batches = sql_connector.get_item_batches(normalized_code)
                if isinstance(sql_batches, list):
                    batches = sql_batches
                    source = "sql_server"
        except Exception as sql_err:
            logger.warning(f"SQL batch fetch failed for '{normalized_code}': {sql_err}")

    if not batches:
        regex_match = {"$regex": f"^{re.escape(normalized_code)}$", "$options": "i"}
        query = {"$or": [{"item_code": normalized_code}, {"item_code": regex_match}]}
        cursor = _db.erp_items.find(query)
        mongo_batches = await cursor.to_list(length=100)
        batches = mongo_batches if isinstance(mongo_batches, list) else []
        source = "mongodb_offline_fallback"

    formatted_batches = []
    for batch in batches:
        barcode = batch.get("barcode") or batch.get("auto_barcode") or ""
        formatted_batches.append(
            {
                "batch_id": batch.get("batch_id"),
                "batch_no": batch.get("batch_no", "DEFAULT"),
                "item_code": batch.get("item_code"),
                "barcode": barcode,
                "item_name": batch.get("item_name"),
                "stock_qty": batch.get("stock_qty", 0),
                "mrp": batch.get("mrp"),
                "manufacturing_date": batch.get("mfg_date") or batch.get("manufacturing_date"),
                "expiry_date": batch.get("expiry_date"),
                "warehouse_id": batch.get("warehouse_id"),
                "warehouse_name": batch.get("warehouse_name"),
                "warehouse": batch.get("warehouse") or batch.get("warehouse_name"),
            }
        )

    def _stock_value(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    formatted_batches = sorted(
        formatted_batches,
        key=lambda batch: (
            -_stock_value(batch.get("stock_qty")),
            str(batch.get("batch_no") or ""),
        ),
    )

    return {
        "batches": formatted_batches,
        "source": source,
        "total_batches": len(formatted_batches),
        "item_identifier": normalized_code,
    }


@router.post("/erp/test")
async def test_erp_connection(current_user: dict = Depends(get_current_user)):
    """
    Manually test the ERP connection.
    """
    from backend.core.globals import database_health_service

    if not database_health_service:
        raise HTTPException(status_code=503, detail="Health service not initialized")

    health = await database_health_service.check_sql_server_health()

    if health.get("status") == "healthy":
        return {
            "status": "connected",
            "message": health.get("note", "Successfully connected to ERP SQL Server"),
        }
    else:
        return {
            "status": "error",
            "message": health.get("error", "Failed to connect to ERP SQL Server"),
        }


@router.get("/erp/items")
async def get_all_items(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
):
    """
    Get all items or search items from MongoDB
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # If search query provided, search items
    if search and search.strip():
        search_term = search.strip()

        # Search in MongoDB
        items_cursor = _db.erp_items.find(
            {
                "$or": [
                    {"item_name": {"$regex": search_term, "$options": "i"}},
                    {"item_code": {"$regex": search_term, "$options": "i"}},
                    {"barcode": {"$regex": search_term, "$options": "i"}},
                    {"manual_barcode": {"$regex": search_term, "$options": "i"}},
                ]
            }
        )
        total = await _db.erp_items.count_documents(
            {
                "$or": [
                    {"item_name": {"$regex": search_term, "$options": "i"}},
                    {"item_code": {"$regex": search_term, "$options": "i"}},
                    {"barcode": {"$regex": search_term, "$options": "i"}},
                    {"manual_barcode": {"$regex": search_term, "$options": "i"}},
                ]
            }
        )
        skip = (page - 1) * page_size
        items = await items_cursor.skip(skip).limit(page_size).to_list(page_size)

        # Ensure all items have required fields with defaults
        normalized_items = []
        for item in items:
            if "category" not in item:
                item["category"] = "General"
            if "warehouse" not in item:
                item["warehouse"] = "Main"
            normalized_items.append(item)

        return {
            "items": [ERPItem(**item) for item in normalized_items],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
                "has_next": skip + page_size < total,
                "has_prev": page > 1,
            },
        }

    # No search: return all items from MongoDB with pagination
    total = await _db.erp_items.count_documents({})
    skip = (page - 1) * page_size
    items_cursor = _db.erp_items.find().sort("item_name", 1).skip(skip).limit(page_size)
    items = await items_cursor.to_list(page_size)

    return {
        "items": [ERPItem(**item) for item in items],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "has_next": skip + page_size < total,
            "has_prev": page > 1,
        },
    }


@router.get("/items/search")
async def search_items_compatibility(
    query: Optional[str] = Query(None, description="Search term (legacy param 'query')"),
    search: Optional[str] = Query(None, description="Alternate search param"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: dict = Depends(get_current_user),
):
    """
    Compatibility endpoint for legacy clients that call `/api/items/search?query=...`.
    Reuses the new `/api/erp/items?search=...` implementation.
    """
    search_term = (query or search or "").strip()
    if not search_term:
        raise HTTPException(
            status_code=400,
            detail="Missing search term. Provide ?query= or ?search= parameter.",
        )

    return await get_all_items(
        search=search_term,
        current_user=current_user,
        page=page,
        page_size=page_size,
    )
