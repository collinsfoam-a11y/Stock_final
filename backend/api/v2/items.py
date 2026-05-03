"""
API v2 Items Endpoints
Upgraded item endpoints with standardized responses
"""

import io
import re
import sys
from pathlib import Path
from typing import Any, Optional
from typing import cast

from bson.errors import InvalidId
from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel
from pymongo.errors import PyMongoError

from backend.api.response_models import ApiResponse, PaginatedResponse
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.ai_search import ai_search_service
from backend.services.enhanced_item_query_service import (
    EnhancedItemQueryService,
    get_enhanced_item_query_service,
)
from backend.services.sql_verification_service import sql_verification_service

# Add project root to path for direct execution (debugging)
# This allows the file to be run directly for testing/debugging
project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


router = APIRouter()
ITEM_ENDPOINT_ERRORS = (ImportError, InvalidId, OSError, PyMongoError, RuntimeError, TypeError, ValueError)


class ItemResponse(BaseModel):
    """Item response model"""

    id: str
    name: str
    item_code: Optional[str] = None
    barcode: Optional[str] = None
    stock_qty: float
    mrp: Optional[float] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    warehouse: Optional[str] = None
    uom_name: Optional[str] = None
    # SQL verification fields
    sql_verified_qty: Optional[float] = None
    last_sql_verified_at: Optional[str] = None
    variance: Optional[float] = None
    mongo_cached_qty_previous: Optional[float] = None
    sql_qty_mismatch_flag: Optional[bool] = None
    sql_verification_status: Optional[str] = None


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        key = normalized.lower()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def _extract_identifiers_from_text(raw_text: str) -> list[str]:
    candidates = re.findall(r"[A-Za-z0-9][A-Za-z0-9\\-/]{2,}", raw_text or "")
    return _dedupe_preserve_order(candidates)


def _extract_image_identifiers(file_bytes: bytes) -> list[str]:
    identifiers: list[str] = []

    try:
        from PIL import Image

        image = Image.open(io.BytesIO(file_bytes))
        image.load()
    except (ImportError, OSError, ValueError):
        return []

    try:
        from pyzbar.pyzbar import decode as decode_barcodes

        for decoded in decode_barcodes(image):
            if decoded.data:
                identifiers.append(decoded.data.decode("utf-8", errors="ignore"))
    except (AttributeError, ImportError, OSError, ValueError):
        pass

    try:
        import pytesseract

        ocr_text = pytesseract.image_to_string(image)
        identifiers.extend(_extract_identifiers_from_text(ocr_text))
    except (ImportError, OSError, RuntimeError, TypeError, ValueError):
        pass

    return _dedupe_preserve_order(identifiers)


async def _lookup_identified_items(
    item_service: EnhancedItemQueryService, identifiers: list[str], limit: int = 5
) -> tuple[list[dict[str, Any]], list[str]]:
    if not hasattr(item_service, "lookup_identified_items"):
        item_service = EnhancedItemQueryService(item_service)
    return await item_service.lookup_identified_items(
        identifiers,
        limit=limit,
        reranker=ai_search_service,
    )


