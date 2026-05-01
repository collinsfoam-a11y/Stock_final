"""Mongo persistence helpers for ERP item utility flows."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.services.governance_guard import write_authority


class ERPItemDataService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_erp_config(self) -> dict[str, Any] | None:
        return await self._database.erp_config.find_one({})

    async def find_by_barcode(self, barcode: str) -> dict[str, Any] | None:
        return await self._database.erp_items.find_one({"barcode": barcode})

    async def find_by_item_code(self, item_code: str) -> dict[str, Any] | None:
        return await self._database.erp_items.find_one({"item_code": item_code})

    async def upsert_item(self, item_code: str, item_data: dict[str, Any]) -> None:
        with write_authority("ERPWriteService"):
            await self._database.erp_items.update_one(
                {"item_code": item_code},
                {
                    "$set": item_data,
                    "$setOnInsert": {
                        "created_at": datetime.now(timezone.utc).replace(tzinfo=None)
                    },
                },
                upsert=True,
            )

    async def search_items(self, query: dict[str, Any], limit: int = 50) -> list[dict[str, Any]]:
        cursor = self._database.erp_items.find(query).limit(limit)
        return await cursor.to_list(length=limit)
