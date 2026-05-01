"""Read-side helpers for enhanced item endpoints."""

from __future__ import annotations

from typing import Any, Optional

from bson import ObjectId

from backend.services.canonical_inventory import build_session_lookup
from backend.services.database_manager import DatabaseManager
from backend.db.runtime import get_db
from backend.utils.erp_utils import _get_barcode_variations


class EnhancedItemQueryService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def resolve_lookup_context(
        self, session_id: Optional[str], rack_no: Optional[str]
    ) -> tuple[Optional[str], Optional[str]]:
        context_rack = rack_no.strip().upper() if rack_no else None
        context_floor = None
        if not session_id:
            return context_floor, context_rack

        session = await self._database.sessions.find_one(build_session_lookup(session_id))
        if not session:
            return context_floor, context_rack

        if not context_rack and session.get("rack"):
            context_rack = str(session.get("rack")).strip().upper()
        if session.get("floor"):
            context_floor = str(session.get("floor")).strip().upper()
        return context_floor, context_rack

    async def find_item_by_lookup(self, lookup_query: dict[str, Any]) -> Optional[dict[str, Any]]:
        return await self._database.erp_items.find_one(lookup_query)

    async def list_items(
        self,
        query: dict[str, Any],
        *,
        page: int,
        page_size: int,
        search: Optional[str],
        scorer: Any,
    ) -> tuple[list[dict[str, Any]], int]:
        if not search:
            total = await self._database.erp_items.count_documents(query)
            skip = (page - 1) * page_size
            items = await self._database.erp_items.find(query).skip(skip).limit(page_size).to_list(
                length=page_size
            )
            return items, total

        candidates = await self._database.erp_items.find(query).limit(200).to_list(length=200)
        scored_candidates = []
        for item in candidates:
            name_score = scorer.partial_ratio(search.lower(), item.get("item_name", "").lower())
            code_score = scorer.ratio(search.lower(), str(item.get("item_code", "")).lower())
            barcode_score = scorer.ratio(search.lower(), str(item.get("barcode", "")).lower())
            scored_candidates.append((max(name_score, code_score * 1.1, barcode_score * 1.2), item))

        scored_candidates.sort(key=lambda row: row[0], reverse=True)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        return [row[1] for row in scored_candidates[start_idx:end_idx]], len(candidates)

    async def semantic_candidates(self, limit: int = 500) -> list[dict[str, Any]]:
        return await self._database.erp_items.find({}).limit(limit).to_list(length=limit)

    async def get_item_by_object_id(self, item_id: str) -> Optional[dict[str, Any]]:
        return await self._database.erp_items.find_one({"_id": ObjectId(item_id)})

    async def get_item_by_code_or_barcode(self, item_code: str) -> Optional[dict[str, Any]]:
        return await self._database.erp_items.find_one(
            {"$or": [{"item_code": item_code}, {"barcode": item_code}]}
        )

    async def get_item_by_code(self, item_code: str) -> Optional[dict[str, Any]]:
        return await self._database.erp_items.find_one({"item_code": item_code})

    async def lookup_identified_items(
        self,
        identifiers: list[str],
        *,
        limit: int,
        reranker: Any,
    ) -> tuple[list[dict[str, Any]], list[str]]:
        matched_terms = []
        seen: set[str] = set()
        for value in identifiers:
            normalized = value.strip()
            key = normalized.lower()
            if normalized and key not in seen:
                matched_terms.append(normalized)
                seen.add(key)
        if not matched_terms:
            return [], []

        exact_terms: list[str] = []
        for term in matched_terms:
            exact_terms.extend(_get_barcode_variations(term))
        deduped_exact_terms = []
        seen_exact: set[str] = set()
        for value in exact_terms:
            key = value.lower()
            if value and key not in seen_exact:
                deduped_exact_terms.append(value)
                seen_exact.add(key)

        exact_matches = (
            await self._database.erp_items.find(
                {
                    "$or": [
                        {"barcode": {"$in": deduped_exact_terms}},
                        {"manual_barcode": {"$in": deduped_exact_terms}},
                        {"item_code": {"$in": deduped_exact_terms}},
                    ]
                }
            )
            .limit(limit)
            .to_list(length=limit)
        )
        if exact_matches:
            return exact_matches, deduped_exact_terms

        import re

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

        candidates = await self._database.erp_items.find({"$or": regex_clauses}).limit(250).to_list(
            length=250
        )
        if not candidates:
            return [], matched_terms
        return reranker.search_rerank(primary_query, candidates, top_k=limit), matched_terms

    async def advanced_search(
        self,
        *,
        pipeline: list[dict[str, Any]],
        count_pipeline: list[dict[str, Any]],
        limit: int,
    ) -> tuple[list[dict[str, Any]], int]:
        cursor = self._database.erp_items.aggregate(pipeline)
        results = await cursor.to_list(length=limit)
        count_result = await self._database.erp_items.aggregate(count_pipeline).to_list(1)
        total_count = count_result[0]["total"] if count_result else 0
        return results, total_count

    async def get_unique_locations(self) -> tuple[list[Any], list[Any]]:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "floors": {"$addToSet": "$floor"},
                    "racks": {"$addToSet": "$rack"},
                }
            }
        ]
        result = await self._database.erp_items.aggregate(pipeline).to_list(1)
        if not result:
            return [], []
        floors = sorted([floor for floor in result[0].get("floors", []) if floor])
        racks = sorted([rack for rack in result[0].get("racks", []) if rack])
        return floors, racks

    def create_database_manager(self, sql_connector: Any) -> DatabaseManager:
        return DatabaseManager(
            mongo_client=self._database.client,
            mongo_db=self._database,
            sql_connector=sql_connector,
        )


def get_enhanced_item_query_service() -> EnhancedItemQueryService:
    return EnhancedItemQueryService(get_db())
