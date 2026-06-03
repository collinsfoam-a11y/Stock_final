"""
Enhanced Item API - Upgraded endpoints with better error handling,
caching, validation, and performance monitoring
"""

import asyncio
import logging
import re
import time
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

# Share barcode normalization logic with the ERP API so that
# both endpoints enforce consistent validation rules.
from backend.api.erp_api import _normalize_barcode_input

# Import from auth module to avoid circular imports
from backend.auth.dependencies import get_current_user_async as get_current_user

# Import other dependencies directly
# Import services and database
from backend.services.canonical_inventory import build_session_lookup
from backend.services.monitoring_service import MonitoringService
from backend.services.sql_sync_service import SQLSyncService
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

# These will be initialized at runtime
db: AsyncIOMotorDatabase = cast(AsyncIOMotorDatabase, None)
cache_service: Any = None
monitoring_service: Optional[MonitoringService] = None
sql_sync_service: Optional[SQLSyncService] = None


def init_enhanced_api(
    database: AsyncIOMotorDatabase,
    cache_svc: Any,
    monitoring_svc: MonitoringService,
    sql_connector_instance: Any = None,
) -> None:
    """Initialize enhanced API with dependencies"""
    global db, cache_service, monitoring_service, sql_sync_service
    db = database
    cache_service = cache_svc
    monitoring_service = monitoring_svc

    # Initialize SQL Sync Service for real-time updates
    if sql_connector_instance:
        try:
            sql_sync_service = SQLSyncService(sql_connector_instance, db)
        except Exception as e:
            logger.warning(
                "Could not initialize SQL sync for enhanced API: %s",
                sanitize_for_logging(str(e), 200),
            )
    else:
        # Fallback for tests or if not provided (though it should be)
        logger.warning("SQL Connector not provided to enhanced API, real-time sync disabled")


_ALPHANUMERIC_PATTERN = re.compile(r"^[A-Z0-9_\-]+$")
_CONTEXTUAL_ITEM_FIELDS = {
    "expected_location",
    "found_location",
    "is_misplaced",
    "relocation_status",
}


def _validate_barcode_format(barcode: Optional[str]) -> str:
    """Validate barcode input using the shared ERP normalization rules.

    Enhanced barcode lookups should behave consistently with the core ERP
    ``/erp/items/barcode/{barcode}`` endpoint, including the stricter
    numeric prefix and length rules.
    """

    if barcode is None:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Barcode cannot be empty",
                "error_code": "INVALID_BARCODE_EMPTY",
            },
        )

    # Delegate to the shared normalizer and disallow alphanumeric-only codes
    # for the enhanced barcode endpoint.
    return _normalize_barcode_input(barcode, allow_alphanumeric=False, strict_numeric=True)


# Enhanced router with comprehensive item management
enhanced_item_router = APIRouter(prefix="/api/v2/erp/items", tags=["Enhanced Items"])


class ItemResponse:
    """Enhanced item response with metadata"""

    def __init__(self, item_data: dict[str, Any], source: str, response_time_ms: float):
        self.item_data = item_data
        self.source = source  # 'mongodb', 'cache'
        self.response_time_ms = response_time_ms
        self.timestamp = datetime.now(timezone.utc).replace(tzinfo=None).isoformat()


def _to_cacheable_item(item_data: dict[str, Any]) -> dict[str, Any]:
    cacheable_item = deepcopy(item_data)
    for field in _CONTEXTUAL_ITEM_FIELDS:
        cacheable_item.pop(field, None)
    return cacheable_item


def _extract_cached_item(cached_payload: Any) -> Optional[dict[str, Any]]:
    if not isinstance(cached_payload, dict):
        return None

    cached_item = cached_payload.get("item", cached_payload)
    if not isinstance(cached_item, dict):
        return None

    return _to_cacheable_item(cached_item)


