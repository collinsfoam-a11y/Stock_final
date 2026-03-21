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

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel

from backend.api.response_models import ApiResponse, PaginatedResponse
from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
from backend.services.ai_search import ai_search_service
from backend.services.sql_verification_service import sql_verification_service
from backend.utils.erp_utils import _get_barcode_variations

# Add project root to path for direct execution (debugging)
# This allows the file to be run directly for testing/debugging
project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


router = APIRouter()


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
    except Exception:
        return []

    try:
        from pyzbar.pyzbar import decode as decode_barcodes

        for decoded in decode_barcodes(image):
            if decoded.data:
                identifiers.append(decoded.data.decode("utf-8", errors="ignore"))
    except Exception:
        pass

    try:
        import pytesseract

        ocr_text = pytesseract.image_to_string(image)
        identifiers.extend(_extract_identifiers_from_text(ocr_text))
    except Exception:
        pass

    return _dedupe_preserve_order(identifiers)


async def _lookup_identified_items(
    db: Any, identifiers: list[str], limit: int = 5
) -> tuple[list[dict[str, Any]], list[str]]:
    matched_terms = _dedupe_preserve_order(identifiers)
    if not matched_terms:
        return [], []

    exact_terms: list[str] = []
    for term in matched_terms:
        exact_terms.extend(_get_barcode_variations(term))
    exact_terms = _dedupe_preserve_order(exact_terms)

    exact_matches = (
        await db.erp_items.find(
            {
                "$or": [
                    {"barcode": {"$in": exact_terms}},
                    {"manual_barcode": {"$in": exact_terms}},
                    {"item_code": {"$in": exact_terms}},
                ]
            }
        )
        .limit(limit)
        .to_list(length=limit)
    )
    if exact_matches:
        return exact_matches, exact_terms

    primary_query = " ".join(matched_terms[:3])
    regex_clauses = []
    for term in matched_terms[:5]:
        regex_clauses.extend(
            [
                {"item_name": {"$regex": re.escape(term), "$options": "i"}},
                {"item_code": {"$regex": re.escape(term), "$options": "i"}},
                {"barcode": {"$regex": re.escape(term), "$options": "i"}},
                {"category": {"$regex": re.escape(term), "$options": "i"}},
            ]
        )

    candidates = await db.erp_items.find({"$or": regex_clauses}).limit(250).to_list(length=250)
    if not candidates:
        return [], matched_terms

    reranked = ai_search_service.search_rerank(primary_query, candidates, top_k=limit)
    return reranked, matched_terms


@router.get("/", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def get_items_v2(
    search: Optional[str] = Query(None, description="Search by name or barcode"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Get items with pagination (v2)
    Returns standardized paginated response
    """
    try:
        db = get_db()
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

        item_responses = []
        total = 0

        if not search:
            # Case B: Standard Pagination
            total = await db.erp_items.count_documents(query)
            skip = (page - 1) * page_size
            items_cursor = db.erp_items.find(query).skip(skip).limit(page_size)
            items = await items_cursor.to_list(length=page_size)
            sorted_items = items
        else:
            # Case A: Fuzzy Search
            # Limit candidate pool to 200 for performance
            items_cursor = db.erp_items.find(query).limit(200)
            candidates = await items_cursor.to_list(length=200)
            total = len(candidates)

            # Scoring
            scored_candidates = []
            for item in candidates:
                # Weighted Score:
                # Name match is worth most (weight 1.0)
                # Barcode match is critical (weight 1.2)
                # Code match is high (1.1)

                name_score = fuzz.partial_ratio(search.lower(), item.get("item_name", "").lower())
                code_score = fuzz.ratio(search.lower(), str(item.get("item_code", "")).lower())
                barcode_score = fuzz.ratio(search.lower(), str(item.get("barcode", "")).lower())

                # Boost exact matches
                final_score = max(name_score, code_score * 1.1, barcode_score * 1.2)

                scored_candidates.append((final_score, item))

            # Sort by score descending
            scored_candidates.sort(key=lambda x: x[0], reverse=True)

            # Pagination on results
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            sorted_items = [x[1] for x in scored_candidates[start_idx:end_idx]]

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

    except Exception as e:
        return ApiResponse.error_response(
            error_code="ITEMS_FETCH_ERROR",
            error_message=f"Failed to fetch items: {str(e)}",
        )


@router.get("/semantic", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def search_items_semantic(
    query: str = Query(..., min_length=2, description="Semantic search query"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Semantic Search (AI-Powered)
    Uses sentence-transformers to find items by meaning/context.
    """
    try:
        db = get_db()
        # 1. Fetch a broad set of candidates (e.g., all active items or recent ones)
        # In a real vector DB, we'd query the vector index.
        # Here, we'll fetch items and rely on the service to rerank/filter.
        # For performance, we might limit to top 500 or use a text index if available.

        # Fetching top 500 items for re-ranking context
        # This is a compromise for "Local AI" without a Vector DB
        items_cursor = db.erp_items.find({}).limit(500)
        candidates = await items_cursor.to_list(length=500)

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

    except Exception as e:
        return ApiResponse.error_response(
            error_code="SEMANTIC_SEARCH_ERROR",
            error_message=f"Semantic search failed: {str(e)}",
        )


@router.get("/{item_id}", response_model=ApiResponse[ItemResponse])
async def get_item_v2(
    item_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[ItemResponse]:
    """
    Get a single item by ID (v2)
    Returns standardized response
    """
    try:
        db = get_db()
        from bson import ObjectId

        item = await db.erp_items.find_one({"_id": ObjectId(item_id)})

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

    except Exception as e:
        return ApiResponse.error_response(
            error_code="ITEM_FETCH_ERROR",
            error_message=f"Failed to fetch item: {str(e)}",
        )


@router.post("/identify", response_model=ApiResponse[PaginatedResponse[ItemResponse]])
async def identify_item(
    file: UploadFile = File(...),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[PaginatedResponse[ItemResponse]]:
    """
    Visual Search / Identify Item
    Accepts an image, extracts machine-readable identifiers, and returns matching items.
    """
    try:
        db = get_db()
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

        results, matched_terms = await _lookup_identified_items(db, identifiers, limit=5)
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

    except Exception as e:
        return ApiResponse.error_response(
            error_code="VISUAL_SEARCH_ERROR",
            error_message=f"Identification failed: {str(e)}",
        )


@router.get("/{item_code}", response_model=ApiResponse[ItemResponse])
async def get_item_details(
    item_code: str,
    verify_sql: bool = Query(False, description="Verify against SQL Server"),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> ApiResponse[ItemResponse]:
    """
    Get item details with optional SQL verification
    When verify_sql=true, triggers SQL quantity verification and updates MongoDB
    """
    try:
        db = get_db()

        # Get item from MongoDB (search by item_code OR barcode)
        item = await db.erp_items.find_one(
            {"$or": [{"item_code": item_code}, {"barcode": item_code}]}
        )
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
                    refreshed_item = await db.erp_items.find_one({"item_code": item_code})
                    if refreshed_item:
                        item = refreshed_item
            except Exception as e:
                # Log error but don't fail the request
                import logging

                logger = logging.getLogger(__name__)
                logger.warning(f"SQL verification failed for {item_code}: {str(e)}")

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

    except Exception as e:
        return ApiResponse.error_response(
            error_code="INTERNAL_ERROR",
            error_message=f"Failed to get item details: {str(e)}",
        )
