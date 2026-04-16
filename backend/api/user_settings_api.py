"""
User Settings API

Endpoints for managing user-specific app settings.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from backend.auth.dependencies import get_current_user
from backend.core.schemas.user_settings import (
    ColumnVisibilitySettings,
    UserSettings,
    UserSettingsResponse,
    UserSettingsUpdate,
)
from backend.db.runtime import get_db
from backend.models.audit import AuditEventType, AuditLogStatus
from backend.services.audit_service import AuditService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["User Settings"])


DEFAULT_SETTINGS: dict[str, Any] = UserSettings().model_dump(exclude={"updated_at"})


def _normalize_theme(value: Any) -> str:
    if value == "dark":
        return "dark"
    if value in {"premium", "ocean", "sunset", "highContrast"}:
        return "dark"
    return "light"


def _normalize_font_size(value: Any) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(12, min(22, int(round(value))))

    return {
        "small": 14,
        "medium": 16,
        "large": 18,
        "xlarge": 20,
    }.get(str(value).lower(), DEFAULT_SETTINGS["font_size"])


def _normalize_font_style(value: Any) -> str:
    if value in {"serif", "mono"}:
        return str(value)
    return "system"


def _normalize_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    return default


def _normalize_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(minimum, min(maximum, int(round(value))))
    return default


def _normalize_choice(value: Any, default: str, allowed: set[str]) -> str:
    normalized = str(value).lower()
    return normalized if normalized in allowed else default


def _normalize_column_visibility(value: Any) -> dict[str, bool]:
    defaults = DEFAULT_SETTINGS["column_visibility"]
    if not isinstance(value, dict):
        return defaults.copy()

    return {
        "mfg_date": _normalize_bool(
            value.get("mfg_date", value.get("mfgDate")),
            defaults["mfg_date"],
        ),
        "expiry_date": _normalize_bool(
            value.get("expiry_date", value.get("expiryDate")),
            defaults["expiry_date"],
        ),
        "serial_number": _normalize_bool(
            value.get("serial_number", value.get("serialNumber")),
            defaults["serial_number"],
        ),
        "mrp": _normalize_bool(value.get("mrp"), defaults["mrp"]),
    }


def _merge_column_visibility_update(
    existing: Any,
    update: Any,
) -> dict[str, bool]:
    current = _normalize_column_visibility(existing)
    if not isinstance(update, dict):
        return current

    merged = current.copy()
    for key, value in update.items():
        if key == "mfg_date":
            merged["mfg_date"] = _normalize_bool(value, current["mfg_date"])
        elif key == "expiry_date":
            merged["expiry_date"] = _normalize_bool(value, current["expiry_date"])
        elif key == "serial_number":
            merged["serial_number"] = _normalize_bool(value, current["serial_number"])
        elif key == "mrp":
            merged["mrp"] = _normalize_bool(value, current["mrp"])
    return merged


def _build_user_settings(doc: dict[str, Any] | None) -> UserSettings:
    source = doc or {}
    return UserSettings(
        theme=_normalize_theme(source.get("theme")),
        notifications_enabled=_normalize_bool(
            source.get("notifications_enabled"),
            DEFAULT_SETTINGS["notifications_enabled"],
        ),
        notification_sound=_normalize_bool(
            source.get("notification_sound"),
            DEFAULT_SETTINGS["notification_sound"],
        ),
        notification_badge=_normalize_bool(
            source.get("notification_badge"),
            DEFAULT_SETTINGS["notification_badge"],
        ),
        auto_sync_enabled=_normalize_bool(
            source.get("auto_sync_enabled"),
            DEFAULT_SETTINGS["auto_sync_enabled"],
        ),
        auto_sync_interval=_normalize_int(
            source.get("auto_sync_interval"),
            DEFAULT_SETTINGS["auto_sync_interval"],
            5,
            120,
        ),
        sync_on_reconnect=_normalize_bool(
            source.get("sync_on_reconnect"),
            DEFAULT_SETTINGS["sync_on_reconnect"],
        ),
        offline_mode=_normalize_bool(
            source.get("offline_mode"),
            DEFAULT_SETTINGS["offline_mode"],
        ),
        cache_expiration=_normalize_int(
            source.get("cache_expiration"),
            DEFAULT_SETTINGS["cache_expiration"],
            1,
            168,
        ),
        max_queue_size=_normalize_int(
            source.get("max_queue_size"),
            DEFAULT_SETTINGS["max_queue_size"],
            100,
            10000,
        ),
        scanner_vibration=_normalize_bool(
            source.get("scanner_vibration"),
            DEFAULT_SETTINGS["scanner_vibration"],
        ),
        scanner_sound=_normalize_bool(
            source.get("scanner_sound"),
            DEFAULT_SETTINGS["scanner_sound"],
        ),
        scanner_auto_submit=_normalize_bool(
            source.get("scanner_auto_submit"),
            DEFAULT_SETTINGS["scanner_auto_submit"],
        ),
        scanner_timeout=_normalize_int(
            source.get("scanner_timeout"),
            DEFAULT_SETTINGS["scanner_timeout"],
            5,
            120,
        ),
        font_size=_normalize_font_size(source.get("font_size")),
        font_style=_normalize_font_style(source.get("font_style")),
        show_item_images=_normalize_bool(
            source.get("show_item_images"),
            DEFAULT_SETTINGS["show_item_images"],
        ),
        show_item_prices=_normalize_bool(
            source.get("show_item_prices"),
            DEFAULT_SETTINGS["show_item_prices"],
        ),
        show_item_stock=_normalize_bool(
            source.get("show_item_stock"),
            DEFAULT_SETTINGS["show_item_stock"],
        ),
        export_format=_normalize_choice(
            source.get("export_format"),
            DEFAULT_SETTINGS["export_format"],
            {"csv", "json"},
        ),
        backup_frequency=_normalize_choice(
            source.get("backup_frequency"),
            DEFAULT_SETTINGS["backup_frequency"],
            {"daily", "weekly", "monthly", "never"},
        ),
        require_auth=_normalize_bool(
            source.get("require_auth"),
            DEFAULT_SETTINGS["require_auth"],
        ),
        session_timeout=_normalize_int(
            source.get("session_timeout"),
            DEFAULT_SETTINGS["session_timeout"],
            5,
            240,
        ),
        biometric_auth=_normalize_bool(
            source.get("biometric_auth"),
            DEFAULT_SETTINGS["biometric_auth"],
        ),
        operational_mode=_normalize_choice(
            source.get("operational_mode"),
            DEFAULT_SETTINGS["operational_mode"],
            {"live_audit", "routine", "training"},
        ),
        image_cache=_normalize_bool(
            source.get("image_cache"),
            DEFAULT_SETTINGS["image_cache"],
        ),
        lazy_loading=_normalize_bool(
            source.get("lazy_loading"),
            DEFAULT_SETTINGS["lazy_loading"],
        ),
        debounce_delay=_normalize_int(
            source.get("debounce_delay"),
            DEFAULT_SETTINGS["debounce_delay"],
            0,
            2000,
        ),
        column_visibility=ColumnVisibilitySettings(
            **_normalize_column_visibility(source.get("column_visibility"))
        ),
        updated_at=source.get("updated_at"),
    )


@router.get("/settings", response_model=UserSettingsResponse)
async def get_user_settings(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> UserSettingsResponse:
    """
    Get the current user's settings.

    Returns default settings if user has no custom settings stored.
    """
    db = get_db()
    user_id = str(current_user["_id"])

    try:
        # Try to find existing settings
        settings_doc = await db.user_settings.find_one({"user_id": user_id})

        if settings_doc:
            return UserSettingsResponse(
                status="success",
                message="Settings retrieved successfully",
                data=_build_user_settings(settings_doc),
            )
        else:
            return UserSettingsResponse(
                status="success",
                message="Default settings returned",
                data=_build_user_settings(None),
            )

    except Exception as e:
        logger.error(f"Error fetching settings for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error retrieving user settings",
        )


@router.patch("/settings", response_model=UserSettingsResponse)
async def update_user_settings(
    settings_update: UserSettingsUpdate,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> UserSettingsResponse:
    """
    Update the current user's settings.

    Only provided fields will be updated; others remain unchanged.
    """
    db = get_db()
    user_id = str(current_user["_id"])
    username = current_user["username"]

    try:
        existing = await db.user_settings.find_one({"user_id": user_id})

        update_data = settings_update.model_dump(exclude_unset=True)

        if not update_data:
            raise HTTPException(
                status_code=400,
                detail="No settings to update",
            )

        changed_fields = list(update_data.keys())

        if "column_visibility" in update_data:
            update_data["column_visibility"] = _merge_column_visibility_update(
                existing.get("column_visibility") if existing else None,
                update_data["column_visibility"],
            )

        update_data["updated_at"] = datetime.now(timezone.utc).replace(tzinfo=None)

        if existing:
            await db.user_settings.update_one(
                {"user_id": user_id},
                {"$set": update_data},
            )
        else:
            new_settings = {
                "user_id": user_id,
                **DEFAULT_SETTINGS,
                **update_data,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
            await db.user_settings.insert_one(new_settings)

        await AuditService(db).log_event(
            event_type=AuditEventType.USER_SETTINGS_UPDATE,
            status=AuditLogStatus.SUCCESS,
            actor_id=user_id,
            actor_username=username,
            details={"action": "settings_update", "changed_fields": changed_fields},
        )

        updated_doc = await db.user_settings.find_one({"user_id": user_id})
        if not updated_doc:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated settings")

        return UserSettingsResponse(
            status="success",
            message="Settings updated successfully",
            data=_build_user_settings(updated_doc),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating settings for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error updating user settings",
        )


@router.delete("/settings", response_model=UserSettingsResponse)
async def reset_user_settings(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> UserSettingsResponse:
    """
    Reset the current user's settings to defaults.
    """
    db = get_db()
    user_id = str(current_user["_id"])
    username = current_user["username"]

    try:
        result = await db.user_settings.delete_one({"user_id": user_id})

        if result.deleted_count > 0:
            await AuditService(db).log_event(
                event_type=AuditEventType.USER_SETTINGS_UPDATE,
                status=AuditLogStatus.SUCCESS,
                actor_id=user_id,
                actor_username=username,
                details={"action": "reset_to_defaults"},
            )

            logger.info(f"Settings reset to defaults for user {username}")

        return UserSettingsResponse(
            status="success",
            message="Settings reset to defaults",
            data=_build_user_settings(None),
        )

    except Exception as e:
        logger.error(f"Error resetting settings for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail="Error resetting user settings",
        )