async def _sync_item_from_sql(barcode: str) -> Optional[dict[str, Any]]:
    if not sql_sync_service:
        return None
    try:
        synced_item = await asyncio.wait_for(
            sql_sync_service.sync_single_item_by_barcode(barcode),
            timeout=3,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Real-time SQL sync timed out for %s; using fallback",
            sanitize_for_logging(barcode),
        )
        return None
    except Exception as e:
        logger.warning(
            "Real-time SQL sync failed for %s: %s",
            sanitize_for_logging(barcode),
            sanitize_for_logging(str(e), 200),
        )
        return None

    if not synced_item:
        return None
    synced_item["_id"] = str(synced_item["_id"])
    return synced_item


async def _resolve_item_data_source(
    normalized_barcode: str, force_source: Optional[str]
) -> tuple[Optional[dict[str, Any]], str]:
    if force_source:
        item_data, source = await _fetch_from_specific_source(normalized_barcode, force_source)
        return cast(Optional[dict[str, Any]], item_data), source

    synced_item = await _sync_item_from_sql(normalized_barcode)
    if synced_item:
        return synced_item, "sql_server_sync"

    item_data, source = await _fetch_with_fallback_strategy(normalized_barcode)
    return cast(Optional[dict[str, Any]], item_data), source


def _build_lookup_metadata(
    *,
    include_metadata: bool,
    source: str,
    response_time_ms: float,
    normalized_barcode: str,
    current_user: dict[str, Any],
) -> Optional[dict[str, Any]]:
    if not include_metadata:
        return None
    return {
        "source": source,
        "response_time_ms": response_time_ms,
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "barcode_searched": normalized_barcode,
        "user": current_user["username"],
    }


def _raise_item_not_found(barcode: str, response_time_ms: float) -> None:
    logger.warning("Item not found for barcode: %s", sanitize_for_logging(barcode))
    raise HTTPException(
        status_code=404,
        detail={
            "message": "Item not found",
            "barcode": barcode,
            "source": "not_found",
            "response_time_ms": response_time_ms,
        },
    )


async def _resolve_lookup_context(
    session_id: Optional[str], rack_no: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    context_rack = rack_no.strip().upper() if rack_no else None
    context_floor = None
    if not session_id:
        return context_floor, context_rack

    session = await db.sessions.find_one(build_session_lookup(session_id))
    if not session:
        return context_floor, context_rack

    if not context_rack and session.get("rack"):
        context_rack = str(session.get("rack")).strip().upper()
    if session.get("floor"):
        context_floor = str(session.get("floor")).strip().upper()
    return context_floor, context_rack


def _apply_misplaced_flag(
    item_data: dict[str, Any],
    context_floor: Optional[str],
    context_rack: Optional[str],
) -> None:
    item_floor = (item_data.get("floor") or "").strip().upper()
    item_rack = (item_data.get("rack") or "").strip().upper()
    if not (item_floor or item_rack):
        return

    is_misplaced = False
    if context_rack and item_rack and context_rack != item_rack:
        is_misplaced = True
    if context_floor and item_floor and context_floor != item_floor:
        is_misplaced = True

    item_data["is_misplaced"] = is_misplaced
    if is_misplaced:
        item_data["expected_location"] = f"{item_floor}/{item_rack}"


async def _decorate_item_with_misplacement_context(
    item_data: Optional[dict[str, Any]], session_id: Optional[str], rack_no: Optional[str]
) -> None:
    if not item_data or not (session_id or rack_no):
        return

    try:
        context_floor, context_rack = await _resolve_lookup_context(session_id, rack_no)
        _apply_misplaced_flag(item_data, context_floor, context_rack)
    except Exception as e:
        logger.warning(
            "Failed to calculate is_misplaced: %s",
            sanitize_for_logging(str(e), 200),
        )


async def _cache_lookup_response(normalized_barcode: str, response_data: dict[str, Any]) -> None:
    if not cache_service:
        return
    await cache_service.set_async(
        "items",
        f"enhanced_{normalized_barcode}",
        {"item": _to_cacheable_item(response_data)},
        ttl=1800,
    )


async def _record_enhanced_lookup_metrics(
    request: Request, status_code: int, start_time: float
) -> None:
    if not monitoring_service:
        return
    try:
        await monitoring_service.track_request(
            endpoint="enhanced_barcode_lookup",
            method=request.method,
            status_code=status_code,
            duration=time.time() - start_time,
        )
    except Exception:
        logger.debug("Failed to record enhanced barcode metrics", exc_info=True)


@enhanced_item_router.get("/barcode/{barcode}/enhanced")
async def get_item_by_barcode_enhanced(
    barcode: str,
    request: Request,
    force_source: Optional[str] = Query(None, description="Force data source: mongodb, or cache"),
    include_metadata: bool = Query(True, description="Include response metadata"),
    current_user: dict = Depends(get_current_user),
    session_id: Optional[str] = Query(None, description="Current session ID for context"),
    rack_no: Optional[str] = Query(None, description="Current rack number for context"),
):
    """
    Enhanced barcode lookup with multiple data sources, caching, and performance monitoring.
    Also checks for 'is_misplaced' status if session context is provided.
    """
    start_time = time.time()
    status_code = 200

    try:
        normalized_barcode = _validate_barcode_format(barcode)
        item_data, source = await _resolve_item_data_source(normalized_barcode, force_source)
        response_time = (time.time() - start_time) * 1000

        if item_data is None or source == "not_found":
            _raise_item_not_found(normalized_barcode, response_time)

        item_data = cast(dict[str, Any], item_data)
        logger.info(
            "Enhanced barcode lookup: %s from %s in %.2fms",
            normalized_barcode,
            source,
            response_time,
        )
        response_item = deepcopy(item_data)
        await _decorate_item_with_misplacement_context(response_item, session_id, rack_no)

        response_data = {
            "item": response_item,
            "metadata": _build_lookup_metadata(
                include_metadata=include_metadata,
                source=source,
                response_time_ms=response_time,
                normalized_barcode=normalized_barcode,
                current_user=current_user,
            ),
        }
        await _cache_lookup_response(normalized_barcode, item_data)
        return response_data

    except HTTPException as exc:
        status_code = exc.status_code
        raise
    except Exception as e:
        status_code = 500
        response_time = (time.time() - start_time) * 1000
        logger.error(
            "Enhanced barcode lookup failed: %s in %.2fms - %s",
            sanitize_for_logging(barcode, 100),
            response_time,
            sanitize_for_logging(str(e), 200),
        )

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Enhanced barcode lookup failed",
                "barcode": barcode,
                "source": "error",
                "response_time_ms": response_time,
                "error": str(e),
            },
        )
    finally:
        await _record_enhanced_lookup_metrics(request, status_code, start_time)