@router.get("/", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def get_items_v2(
    search: Optional[str] = Query(None, description="Search by name or barcode"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: dict[str, Any] = Depends(get_current_user),
    item_service: EnhancedItemQueryService = Depends(get_enhanced_item_query_service),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Get items with pagination (v2)
    Returns standardized paginated response
    """
    try:
        from rapidfuzz import fuzz

        # 1. Fetch Candidates (Hybrid Strategy)
        query = {}
        if search:
            # Broaden search to get candidates for fuzzy matching
            # We use a loose regex to filter obvious non-matches at DB level
            # to keep python processing fast.
            query = {
                "$or": [
                    {"item_name": {"$regex": search, "$options": "i"}},
                    {"barcode": {"$regex": search, "$options": "i"}},
                    {"category": {"$regex": search, "$options": "i"}},
                    {"item_code": {"$regex": search, "$options": "i"}},
                ]
            }

        # Optimization: reliable total count for pagination
        # Note: Fuzzy re-ranking messes up simple pagination.
        # Strategy:
        # A) If searching: Fetch ALL candidates (limit 100-200), Rank, Slice.
        # B) If NOT searching: Use standard DB pagination.

        sorted_items, total = await item_service.list_items(
            query,
            page=page,
            page_size=page_size,
            search=search,
            scorer=fuzz,
        )

        # Convert to response models
        item_responses = [
            ItemResponse(
                id=str(item["_id"]),
                name=item.get("item_name", ""),
                item_code=item.get("item_code"),
                barcode=item.get("barcode"),
                stock_qty=item.get("stock_qty", 0.0),
                mrp=item.get("mrp"),
                category=item.get("category"),
                subcategory=item.get("subcategory"),
                warehouse=item.get("warehouse"),
                uom_name=item.get("uom_name"),
            )
            for item in sorted_items
        ]

        paginated_response = PaginatedResponse.create(
            items=item_responses,
            total=total,
            page=page,
            page_size=page_size,
        )

        return ApiResponse.success_response(
            data=paginated_response,
            message=f"Retrieved {len(item_responses)} items",
        )

    except ITEM_ENDPOINT_ERRORS as e:
        return ApiResponse.error_response(
            error_code="ITEMS_FETCH_ERROR",
            error_message=f"Failed to fetch items: {str(e)}",
        )


@router.get("/semantic", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def search_items_semantic(
    query: str = Query(..., min_length=2, description="Semantic search query"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    current_user: dict[str, Any] = Depends(get_current_user),
    item_service: EnhancedItemQueryService = Depends(get_enhanced_item_query_service),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Semantic Search (AI-Powered)
    Uses sentence-transformers to find items by meaning/context.
    """
    try:
        # 1. Fetch a broad set of candidates (e.g., all active items or recent ones)
        # In a real vector DB, we'd query the vector index.
        # Here, we'll fetch items and rely on the service to rerank/filter.
        # For performance, we might limit to top 500 or use a text index if available.

        # Fetching top 500 items for re-ranking context
        # This is a compromise for "Local AI" without a Vector DB
        candidates = await item_service.semantic_candidates()

        if not candidates:
            return ApiResponse.success_response(
                data=PaginatedResponse.create([], 0, 1, limit),
                message="No items available for semantic search",
            )

        # 2. Perform Semantic Reranking
        # The service will encode the query and candidates, then sort by similarity
        results = ai_search_service.search_rerank(query, candidates, top_k=limit)

        # 3. Convert to Response
        item_responses = [
            ItemResponse(
                id=str(item["_id"]),
                name=item.get("item_name", ""),
                item_code=item.get("item_code"),
                barcode=item.get("barcode"),
                stock_qty=item.get("stock_qty", 0.0),
                mrp=item.get("mrp"),
                category=item.get("category"),
                subcategory=item.get("subcategory"),
                warehouse=item.get("warehouse"),
                uom_name=item.get("uom_name"),
            )
            for item in results
        ]

        return ApiResponse.success_response(
            data=PaginatedResponse.create(item_responses, len(item_responses), 1, limit),
            message=f"Found top {len(item_responses)} semantic matches",
        )

    except ITEM_ENDPOINT_ERRORS as e:
        return ApiResponse.error_response(
            error_code="SEMANTIC_SEARCH_ERROR",
            error_message=f"Semantic search failed: {str(e)}",
        )


@router.get("/id/{item_id}", response_model=ApiResponse[ItemResponse])
async def get_item_v2(
    item_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    item_service: EnhancedItemQueryService = Depends(get_enhanced_item_query_service),
) -> ApiResponse[ItemResponse]:
    """
    Get a single item by ID (v2)
    Returns standardized response
    """
    try:
        item = await item_service.get_item_by_object_id(item_id)

        if not item:
            return ApiResponse.error_response(
                error_code="ITEM_NOT_FOUND",
                error_message=f"Item with ID {item_id} not found",
            )

        item_response = ItemResponse(
            id=str(item["_id"]),
            name=item.get("item_name", ""),
            item_code=item.get("item_code"),
            barcode=item.get("barcode"),
            stock_qty=item.get("stock_qty", 0.0),
            mrp=item.get("mrp"),
            category=item.get("category"),
            subcategory=item.get("subcategory"),
            warehouse=item.get("warehouse"),
            uom_name=item.get("uom_name"),
        )

        return ApiResponse.success_response(
            data=item_response,
            message="Item retrieved successfully",
        )

    except ITEM_ENDPOINT_ERRORS as e:
        return ApiResponse.error_response(
            error_code="ITEM_FETCH_ERROR",
            error_message=f"Failed to fetch item: {str(e)}",
        )


@router.post("/identify", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def identify_item(
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user),
    item_service: EnhancedItemQueryService = Depends(get_enhanced_item_query_service),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Visual Search / Identify Item
    Accepts an image, extracts machine-readable identifiers, and returns matching items.
    """
    try:
        file_bytes = await file.read()
        if not file_bytes:
            return ApiResponse.error_response(
                error_code="IDENTIFY_EMPTY_FILE",
                error_message="Uploaded image is empty",
            )

        identifiers = _extract_image_identifiers(file_bytes)
        if not identifiers:
            return ApiResponse.error_response(
                error_code="IDENTIFY_NO_SIGNAL",
                error_message="Could not detect a barcode or readable label in the image",
            )

        results, matched_terms = await _lookup_identified_items(item_service, identifiers, limit=5)
        if not results:
            return ApiResponse.error_response(
                error_code="IDENTIFY_NO_MATCH",
                error_message="No inventory item matched the detected identifiers",
                details={"matched_terms": matched_terms},
            )

        # Convert to response
        item_responses = [
            ItemResponse(
                id=str(item["_id"]),
                name=item.get("item_name", ""),
                item_code=item.get("item_code"),
                barcode=item.get("barcode"),
                stock_qty=item.get("stock_qty", 0.0),
                mrp=item.get("mrp"),
                category=item.get("category"),
                subcategory=item.get("subcategory"),
                warehouse=item.get("warehouse"),
                uom_name=item.get("uom_name"),
            )
            for item in results
        ]

        return ApiResponse.success_response(
            data=PaginatedResponse.create(item_responses, len(item_responses), 1, 5),
            message=f"Matched using: {', '.join(matched_terms[:3])}",
        )

    except ITEM_ENDPOINT_ERRORS as e:
        return ApiResponse.error_response(
            error_code="VISUAL_SEARCH_ERROR",
            error_message=f"Identification failed: {str(e)}",
        )


@router.get("/{item_code}", response_model=ApiResponse[ItemResponse])
async def get_item_details(
    item_code: str,
    verify_sql: bool = Query(False, description="Verify against SQL Server"),
    current_user: dict[str, Any] = Depends(get_current_user),
    item_service: EnhancedItemQueryService = Depends(get_enhanced_item_query_service),
) -> ApiResponse[ItemResponse]:
    """
    Get item details with optional SQL verification
    When verify_sql=true, triggers SQL quantity verification and updates MongoDB
    """
    try:
        # Get item from MongoDB (search by item_code OR barcode)
        item = await item_service.get_item_by_code_or_barcode(item_code)
        if not item:
            return ApiResponse.error_response(
                error_code="ITEM_NOT_FOUND",
                error_message=f"Item with code {item_code} not found",
            )

        # Trigger SQL verification if requested
        if verify_sql:
            try:
                verification_result = await sql_verification_service.verify_item_quantity(item_code)
                if verification_result["success"]:
                    # Refresh item data after verification
                    refreshed_item = await item_service.get_item_by_code(item_code)
                    if refreshed_item:
                        item = refreshed_item
            except ITEM_ENDPOINT_ERRORS as e:
                # Log error but don't fail the request
                import logging
                from backend.utils.api_utils import sanitize_for_logging

                logger = logging.getLogger(__name__)
                logger.warning(
                    f"SQL verification failed for {sanitize_for_logging(item_code)}: {sanitize_for_logging(str(e))}"
                )

        item_doc = cast(dict[str, Any], item)
        last_sql_verified_at = item_doc.get("last_sql_verified_at")

        # Convert to response
        item_response = ItemResponse(
            id=str(item_doc["_id"]),
            name=item_doc.get("item_name", ""),
            item_code=item_doc.get("item_code"),
            barcode=item_doc.get("barcode"),
            stock_qty=item_doc.get("stock_qty", 0.0),
            mrp=item_doc.get("mrp"),
            category=item_doc.get("category"),
            subcategory=item_doc.get("subcategory"),
            warehouse=item_doc.get("warehouse"),
            uom_name=item_doc.get("uom_name"),
            sql_verified_qty=item_doc.get("sql_verified_qty"),
            last_sql_verified_at=last_sql_verified_at.isoformat() if last_sql_verified_at else None,
            variance=item_doc.get("variance"),
            mongo_cached_qty_previous=item_doc.get("mongo_cached_qty_previous"),
            sql_qty_mismatch_flag=item_doc.get("sql_qty_mismatch_flag"),
            sql_verification_status=item_doc.get("sql_verification_status"),
        )

        return ApiResponse.success_response(
            data=item_response,
            message=f"Retrieved item details for {item_code}",
        )

    except ITEM_ENDPOINT_ERRORS as e:
        return ApiResponse.error_response(
            error_code="INTERNAL_ERROR",
            error_message=f"Failed to get item details: {str(e)}",
        )
