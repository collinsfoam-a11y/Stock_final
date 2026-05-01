"""Persistence helpers for master settings endpoints."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from backend.core.schemas.config_version import ConfigVersion
from backend.db.runtime import get_db


class MasterSettingsService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_parameters(self) -> dict[str, Any] | None:
        settings_doc = await self._database.system_settings.find_one({"_id": "parameters"})
        if settings_doc:
            settings_doc.pop("_id", None)
        return settings_doc

    async def update_parameters(
        self,
        *,
        params_dict: dict[str, Any],
        username: str,
    ) -> ConfigVersion:
        params_dict["_id"] = "parameters"
        params_dict["updated_by"] = username
        params_dict["updated_at"] = datetime.now().isoformat()

        await self._database.system_settings.replace_one(
            {"_id": "parameters"}, params_dict, upsert=True
        )

        payload_str = json.dumps(params_dict, sort_keys=True, default=str)
        version_hash = hashlib.sha256(payload_str.encode()).hexdigest()
        config_version = ConfigVersion(
            version_hash=version_hash,
            payload=params_dict,
            created_by=username,
            description="Manual update via Admin API",
        )

        await self._database.config_versions.insert_one(config_version.model_dump())
        await self._database.audit_logs.insert_one(
            {
                "action": "update_system_parameters",
                "user": username,
                "timestamp": datetime.now().isoformat(),
                "changes": params_dict,
                "config_version_id": config_version.id,
            }
        )
        return config_version

    async def reset_parameters(
        self,
        *,
        category: str | None,
        default_params: dict[str, Any],
        username: str,
    ) -> None:
        if category:
            current = await self._database.system_settings.find_one({"_id": "parameters"})
            if current:
                for key, value in default_params.items():
                    if key.startswith(category + "_"):
                        current[key] = value

                current["updated_by"] = username
                current["updated_at"] = datetime.now().isoformat()
                await self._database.system_settings.replace_one({"_id": "parameters"}, current)
            else:
                default_params["_id"] = "parameters"
                default_params["updated_by"] = username
                default_params["updated_at"] = datetime.now().isoformat()
                await self._database.system_settings.insert_one(default_params)
        else:
            default_params["_id"] = "parameters"
            default_params["updated_by"] = username
            default_params["updated_at"] = datetime.now().isoformat()
            await self._database.system_settings.replace_one(
                {"_id": "parameters"}, default_params, upsert=True
            )


def get_master_settings_service() -> MasterSettingsService:
    return MasterSettingsService(get_db())