async def _fetch_from_specific_source(barcode: str, source: str) -> tuple[Optional[dict], str]:
    """Fetch item from a specific data source"""

    if source == "mongodb":
        regex_match = {"$regex": f"^{re.escape(barcode)}$", "$options": "i"}
        item = await db.erp_items.find_one(
            {
                "$or": [
                    {"barcode": barcode},
                    {"autobarcode": barcode},
                    {"manual_barcode": barcode},
                    {"item_code": barcode},
                    {"item_code": regex_match},
                ]
            }
        )
        if item:
            item["_id"] = str(item["_id"])
        return item, "mongodb"

    elif source == "cache":
        if cache_service:
            item = await cache_service.get_async("items", f"enhanced_{barcode}")
            return _extract_cached_item(item), "cache"
        else:
            raise HTTPException(status_code=503, detail="Cache service not available")

    else:
        raise HTTPException(status_code=400, detail=f"Invalid source: {source}")


async def _fetch_with_fallback_strategy(barcode: str) -> tuple[Optional[dict], str]:
    """
    Intelligent fallback strategy:
    1. Try cache first (fastest)
    2. Try MongoDB (fast, most up-to-date)
    """

    # Strategy 1: Cache (if available)
    if cache_service:
        try:
            cached = await cache_service.get_async("items", f"enhanced_{barcode}")
            cached_item = _extract_cached_item(cached)
            if cached_item:
                return cached_item, "cache"
        except Exception:
            pass  # Continue to next strategy

    # Strategy 2: MongoDB (primary app database)
    try:
        regex_match = {"$regex": f"^{re.escape(barcode)}$", "$options": "i"}
        mongo_item = await db.erp_items.find_one(
            {
                "$or": [
                    {"barcode": barcode},
                    {"autobarcode": barcode},
                    {"manual_barcode": barcode},
                    {"item_code": barcode},
                    {"item_code": regex_match},
                ]
            }
        )
        if mongo_item:
            # Convert ObjectId to string for JSON serialization
            mongo_item["_id"] = str(mongo_item["_id"])
            return mongo_item, "mongodb"
    except Exception as e:
        logger.warning(
            "MongoDB lookup failed: %s",
            sanitize_for_logging(str(e), 200),
        )

    # All strategies failed
    return None, "not_found"


