"""
User Preferences Model
"""

from pydantic import BaseModel, ConfigDict, Field

from backend.models.user import PyObjectId


class UserPreferencesBase(BaseModel):
    theme: str = "system"  # system, light, dark
    font_scale: float = 1.0
    primary_color: str = "#007AFF"
    enable_haptic_feedback: bool = True
    enable_sound_effects: bool = True


class UserPreferencesCreate(UserPreferencesBase):
    user_id: PyObjectId


class UserPreferencesUpdate(BaseModel):
    theme: str | None = None
    font_scale: float | None = None
    primary_color: str | None = None
    enable_haptic_feedback: bool | None = None
    enable_sound_effects: bool | None = None


class UserPreferencesInDB(UserPreferencesBase):
    id: PyObjectId | None = Field(default_factory=PyObjectId, alias="_id")
    user_id: PyObjectId

    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
