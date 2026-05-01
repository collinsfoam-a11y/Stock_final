"""Service layer for user preferences."""

from __future__ import annotations

from typing import Any

from backend.db.runtime import get_db
from backend.models.preferences import (
    UserPreferencesBase,
    UserPreferencesCreate,
    UserPreferencesUpdate,
)


class UserPreferencesService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_preferences(self, user_id: str) -> dict[str, Any] | None:
        return await self._database.user_preferences.find_one({"user_id": user_id})

    async def upsert_preferences(
        self,
        *,
        user_id: str,
        preferences: UserPreferencesUpdate,
    ) -> dict[str, Any] | None:
        existing = await self._database.user_preferences.find_one({"user_id": user_id})
        update_data = preferences.model_dump(exclude_unset=True)

        if existing:
            await self._database.user_preferences.update_one(
                {"_id": existing["_id"]},
                {"$set": update_data},
            )
            return await self._database.user_preferences.find_one({"_id": existing["_id"]})

        base_defaults = UserPreferencesBase().model_dump()
        merged = {**base_defaults, **update_data}
        new_prefs = UserPreferencesCreate(user_id=user_id, **merged)
        result = await self._database.user_preferences.insert_one(new_prefs.model_dump())
        return await self._database.user_preferences.find_one({"_id": result.inserted_id})


def get_user_preferences_service() -> UserPreferencesService:
    return UserPreferencesService(get_db())
