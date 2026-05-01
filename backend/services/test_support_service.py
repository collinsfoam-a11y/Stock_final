"""Service boundary for guarded test-support fixture operations."""

from __future__ import annotations

from typing import Any, Optional

from backend.db.runtime import get_db
from backend.services.governance_guard import write_authority


class TestSupportService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def resolve_session_ids(
        self, query: dict[str, Any], explicit_session_ids: set[str]
    ) -> list[str]:
        session_ids = set(explicit_session_ids)
        if not query:
            return sorted(session_ids)
        async for session in self._database.sessions.find(query, {"id": 1, "session_id": 1}):
            if session.get("id"):
                session_ids.add(str(session["id"]))
            if session.get("session_id"):
                session_ids.add(str(session["session_id"]))
        return sorted(session_ids)

    async def resolve_count_line_ids(
        self, query: dict[str, Any], explicit_count_line_ids: set[str]
    ) -> list[str]:
        count_line_ids = set(explicit_count_line_ids)
        if not query:
            return sorted(count_line_ids)
        async for line in self._database.count_lines.find(query, {"id": 1}):
            if line.get("id"):
                count_line_ids.add(str(line["id"]))
        return sorted(count_line_ids)

    async def apply_runtime_scope(
        self,
        *,
        collection_name: str,
        query: dict[str, Any],
        metadata: dict[str, Any],
    ) -> int:
        result = await self._database[collection_name].update_many(query, {"$set": metadata})
        return int(getattr(result, "modified_count", 0))

    async def fetch_collection_documents(
        self,
        collection_name: str,
        query: dict[str, Any],
        *,
        sort_field: Optional[str],
        limit: int,
    ) -> list[dict[str, Any]]:
        if not query:
            return []
        cursor = self._database[collection_name].find(query)
        if sort_field:
            cursor = cursor.sort(sort_field, -1)
        return await cursor.limit(limit).to_list(length=limit)

    async def delete_collection_documents(
        self, collection_name: str, query: dict[str, Any]
    ) -> int:
        result = await self._database[collection_name].delete_many(query)
        return int(getattr(result, "deleted_count", 0))

    async def upsert_erp_item(
        self,
        *,
        item_code: str,
        document: dict[str, Any],
        set_on_insert: dict[str, Any],
    ) -> dict[str, Any] | None:
        with write_authority("TestSupportAPI"):
            await self._database.erp_items.update_one(
                {"item_code": item_code},
                {"$set": document, "$setOnInsert": set_on_insert},
                upsert=True,
            )
        return await self._database.erp_items.find_one({"item_code": item_code})

    async def get_erp_item(self, item_code: str) -> dict[str, Any] | None:
        return await self._database.erp_items.find_one({"item_code": item_code})

    async def patch_erp_item(
        self, *, item_code: str, update_data: dict[str, Any]
    ) -> dict[str, Any] | None:
        with write_authority("TestSupportAPI"):
            await self._database.erp_items.update_one(
                {"item_code": item_code}, {"$set": update_data}
            )
        return await self.get_erp_item(item_code)

    async def replace_variance_fixture(
        self, *, filter_query: dict[str, Any], variance_doc: dict[str, Any]
    ) -> None:
        await self._database.item_variances.delete_many(filter_query)
        await self._database.verification_logs.delete_many(filter_query)
        await self._database.item_variances.insert_one(dict(variance_doc))
        await self._database.verification_logs.insert_one(dict(variance_doc))


def get_test_support_service() -> TestSupportService:
    return TestSupportService(get_db())
