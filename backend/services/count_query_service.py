"""Read-side persistence helpers for count-line APIs."""

from __future__ import annotations

import inspect
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId

from backend.db.runtime import get_db
from backend.services.canonical_inventory import (
    is_count_line_effectively_reviewed,
    materialize_count_line_review_state,
)


class CountQueryService:
    def __init__(self, database: Any) -> None:
        self._database = database

    @property
    def database(self) -> Any:
        return self._database

    async def _resolve(self, value: Any) -> Any:
        return await value if inspect.isawaitable(value) else value

    async def find_erp_item(
        self, *, barcode: Optional[str] = None, item_code: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        erp_item = None
        if barcode:
            erp_item = await self._resolve(self._database.erp_items.find_one({"barcode": barcode}))
        if not erp_item and item_code:
            erp_item = await self._resolve(
                self._database.erp_items.find_one({"item_code": item_code})
            )
        return erp_item

    async def resolve_item_name_for_draft(self, line_data: Any) -> Optional[str]:
        if line_data.item_name:
            return line_data.item_name
        erp_item = await self.find_erp_item(
            barcode=line_data.barcode,
            item_code=line_data.item_code,
        )
        item_name = erp_item.get("item_name") if erp_item else None
        return item_name or None

    async def find_idempotent_count_line(
        self, session_id: str, idempotency_key: str
    ) -> Optional[dict[str, Any]]:
        return await self._database.count_lines.find_one(
            {
                "session_id": session_id,
                "idempotency_key": idempotency_key,
            }
        )

    async def get_erp_item_for_existing_count_line(
        self, count_line: dict[str, Any]
    ) -> dict[str, Any]:
        erp_item = await self.find_erp_item(
            barcode=count_line.get("barcode"),
            item_code=count_line.get("item_code"),
        )
        if erp_item:
            return erp_item

        item_code = count_line.get("item_code")
        return {
            "item_code": item_code,
            "item_name": count_line.get("item_name"),
            "category": count_line.get("category_correction"),
            "mrp": count_line.get("mrp_erp"),
            "sale_price": count_line.get("mrp_erp"),
            "sales_price": count_line.get("mrp_erp"),
        }

    async def find_count_line(self, line_id: str) -> Optional[dict[str, Any]]:
        count_line = await self._database.count_lines.find_one({"id": line_id})
        if count_line:
            return count_line
        try:
            return await self._database.count_lines.find_one({"_id": ObjectId(line_id)})
        except (InvalidId, RuntimeError, TypeError, ValueError, OSError):
            return None

    async def list_count_lines_for_item(
        self, session_id: str, item_code: str
    ) -> list[dict[str, Any]]:
        cursor = self._database.count_lines.find(
            {"session_id": session_id, "item_code": item_code}
        )
        return await cursor.to_list(length=None)

    async def find_serial_count_line(
        self,
        *,
        session_id: str,
        serial_number: str,
        projection: dict[str, int],
    ) -> Optional[dict[str, Any]]:
        return await self._database.count_lines.find_one(
            {
                "session_id": session_id,
                "$or": [
                    {"serial_numbers": serial_number},
                    {"serial_entries.serial_number": serial_number},
                ],
            },
            projection,
        )

    async def get_count_lines(
        self,
        *,
        session_id: str,
        page: int,
        page_size: int,
        verified: Optional[bool],
    ) -> dict[str, Any]:
        if verified is None:
            skip = (page - 1) * page_size
            total = await self._database.count_lines.count_documents({"session_id": session_id})
            lines_cursor = (
                self._database.count_lines.find({"session_id": session_id}, {"_id": 0})
                .sort("counted_at", -1)
                .skip(skip)
                .limit(page_size)
            )
            lines = await lines_cursor.to_list(length=page_size)
            projected_lines = [materialize_count_line_review_state(line) for line in lines]
            return {
                "items": projected_lines,
                "pagination": {
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                    "total_pages": (total + page_size - 1) // page_size if page_size else 0,
                    "has_next": skip + page_size < total,
                    "has_prev": page > 1,
                },
            }

        lines_cursor = self._database.count_lines.find(
            {"session_id": session_id}, {"_id": 0}
        ).sort("counted_at", -1)
        lines = await lines_cursor.to_list(length=None)
        projected_lines = [materialize_count_line_review_state(line) for line in lines]
        projected_lines = [
            line
            for line in projected_lines
            if is_count_line_effectively_reviewed(line) == verified
        ]

        total = len(projected_lines)
        skip = (page - 1) * page_size
        lines_page = projected_lines[skip : skip + page_size]
        return {
            "items": lines_page,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
                "has_next": skip + page_size < total,
                "has_prev": page > 1,
            },
        }

    async def list_count_lines(
        self,
        *,
        filter_query: dict[str, Any],
        page: int,
        page_size: int,
    ) -> dict[str, Any]:
        skip = (page - 1) * page_size
        total = await self._database.count_lines.count_documents(filter_query)
        lines_cursor = (
            self._database.count_lines.find(filter_query, {"_id": 0})
            .sort("counted_at", -1)
            .skip(skip)
            .limit(page_size)
        )
        lines = await lines_cursor.to_list(page_size)
        lines = [materialize_count_line_review_state(line) for line in lines]
        total_pages = (total + page_size - 1) // page_size if page_size else 0
        return {
            "items": lines,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": total_pages,
                "has_next": skip + page_size < total,
                "has_prev": page > 1,
            },
        }

    async def find_count_lines_by_query(
        self, query: dict[str, Any], *, length: int
    ) -> list[dict[str, Any]]:
        return await self._database.count_lines.find(query).to_list(length=length)

    async def load_item_batches(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        cursor = self._database.erp_items.find(query)
        return await cursor.to_list(length=100)

    async def find_count_line_by_id_field(self, line_id: str) -> Optional[dict[str, Any]]:
        return await self._database.count_lines.find_one({"id": line_id})


def get_count_query_service(database: Any | None = None) -> CountQueryService:
    return CountQueryService(database or get_db())
