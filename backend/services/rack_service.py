"""Service layer for rack registry reads and writes."""

from __future__ import annotations

import logging
import time
from typing import Any

from backend.db.runtime import get_db
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)


class RackService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_or_create_rack(self, rack_id: str, floor: str) -> dict[str, Any]:
        rack = await self._database.rack_registry.find_one({"rack_id": rack_id})
        if rack:
            return rack

        rack = {
            "rack_id": rack_id,
            "floor": floor,
            "status": "available",
            "claimed_by": None,
            "session_id": None,
            "lock_expires_at": None,
            "created_at": time.time(),
            "updated_at": time.time(),
        }
        await self._database.rack_registry.insert_one(rack)
        logger.info(
            "Created new rack: %s on %s",
            sanitize_for_logging(rack_id),
            sanitize_for_logging(floor),
        )
        return rack

    async def update_rack_status(
        self,
        rack_id: str,
        status: str,
        claimed_by: str | None = None,
        session_id: str | None = None,
        lock_expires_at: float | None = None,
    ) -> None:
        await self._database.rack_registry.update_one(
            {"rack_id": rack_id},
            {
                "$set": {
                    "status": status,
                    "claimed_by": claimed_by,
                    "session_id": session_id,
                    "lock_expires_at": lock_expires_at,
                    "updated_at": time.time(),
                }
            },
        )

    async def list_available_racks(self, floor: str | None) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"status": {"$in": ["available", "paused"]}}
        if floor:
            query["floor"] = floor
        racks = await self._database.rack_registry.find(query).sort("rack_id", 1).to_list(length=1000)
        for rack in racks:
            rack["item_count"] = await self._database.erp_items.count_documents(
                {"rack": rack["rack_id"], "floor": rack["floor"]}
            )
        return racks

    async def list_floors(self) -> list[str]:
        floors = await self._database.rack_registry.distinct("floor")
        if not floors:
            floors = [
                "Ground",
                "First",
                "Second",
                "Upper Godown",
                "Back Godown",
                "Damage Area",
            ]
        return sorted(floors)

    async def get_rack(self, rack_id: str) -> dict[str, Any] | None:
        return await self._database.rack_registry.find_one({"rack_id": rack_id})

    async def get_verification_session(self, session_id: str) -> dict[str, Any] | None:
        return await self._database.verification_sessions.find_one({"session_id": session_id})

    async def list_user_active_racks(self, user_id: str) -> list[dict[str, Any]]:
        cursor = self._database.rack_registry.find(
            {"claimed_by": user_id, "status": {"$in": ["active", "paused"]}}
        )
        return await cursor.to_list(length=100)


def get_rack_service() -> RackService:
    return RackService(get_db())
