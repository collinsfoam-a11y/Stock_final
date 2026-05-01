"""Mongo-backed mapping configuration persistence."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.db.runtime import get_db


class MappingConfigService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def save_mapping(
        self,
        *,
        mapping: dict[str, Any],
        connection: dict[str, Any],
        username: str | None,
        encrypted_password: str | None,
    ) -> None:
        set_data: dict[str, Any] = {
            "mapping": mapping,
            "updated_at": datetime.now(),
            "updated_by": username,
        }

        if connection:
            for key, value in connection.items():
                if key == "password":
                    continue
                set_data[f"connection.{key}"] = value
            if encrypted_password:
                set_data["connection.password_encrypted"] = encrypted_password
                set_data["connection.has_password"] = True

        update_op: dict[str, Any] = {"$set": set_data}
        if encrypted_password:
            update_op["$unset"] = {"connection.password": ""}

        await self._database.config.update_one(
            {"_id": "erp_mapping"},
            update_op,
            upsert=True,
        )

    async def get_current_mapping(self) -> dict[str, Any] | None:
        return await self._database.config.find_one({"_id": "erp_mapping"})


def get_mapping_config_service() -> MappingConfigService:
    return MappingConfigService(get_db())