def _build_relevance_stage(query: str) -> dict[str, Any]:
    """Build relevance scoring stage for aggregation pipeline"""
    escaped_query = re.escape(query.strip())
    return {
        "$addFields": {
            "relevance_score": {
                "$sum": [
                    {
                        "$cond": [
                            {
                                "$regexMatch": {
                                    "input": "$item_name",
                                    "regex": escaped_query,
                                    "options": "i",
                                }
                            },
                            10,
                            0,
                        ]
                    },
                    {
                        "$cond": [
                            {
                                "$regexMatch": {
                                    "input": "$item_code",
                                    "regex": escaped_query,
                                    "options": "i",
                                }
                            },
                            8,
                            0,
                        ]
                    },
                    {
                        "$cond": [
                            {
                                "$regexMatch": {
                                    "input": "$barcode",
                                    "regex": escaped_query,
                                    "options": "i",
                                }
                            },
                            15,
                            0,
                        ]
                    },
                    {
                        "$cond": [
                            {
                                "$regexMatch": {
                                    "input": "$category",
                                    "regex": escaped_query,
                                    "options": "i",
                                }
                            },
                            5,
                            0,
                        ]
                    },
                ]
            }
        }
    }


def _build_match_conditions(
    query: str,
    search_fields: list[str],
    category: Optional[str] = None,
    warehouse: Optional[str] = None,
    floor: Optional[str] = None,
    rack: Optional[str] = None,
    stock_level: Optional[str] = None,
) -> dict[str, Any]:
    """Build match conditions for search pipeline"""
    match_conditions: dict[str, Any] = {"$or": []}

    trimmed_query = query.strip()
    escaped_query = re.escape(trimmed_query)

    # Use provided search_fields, with smart defaults based on query pattern
    # --- Rule 6: Serial Scan Engine (Strict Isolation) ---
    # The system must strictly isolate barcode searches for prefixes 51, 52, and 53.
    # If a search string matches these prefixes, the system MUST NOT fall back to name-based fuzzy matching.
    is_strict_barcode = trimmed_query.startswith(("51", "52", "53"))

    if is_strict_barcode:
        target_fields = ["barcode"]
        logger.info(
            "Rule 6: Strict barcode search enabled for %s",
            sanitize_for_logging(trimmed_query),
        )
    else:
        # User requirements:
        # - "only barcode and item name are search criteria"
        # - "after first three characters, list item names matching"
        target_fields = search_fields if search_fields else ["item_name", "barcode"]

    # Build $or conditions for all target fields
    for field in target_fields:
        match_conditions["$or"].append({field: {"$regex": escaped_query, "$options": "i"}})

    # Additional filters
    if category:
        match_conditions["category"] = {"$regex": re.escape(category), "$options": "i"}

    if warehouse:
        match_conditions["warehouse"] = {"$regex": re.escape(warehouse), "$options": "i"}

    if floor:
        match_conditions["floor"] = {"$regex": re.escape(floor), "$options": "i"}

    if rack:
        match_conditions["rack"] = {"$regex": re.escape(rack), "$options": "i"}

    if stock_level:
        stock_filter = _get_stock_level_filter(stock_level)
        if stock_filter:
            match_conditions["stock_qty"] = stock_filter

    if not match_conditions["$or"]:
        # Fallback if no fields selected (shouldn't happen with logic above)
        match_conditions["$or"].append({"item_name": {"$regex": escaped_query, "$options": "i"}})

    return match_conditions


def _get_stock_level_filter(stock_level: str) -> Optional[dict[str, Any]]:
    """Get stock quantity filter based on level"""
    level_map = {
        "zero": {"$eq": 0},
        "low": {"$gt": 0, "$lt": 10},
        "medium": {"$gte": 10, "$lt": 100},
        "high": {"$gte": 100},
    }
    return level_map.get(stock_level)


