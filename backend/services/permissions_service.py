"""Service layer for user permission mutations."""

from __future__ import annotations

from typing import Any

from backend.auth.permissions import (
    add_permissions_to_user,
    disable_permissions_for_user,
    enable_permissions_for_user,
    remove_permissions_from_user,
)
from backend.db.runtime import get_db
from backend.services.activity_log import ActivityLogService


class PermissionsService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_user(self, username: str) -> dict[str, Any] | None:
        return await self._database.users.find_one({"username": username})

    async def add_user_permissions(self, username: str, permissions: list[str]) -> bool:
        return await add_permissions_to_user(self._database, username, permissions)

    async def remove_user_permissions(self, username: str, permissions: list[str]) -> bool:
        return await remove_permissions_from_user(self._database, username, permissions)

    async def disable_user_permissions(self, username: str, permissions: list[str]) -> bool:
        return await disable_permissions_for_user(self._database, username, permissions)

    async def enable_user_permissions(self, username: str, permissions: list[str]) -> bool:
        return await enable_permissions_for_user(self._database, username, permissions)

    async def log_permission_change(
        self,
        *,
        current_user: dict[str, Any],
        action: str,
        username: str,
        permissions: list[str],
    ) -> None:
        await ActivityLogService(self._database).log_activity(
            user=current_user["username"],
            role=current_user["role"],
            action=action,
            entity_type="user",
            entity_id=username,
            details={"permissions": permissions},
        )


def get_permissions_service() -> PermissionsService:
    return PermissionsService(get_db())
