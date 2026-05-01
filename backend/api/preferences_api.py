"""
User Preferences API
"""

from fastapi import APIRouter, Depends, HTTPException

from backend.auth.dependencies import get_current_user
from backend.models.preferences import (
    UserPreferencesBase,
    UserPreferencesInDB,
    UserPreferencesUpdate,
)
from backend.services.user_preferences_service import (
    UserPreferencesService,
    get_user_preferences_service,
)

router = APIRouter()


@router.get("/users/me/preferences", response_model=UserPreferencesInDB)
async def get_my_preferences(
    current_user: dict = Depends(get_current_user),
    preferences_service: UserPreferencesService = Depends(get_user_preferences_service),
):
    """Get current user's preferences."""
    user_id = current_user["_id"]

    # Try to find existing preferences
    prefs = await preferences_service.get_preferences(user_id)

    if prefs:
        return UserPreferencesInDB(**prefs)

    # Return defaults if not found
    return UserPreferencesInDB(user_id=user_id, **UserPreferencesBase().model_dump())


@router.put("/users/me/preferences", response_model=UserPreferencesInDB)
async def update_my_preferences(
    preferences: UserPreferencesUpdate,
    current_user: dict = Depends(get_current_user),
    preferences_service: UserPreferencesService = Depends(get_user_preferences_service),
):
    """Update current user's preferences."""
    user_id = current_user["_id"]

    updated = await preferences_service.upsert_preferences(
        user_id=user_id,
        preferences=preferences,
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update preferences")
    return UserPreferencesInDB(**updated)