def _build_search_pipeline(
    query: str,
    search_fields: list[str],
    limit: int,
    offset: int,
    sort_by: str,
    category: Optional[str],
    warehouse: Optional[str],
    stock_level: Optional[str],
    floor: Optional[str],
    rack: Optional[str],
) -> list[dict[str, Any]]:
    """Build MongoDB aggregation pipeline for advanced search"""
    pipeline: list[dict[str, Any]] = []

    # Match stage - search criteria
    match_conditions = _build_match_conditions(
        query=query,
        search_fields=search_fields,
        category=category,
        warehouse=warehouse,
        floor=floor,
        rack=rack,
        stock_level=stock_level,
    )
    pipeline.append({"$match": match_conditions})

    # Add relevance scoring
    pipeline.append(_build_relevance_stage(query))

    # Sorting
    sort_stage: dict[str, int] = {}
    if sort_by == "relevance":
        sort_stage = {"relevance_score": -1, "item_name": 1}
    elif sort_by == "name":
        sort_stage = {"item_name": 1}
    elif sort_by == "code":
        sort_stage = {"item_code": 1}
    elif sort_by == "stock":
        sort_stage = {"stock_qty": -1}
    else:
        sort_stage = {"relevance_score": -1}

    pipeline.append({"$sort": sort_stage})

    # Pagination
    pipeline.append({"$skip": offset})
    pipeline.append({"$limit": limit})

    # Only surface the minimal fields required by the client
    pipeline.append(
        {
            "$project": {
                "_id": 1,
                "item_name": 1,
                "item_code": 1,
                "barcode": 1,
                "relevance_score": 1,
            }
        }
    )

    return pipeline


