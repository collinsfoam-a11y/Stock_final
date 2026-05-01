"""Service boundary for user settings persistence."""

from __future__ import annotations

from typing import Any

from backend.db.runtime import get_db
from backend.models.audit import AuditEventType, AuditLogStatus
from backend.services.audit_service import AuditService


class UserSettingsService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_settings(self, user_id: str) -> dict[str, Any] | None:
        return await self._database.user_settings.find_one({"user_id": user_id})

    async def save_settings(
        self,
        *,
        user_id: str,
        update_data: dict[str, Any],
        default_settings: dict[str, Any],
        existing: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if existing:
            await self._database.user_settings.update_one(
                {"user_id": user_id},
                {"$set": update_data},
            )
        else:
            new_settings = {
                "user_id": user_id,
                **default_settings,
                **update_data,
                "created_at": update_data["updated_at"],
            }
            await self._database.user_settings.insert_one(new_settings)
        return await self.get_settings(user_id)

    async def reset_settings(self, *, user_id: str) -> int:
        result = await self._database.user_settings.delete_one({"user_id": user_id})
        return int(getattr(result, "deleted_count", 0))

    async def log_settings_update(
        self,
        *,
        actor_id: str,
        actor_username: str,
        details: dict[str, Any],
    ) -> None:
        await AuditService(self._database).log_event(
            event_type=AuditEventType.USER_SETTINGS_UPDATE,
            status=AuditLogStatus.SUCCESS,
            actor_id=actor_id,
            actor_username=actor_username,
            details=details,
        )


def get_user_settings_service() -> UserSettingsService:
    return UserSettingsService(get_db())
