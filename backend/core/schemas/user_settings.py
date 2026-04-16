"""
User Settings Schema

Pydantic models for user-specific app settings.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ColumnVisibilitySettings(BaseModel):
    """Per-user visibility settings for optional inventory fields."""

    mfg_date: bool = Field(default=True, description="Show manufacturing date fields")
    expiry_date: bool = Field(default=True, description="Show expiry date fields")
    serial_number: bool = Field(default=True, description="Show serial number fields")
    mrp: bool = Field(default=True, description="Show MRP fields")


class ColumnVisibilitySettingsUpdate(BaseModel):
    """Partial update model for column visibility settings."""

    mfg_date: Optional[bool] = Field(default=None, description="Show manufacturing date fields")
    expiry_date: Optional[bool] = Field(default=None, description="Show expiry date fields")
    serial_number: Optional[bool] = Field(default=None, description="Show serial number fields")
    mrp: Optional[bool] = Field(default=None, description="Show MRP fields")


class UserSettings(BaseModel):
    """User settings stored in MongoDB user_settings documents."""

    theme: Literal["light", "dark"] = Field(
        default="light",
        description="UI theme mode: light or dark",
    )
    notifications_enabled: bool = Field(
        default=True,
        description="Enable in-app notifications",
    )
    notification_sound: bool = Field(
        default=True,
        description="Play notification sounds",
    )
    notification_badge: bool = Field(
        default=True,
        description="Show notification badges",
    )
    auto_sync_enabled: bool = Field(
        default=True,
        description="Automatically sync data in the background",
    )
    auto_sync_interval: int = Field(
        default=15,
        ge=5,
        le=120,
        description="Background sync interval in minutes",
    )
    sync_on_reconnect: bool = Field(
        default=True,
        description="Retry sync automatically when connection returns",
    )
    offline_mode: bool = Field(
        default=False,
        description="Prefer offline-first app behavior",
    )
    cache_expiration: int = Field(
        default=24,
        ge=1,
        le=168,
        description="Cache expiration in hours",
    )
    max_queue_size: int = Field(
        default=1000,
        ge=100,
        le=10000,
        description="Maximum queued offline actions",
    )
    scanner_vibration: bool = Field(
        default=True,
        description="Enable vibration feedback for scanner flows",
    )
    scanner_sound: bool = Field(
        default=True,
        description="Enable sound feedback for scanner flows",
    )
    scanner_auto_submit: bool = Field(
        default=True,
        description="Auto-submit scanner results when possible",
    )
    scanner_timeout: int = Field(
        default=30,
        ge=5,
        le=120,
        description="Scanner timeout in seconds",
    )
    font_size: int = Field(
        default=16,
        ge=12,
        le=22,
        description="Preferred base font size in points",
    )
    font_style: Literal["system", "serif", "mono"] = Field(
        default="system",
        description="Preferred font family style",
    )
    show_item_images: bool = Field(
        default=True,
        description="Show item images in inventory views",
    )
    show_item_prices: bool = Field(
        default=True,
        description="Show pricing information in inventory views",
    )
    show_item_stock: bool = Field(
        default=True,
        description="Show stock values in inventory views",
    )
    export_format: Literal["csv", "json"] = Field(
        default="csv",
        description="Default export file format",
    )
    backup_frequency: Literal["daily", "weekly", "monthly", "never"] = Field(
        default="weekly",
        description="Preferred backup reminder cadence",
    )
    require_auth: bool = Field(
        default=True,
        description="Require authentication when reopening the app",
    )
    session_timeout: int = Field(
        default=30,
        ge=5,
        le=240,
        description="Auto-lock timeout in minutes",
    )
    biometric_auth: bool = Field(
        default=False,
        description="Allow biometric login when available",
    )
    operational_mode: Literal["live_audit", "routine", "training"] = Field(
        default="routine",
        description="Preferred app operating mode",
    )
    image_cache: bool = Field(
        default=True,
        description="Cache item and evidence images locally",
    )
    lazy_loading: bool = Field(
        default=True,
        description="Enable lazy loading for large lists",
    )
    debounce_delay: int = Field(
        default=300,
        ge=0,
        le=2000,
        description="Default debounce delay in milliseconds",
    )
    column_visibility: ColumnVisibilitySettings = Field(
        default_factory=ColumnVisibilitySettings,
        description="Visibility for optional inventory detail fields",
    )
    updated_at: Optional[datetime] = Field(
        default=None, description="Timestamp of last settings update"
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "theme": "dark",
                "notifications_enabled": True,
                "notification_sound": True,
                "notification_badge": True,
                "auto_sync_enabled": True,
                "auto_sync_interval": 15,
                "sync_on_reconnect": True,
                "offline_mode": False,
                "cache_expiration": 24,
                "max_queue_size": 1000,
                "scanner_vibration": True,
                "scanner_sound": True,
                "scanner_auto_submit": True,
                "scanner_timeout": 30,
                "font_size": 18,
                "font_style": "serif",
                "show_item_images": True,
                "show_item_prices": True,
                "show_item_stock": True,
                "export_format": "csv",
                "backup_frequency": "weekly",
                "require_auth": True,
                "session_timeout": 30,
                "biometric_auth": False,
                "operational_mode": "routine",
                "image_cache": True,
                "lazy_loading": True,
                "debounce_delay": 300,
                "column_visibility": {
                    "mfg_date": True,
                    "expiry_date": True,
                    "serial_number": True,
                    "mrp": True,
                },
            }
        }
    )


class UserSettingsUpdate(BaseModel):
    """Partial update model for user settings."""

    theme: Optional[Literal["light", "dark"]] = Field(
        default=None,
        description="UI theme mode: light or dark",
    )
    notifications_enabled: Optional[bool] = Field(
        default=None,
        description="Enable in-app notifications",
    )
    notification_sound: Optional[bool] = Field(
        default=None,
        description="Play notification sounds",
    )
    notification_badge: Optional[bool] = Field(
        default=None,
        description="Show notification badges",
    )
    auto_sync_enabled: Optional[bool] = Field(
        default=None,
        description="Automatically sync data in the background",
    )
    auto_sync_interval: Optional[int] = Field(
        default=None,
        ge=5,
        le=120,
        description="Background sync interval in minutes",
    )
    sync_on_reconnect: Optional[bool] = Field(
        default=None,
        description="Retry sync automatically when connection returns",
    )
    offline_mode: Optional[bool] = Field(
        default=None,
        description="Prefer offline-first app behavior",
    )
    cache_expiration: Optional[int] = Field(
        default=None,
        ge=1,
        le=168,
        description="Cache expiration in hours",
    )
    max_queue_size: Optional[int] = Field(
        default=None,
        ge=100,
        le=10000,
        description="Maximum queued offline actions",
    )
    scanner_vibration: Optional[bool] = Field(
        default=None,
        description="Enable vibration feedback for scanner flows",
    )
    scanner_sound: Optional[bool] = Field(
        default=None,
        description="Enable sound feedback for scanner flows",
    )
    scanner_auto_submit: Optional[bool] = Field(
        default=None,
        description="Auto-submit scanner results when possible",
    )
    scanner_timeout: Optional[int] = Field(
        default=None,
        ge=5,
        le=120,
        description="Scanner timeout in seconds",
    )
    font_size: Optional[int] = Field(
        default=None,
        ge=12,
        le=22,
        description="Preferred base font size in points",
    )
    font_style: Optional[Literal["system", "serif", "mono"]] = Field(
        default=None,
        description="Preferred font family style",
    )
    show_item_images: Optional[bool] = Field(
        default=None,
        description="Show item images in inventory views",
    )
    show_item_prices: Optional[bool] = Field(
        default=None,
        description="Show pricing information in inventory views",
    )
    show_item_stock: Optional[bool] = Field(
        default=None,
        description="Show stock values in inventory views",
    )
    export_format: Optional[Literal["csv", "json"]] = Field(
        default=None,
        description="Default export file format",
    )
    backup_frequency: Optional[Literal["daily", "weekly", "monthly", "never"]] = Field(
        default=None,
        description="Preferred backup reminder cadence",
    )
    require_auth: Optional[bool] = Field(
        default=None,
        description="Require authentication when reopening the app",
    )
    session_timeout: Optional[int] = Field(
        default=None,
        ge=5,
        le=240,
        description="Auto-lock timeout in minutes",
    )
    biometric_auth: Optional[bool] = Field(
        default=None,
        description="Allow biometric login when available",
    )
    operational_mode: Optional[Literal["live_audit", "routine", "training"]] = Field(
        default=None,
        description="Preferred app operating mode",
    )
    image_cache: Optional[bool] = Field(
        default=None,
        description="Cache item and evidence images locally",
    )
    lazy_loading: Optional[bool] = Field(
        default=None,
        description="Enable lazy loading for large lists",
    )
    debounce_delay: Optional[int] = Field(
        default=None,
        ge=0,
        le=2000,
        description="Default debounce delay in milliseconds",
    )
    column_visibility: Optional[ColumnVisibilitySettingsUpdate] = Field(
        default=None,
        description="Visibility for optional inventory detail fields",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "theme": "dark",
                "font_size": 18,
                "font_style": "mono",
                "auto_sync_enabled": True,
                "scanner_timeout": 45,
                "column_visibility": {
                    "mfg_date": True,
                    "expiry_date": False,
                },
            }
        }
    )


class UserSettingsResponse(BaseModel):
    """Response model for user settings endpoints."""

    status: str = Field(default="success", description="Response status")
    message: str = Field(default="", description="Human-readable message")
    data: UserSettings = Field(description="User settings")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "status": "success",
                "message": "Settings retrieved successfully",
                "data": {
                    "theme": "dark",
                    "font_size": 16,
                    "font_style": "system",
                },
            }
        }
    )