@enhanced_item_router.get("/search/advanced")
async def advanced_item_search(
    query: str = Query(..., description="Search query"),
    search_fields: list[str] = Query(
        ["item_name", "item_code", "barcode"], description="Fields to search in"
    ),
    limit: int = Query(50, ge=1, le=200, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Results offset"),
    sort_by: str = Query("relevance", description="Sort by: relevance, name, code, stock"),
    category: Optional[str] = Query(None, description="Filter by category"),
    warehouse: Optional[str] = Query(None, description="Filter by warehouse"),
    floor: Optional[str] = Query(None, description="Filter by floor"),
    rack: Optional[str] = Query(None, description="Filter by rack"),
    stock_level: Optional[str] = Query(
        None, description="Filter by stock: low, medium, high, zero"
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Advanced search with multiple criteria, filtering, and sorting
    """
    start_time = time.time()

    try:
        # Build MongoDB aggregation pipeline
        pipeline = _build_search_pipeline(
            query,
            search_fields,
            limit,
            offset,
            sort_by,
            category,
            warehouse,
            stock_level,
            floor,
            rack,
        )

        # Execute aggregation
        cursor = db.erp_items.aggregate(pipeline)
        results = await cursor.to_list(length=limit)

        # Get total count for pagination
        # Reconstruct match conditions for count query
        # This is a bit redundant but keeps the helper function focused on the pipeline
        match_conditions = pipeline[0]["$match"]
        count_pipeline = [{"$match": match_conditions}, {"$count": "total"}]
        count_result = await db.erp_items.aggregate(count_pipeline).to_list(1)
        total_count = count_result[0]["total"] if count_result else 0

        # Prepare response
        response_time = (time.time() - start_time) * 1000

        # Clean up results (remove MongoDB ObjectIds)
        for result in results:
            result["_id"] = str(result["_id"])

        return {
            "items": results,
            "pagination": {
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": (offset + limit) < total_count,
            },
            "search_info": {
                "query": query,
                "search_fields": search_fields,
                "filters": {
                    "category": category,
                    "warehouse": warehouse,
                    "floor": floor,
                    "rack": rack,
                    "stock_level": stock_level,
                },
                "sort_by": sort_by,
            },
            "performance": {
                "response_time_ms": response_time,
                "results_count": len(results),
                "source": "mongodb_aggregation",
            },
        }

    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(
            "Advanced search failed: %s in %.2fms - %s",
            sanitize_for_logging(query, 100),
            response_time,
            sanitize_for_logging(str(e), 200),
        )

        raise HTTPException(
            status_code=500,
            detail={
                "message": "Advanced search failed",
                "query": query,
                "response_time_ms": response_time,
                "error": str(e),
            },
        )


@enhanced_item_router.get("/locations")
async def get_unique_locations(current_user: dict = Depends(get_current_user)):
    """
    Get unique floors and racks for filtering
    """
    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "floors": {"$addToSet": "$floor"},
                    "racks": {"$addToSet": "$rack"},
                }
            }
        ]

        result = await db.erp_items.aggregate(pipeline).to_list(1)

        if not result:
            return {"floors": [], "racks": []}

        # Filter out None/null values and sort
        floors = sorted([f for f in result[0].get("floors", []) if f])
        racks = sorted([r for r in result[0].get("racks", []) if r])

        return {"floors": floors, "racks": racks}
    except Exception as e:
        logger.error(
            "Failed to fetch locations: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=f"Failed to fetch locations: {str(e)}")


@enhanced_item_router.get("/performance/stats")
async def get_item_api_performance(current_user: dict = Depends(get_current_user)):
    """Get performance statistics for item API operations"""

    if current_user["role"] != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisor access required")

    try:
        # Get database manager instance
        from backend.services.database_manager import DatabaseManager
        from backend.sql_server_connector import SQLServerConnector

        # Initialize SQL connector
        sql_connector = SQLServerConnector()

        db_manager = DatabaseManager(
            mongo_client=db.client, mongo_db=db, sql_connector=sql_connector
        )

        # Comprehensive performance analysis
        api_metrics = (
            (await monitoring_service.get_metrics()).get("endpoints", {})
            if monitoring_service
            else {}
        )

        performance_data = {
            "database_health": await db_manager.check_database_health(),
            "data_flow_verification": await db_manager.verify_data_flow(),
            "database_insights": await db_manager.get_database_insights(),
            "api_metrics": api_metrics,
            "cache_stats": await cache_service.get_stats() if cache_service else {},
        }

        return performance_data

    except Exception as e:
        logger.error(
            "Performance stats failed: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=f"Performance analysis failed: {str(e)}")


@enhanced_item_router.post("/sync/realtime")
async def trigger_realtime_sync(
    item_codes: Optional[list[str]] = None, current_user: dict = Depends(get_current_user)
):
    """
    Trigger real-time sync for specific items or all items (Now disabled as ERP is disconnected)
    """
    if current_user["role"] != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisor access required")

    return {
        "sync_type": "disabled",
        "message": "Real-time sync is disabled because the ERP connection is not configured.",
        "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }


@enhanced_item_router.get("/database/status")
async def get_database_status(current_user: dict = Depends(get_current_user)):
    """
    Get comprehensive database status and health information
    """
    try:
        from backend.services.database_manager import DatabaseManager
        from backend.sql_server_connector import SQLServerConnector

        # Initialize SQL connector
        sql_connector = SQLServerConnector()

        db_manager = DatabaseManager(
            mongo_client=db.client, mongo_db=db, sql_connector=sql_connector
        )

        return await db_manager.check_database_health()

    except Exception as e:
        logger.error(
            "Database status check failed: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=f"Database status failed: {str(e)}")


@enhanced_item_router.post("/database/optimize")
async def optimize_database_performance(current_user: dict = Depends(get_current_user)):
    """
    Optimize database performance (supervisor only)
    """
    if current_user["role"] != "supervisor":
        raise HTTPException(status_code=403, detail="Supervisor access required")

    try:
        from backend.services.database_manager import DatabaseManager
        from backend.sql_server_connector import SQLServerConnector

        db_manager = DatabaseManager(
            mongo_client=db.client,
            mongo_db=db,
            sql_connector=SQLServerConnector(),
        )

        optimization_results = await db_manager.optimize_database_performance()

        return {
            "optimization_completed": True,
            "results": optimization_results,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        }

    except Exception as e:
        logger.error(
            "Database optimization failed: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
