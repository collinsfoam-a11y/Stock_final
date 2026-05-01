"""Persistence service for item verification endpoints."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator


class ItemVerificationService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def find_item_by_barcode_or_code(self, barcode: str) -> dict[str, Any] | None:
        item = await self._database.erp_items.find_one({"barcode": barcode})
        if item:
            return item
        return await self._database.erp_items.find_one({"item_code": barcode})

    async def insert_master_update_audit_log(self, document: dict[str, Any]) -> None:
        await self._database.audit_logs.insert_one(document)

    async def insert_conflict_fork(self, document: dict[str, Any]) -> None:
        await self._database.conflict_forks.insert_one(document)

    async def update_erp_item(
        self, update_filter: dict[str, Any], update_doc: dict[str, Any]
    ) -> Any:
        return await self._database.erp_items.update_one(update_filter, update_doc)

    async def fetch_updated_item(
        self,
        update_filter: dict[str, Any],
        actual_barcode: str | None,
    ) -> dict[str, Any] | None:
        updated_item = await self._database.erp_items.find_one(update_filter)
        if not updated_item and actual_barcode:
            updated_item = await self._database.erp_items.find_one({"barcode": actual_barcode})
        return updated_item

    async def insert_verification_log(self, document: dict[str, Any]) -> None:
        await self._database.verification_logs.insert_one(document)

    async def insert_item_variance(self, document: dict[str, Any]) -> None:
        await self._database.item_variances.insert_one(document)

    async def get_filtered_items(
        self,
        *,
        filter_query: dict[str, Any],
        verified_filter: dict[str, Any],
        skip: int,
        limit: int,
    ) -> tuple[list[dict[str, Any]], int, int]:
        items_task = (
            self._database.erp_items.find(filter_query, {"_id": 0})
            .skip(skip)
            .limit(limit)
            .to_list(length=limit)
        )
        total_count_task = self._database.erp_items.count_documents(filter_query)
        verified_count_task = self._database.erp_items.count_documents(verified_filter)
        return await asyncio.gather(
            items_task,
            total_count_task,
            verified_count_task,
        )

    async def sync_items(
        self,
        *,
        query: dict[str, Any],
        projection: dict[str, int],
        limit: int,
    ) -> list[dict[str, Any]]:
        cursor = (
            self._database.erp_items.find(query, projection)
            .sort("last_scanned_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)

    async def iter_item_export_rows(
        self,
        *,
        filter_query: dict[str, Any],
        max_rows: int,
    ) -> AsyncIterator[dict[str, Any]]:
        cursor = self._database.erp_items.find(filter_query).limit(max_rows)
        count = 0
        async for item in cursor:
            if count >= max_rows:
                break
            yield item
            count += 1

    async def fetch_item_export_rows(
        self,
        *,
        filter_query: dict[str, Any],
        max_rows: int,
    ) -> list[dict[str, Any]]:
        return (
            await self._database.erp_items.find(filter_query)
            .limit(max_rows)
            .to_list(length=max_rows)
        )

    async def get_variances(
        self,
        *,
        filter_query: dict[str, Any],
        skip: int,
        limit: int,
    ) -> tuple[list[dict[str, Any]], int]:
        total_count = await self._database.count_lines.count_documents(filter_query)
        cursor = (
            self._database.count_lines.find(filter_query)
            .sort("counted_at", -1)
            .skip(skip)
            .limit(limit)
        )
        variances = await cursor.to_list(length=limit)
        return variances, total_count

    async def fetch_variance_export_rows(
        self,
        *,
        filter_query: dict[str, Any],
        max_rows: int,
    ) -> list[dict[str, Any]]:
        return await (
            self._database.item_variances.find(filter_query)
            .sort("verified_at", -1)
            .limit(max_rows)
            .to_list(length=max_rows)
        )

    async def get_live_users(self) -> list[dict[str, Any]]:
        one_hour_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)
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
        return await self._database.erp_items.aggregate(pipeline).to_list(length=1000)

    async def get_live_verifications(self, *, limit: int) -> list[dict[str, Any]]:
        cursor = (
            self._database.erp_items.find(
                {
                    "verified": True,
                    "verified_at": {"$exists": True},
                }
            )
            .sort("verified_at", -1)
            .limit(limit)
        )
        return await cursor.to_list(length=limit)
