"""
Search Service for Optimized Item Lookup

Provides debounce-friendly search with relevance scoring, caching,
and pagination. Designed for frontend integration with 300ms debounce.

Scoring Algorithm:
  - Exact barcode match: 1000 points (highest priority)
  - Partial barcode match: 500 + similarity score
  - Exact item_code match: 400 points
  - Item name prefix match: 300 + position bonus
  - Item name contains: 200 + similarity score
  - Fuzzy name match: similarity score (0-100)
"""

import logging
import re
from dataclasses import dataclass
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from rapidfuzz import fuzz

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Search result with relevance score"""

    id: str
    item_name: str
    item_code: str | None
    barcode: str | None
    stock_qty: float
    mrp: float | None
    category: str | None
    subcategory: str | None
    warehouse: str | None
    uom_name: str | None
    relevance_score: float
    match_type: str  # 'exact_barcode', 'partial_barcode', 'exact_code', 'name_prefix', 'name_contains', 'fuzzy'
    sale_price: float | None = None
    manual_barcode: str | None = None
    unit2_barcode: str | None = None
    unit_m_barcode: str | None = None
    batch_id: int | str | None = None


@dataclass
class SearchResponse:
    """Paginated search response"""

    items: list[SearchResult]
    total: int
    page: int
    page_size: int
    has_more: bool
    query: str


class SearchService:
    """
    Optimized search service with relevance scoring.

    Features:
    - Exact barcode matching prioritized (scanner use case)
    - Fuzzy matching for partial inputs
    - Pagination for large result sets
    - Redis caching for repeat queries (optional)
    """

    # Scoring weights
    EXACT_BARCODE_SCORE = 1000
    PARTIAL_BARCODE_SCORE = 500
    EXACT_CODE_SCORE = 400
    NAME_PREFIX_SCORE = 300
    NAME_CONTAINS_SCORE = 200

    # Search limits
    MAX_CANDIDATES = 200  # Max items to fetch for scoring
    MIN_QUERY_LENGTH = 2  # Minimum chars before search

    def __init__(self, db: AsyncIOMotorDatabase, cache: Any | None = None):
        self.db = db
        self.cache = cache  # Optional Redis cache

    async def search(
        self,
        query: str,
        page: int = 1,
        page_size: int = 20,
        search_fields: list[str] | None = None,
    ) -> SearchResponse:
        """
        Execute optimized search with relevance scoring.

        Args:
            query: Search query (barcode, name, or code)
            page: Page number (1-indexed)
            page_size: Items per page (max 50)
            search_fields: Optional field filter (default: all)

        Returns:
            SearchResponse with scored and paginated results
        """
        query = query.strip()

        # Empty or too short query
        if len(query) < self.MIN_QUERY_LENGTH:
            return SearchResponse(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                has_more=False,
                query=query,
            )

        # Clamp page_size
        page_size = min(max(1, page_size), 50)

        # Try cache first (Redis or local memory cache)
        cache_key = f"search:{query}:{page}:{page_size}"
        if self.cache:
            try:
                cached = await self.cache.get(cache_key)
                if cached:
                    logger.debug(f"Cache hit for query: {query}")
                    return cached
            except Exception as e:
                logger.warning(f"Cache read failed: {e}")
        elif hasattr(self, "_memory_cache") and cache_key in self._memory_cache:
            timestamp, cached_res = self._memory_cache[cache_key]
            import time

            if time.time() - timestamp < 60:
                return cached_res

        # Determine if this looks like a barcode (numeric, 6+ digits)
        is_barcode_query = query.isdigit() and len(query) >= 6

        # Build MongoDB query
        mongo_query = self._build_query(query, is_barcode_query, search_fields)

        # Fetch candidates
        candidates = await self._fetch_candidates(mongo_query)

        # Score and rank candidates
        scored_items = self._score_candidates(candidates, query, is_barcode_query)

        # Paginate
        total = len(scored_items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_items = scored_items[start_idx:end_idx]

        response = SearchResponse(
            items=page_items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=end_idx < total,
            query=query,
        )

        # Cache result (Redis or in-memory)
        if self.cache and total > 0:
            try:
                await self.cache.setex(cache_key, 60, response)
            except Exception as e:
                logger.warning(f"Cache write failed: {e}")
        elif total > 0:
            if not hasattr(self, "_memory_cache"):
                self._memory_cache = {}
            import time

            # Maintain simple 200-item LRU
            if len(self._memory_cache) > 200:
                self._memory_cache.clear()
            self._memory_cache[cache_key] = (time.time(), response)

        return response

    def _build_query(
        self,
        query: str,
        is_barcode: bool,
        search_fields: list[str] | None = None,
    ) -> dict:
        """Build MongoDB query for candidate fetching"""

        fields = search_fields or [
            "barcode",
            "manual_barcode",
            "unit2_barcode",
            "unit_m_barcode",
            "item_code",
            "item_name",
        ]

        if is_barcode:
            # Prioritize exact and prefix barcode matches across all barcode fields
            return {
                "$or": [
                    {"barcode": query},
                    {"manual_barcode": query},
                    {"unit2_barcode": query},
                    {"unit_m_barcode": query},
                    {"barcode": {"$regex": f"^{query}"}},
                    {"item_code": query},
                    {"item_name": {"$regex": query, "$options": "i"}},
                ]
            }

        # Text search for names and codes
        or_conditions = []

        if "barcode" in fields:
            or_conditions.append({"barcode": {"$regex": re.escape(query), "$options": "i"}})
            or_conditions.append({"manual_barcode": {"$regex": re.escape(query), "$options": "i"}})
            or_conditions.append({"unit2_barcode": {"$regex": re.escape(query), "$options": "i"}})
            or_conditions.append({"unit_m_barcode": {"$regex": re.escape(query), "$options": "i"}})

        if "item_code" in fields:
            or_conditions.append({"item_code": {"$regex": re.escape(query), "$options": "i"}})

        if "item_name" in fields:
            # Exact substring match
            or_conditions.append({"item_name": {"$regex": re.escape(query), "$options": "i"}})

            # Out-of-order multi-token word search (e.g., "HAIER 43" matching "HAIER LED TV 43S800QT")
            tokens = [re.escape(w) for w in query.strip().split() if len(w) > 1]
            if len(tokens) > 1:
                token_and_condition = {
                    "$and": [{"item_name": {"$regex": t, "$options": "i"}} for t in tokens]
                }
                or_conditions.append(token_and_condition)

        return {"$or": or_conditions} if or_conditions else {}

    async def _fetch_candidates(self, query: dict) -> list[dict]:
        """Fetch candidate items from MongoDB"""

        if not query:
            return []

        try:
            cursor = self.db.erp_items.find(query).limit(self.MAX_CANDIDATES)
            candidates = await cursor.to_list(length=self.MAX_CANDIDATES)
            return candidates
        except Exception as e:
            logger.error(f"Failed to fetch candidates: {e}")
            return []

    def _score_candidates(
        self,
        candidates: list[dict],
        query: str,
        is_barcode: bool,
    ) -> list[SearchResult]:
        """Score and rank candidates by relevance, removing true duplicates"""

        scored = []
        seen_items: set[tuple[str, str, str]] = set()
        query_lower = query.lower()
        tokens = [w for w in query_lower.split() if len(w) > 1]

        for item in candidates:
            score, match_type = self._calculate_score(item, query, query_lower, tokens, is_barcode)

            if score > 0:
                barcode = str(item.get("barcode", ""))
                item_code = str(item.get("item_code", ""))
                mrp = str(item.get("mrp", ""))
                dedup_key = (barcode, item_code, mrp)

                if dedup_key in seen_items:
                    continue
                seen_items.add(dedup_key)

                scored.append(
                    SearchResult(
                        id=str(item.get("_id", "")),
                        item_name=item.get("item_name", ""),
                        item_code=item.get("item_code"),
                        barcode=item.get("barcode"),
                        stock_qty=float(item.get("stock_qty", 0.0)),
                        mrp=item.get("mrp"),
                        sale_price=item.get("sale_price"),
                        category=item.get("category"),
                        subcategory=item.get("subcategory"),
                        warehouse=item.get("warehouse"),
                        uom_name=item.get("uom_name"),
                        manual_barcode=item.get("manual_barcode"),
                        unit2_barcode=item.get("unit2_barcode"),
                        unit_m_barcode=item.get("unit_m_barcode"),
                        batch_id=item.get("batch_id"),
                        relevance_score=score,
                        match_type=match_type,
                    )
                )

        scored.sort(key=lambda x: (0 if x.stock_qty > 0 else 1, -x.relevance_score, x.item_name))

        return scored

    def _calculate_score(
        self,
        item: dict,
        query: str,
        query_lower: str,
        tokens: list[str],
        is_barcode: bool,
    ) -> tuple[float, str]:
        """
        Calculate relevance score for an item.

        Returns:
            Tuple of (score, match_type)
        """
        barcodes = [
            str(item.get("barcode", "")),
            str(item.get("manual_barcode", "")),
            str(item.get("unit2_barcode", "")),
            str(item.get("unit_m_barcode", "")),
        ]
        item_code = str(item.get("item_code", ""))
        item_name = item.get("item_name", "")
        name_lower = item_name.lower()

        # Priority 1: Exact barcode match across any barcode field
        if any(b == query for b in barcodes if b):
            return (self.EXACT_BARCODE_SCORE, "exact_barcode")

        # Priority 2: Partial barcode match (prefix)
        if any(b.startswith(query) for b in barcodes if b):
            return (self.PARTIAL_BARCODE_SCORE + 50, "partial_barcode")

        # Priority 3: Barcode contains query
        if is_barcode and any(query in b for b in barcodes if b):
            return (self.PARTIAL_BARCODE_SCORE + 25, "partial_barcode")

        # Priority 4: Exact item_code match
        if item_code.lower() == query_lower:
            return (self.EXACT_CODE_SCORE, "exact_code")

        # Priority 5: Name prefix match
        if name_lower.startswith(query_lower):
            position_bonus = 50
            return (self.NAME_PREFIX_SCORE + position_bonus, "name_prefix")

        # Priority 6: Name contains full query substring
        if query_lower in name_lower:
            position = name_lower.index(query_lower)
            position_bonus = max(0, 50 - position)
            return (self.NAME_CONTAINS_SCORE + position_bonus, "name_contains")

        # Priority 6.5: Tokenized multi-word match (out-of-order words)
        if len(tokens) > 1 and all(t in name_lower for t in tokens):
            return (250.0, "token_match")

        # Priority 7: Fuzzy match on name using WRatio
        fuzzy_score = fuzz.WRatio(query_lower, name_lower)
        if fuzzy_score >= 75:
            return (fuzzy_score, "fuzzy")

        # No match
        return (0, "none")

    async def get_suggestions(
        self,
        prefix: str,
        limit: int = 5,
    ) -> list[str]:
        """
        Get autocomplete suggestions for a prefix.

        Args:
            prefix: Search prefix
            limit: Max suggestions to return

        Returns:
            List of suggested item names/barcodes
        """
        if len(prefix) < 3:
            return []

        try:
            # Get name suggestions
            pipeline: list[dict[str, Any]] = [
                {"$match": {"item_name": {"$regex": f"^{prefix}", "$options": "i"}}},
                {"$group": {"_id": "$item_name"}},
                {"$limit": limit},
            ]
            cursor = self.db.erp_items.aggregate(pipeline)
            results = await cursor.to_list(length=limit)
            return [r["_id"] for r in results]
        except Exception as e:
            logger.error(f"Failed to get suggestions: {e}")
            return []


# Singleton instance (initialized with db in server startup)
_search_service: SearchService | None = None


def get_search_service() -> SearchService:
    """Get the search service singleton, lazily initializing if needed.

    The startup hook should call ``init_search_service`` with the database.
    However, in some dev runs (hot reloads, missing startup), the singleton
    can be empty, which previously caused a 503 ("Search service unavailable").
    We now attempt a best-effort lazy init from the active DB to avoid hard
    failures. If DB is unavailable, we still surface a RuntimeError.
    """
    global _search_service

    if _search_service is None:
        try:
            from backend.db.runtime import get_db

            db = get_db()
            _search_service = SearchService(db)
            logger.warning("SearchService lazily initialized at runtime")
        except Exception as exc:
            raise RuntimeError(
                "SearchService not initialized. Call init_search_service first."
            ) from exc

    return _search_service


def init_search_service(db: AsyncIOMotorDatabase, cache: Any | None = None) -> SearchService:
    """Initialize the search service singleton"""
    global _search_service
    _search_service = SearchService(db, cache)
    return _search_service
