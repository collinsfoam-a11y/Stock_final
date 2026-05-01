"""
Master Settings API - Centralized system configuration
"""

import logging
from backend.utils.api_utils import sanitize_for_logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import PyMongoError
from pydantic import BaseModel, Field

from backend.auth.dependencies import require_admin
from backend.services.master_settings_service import (
    MasterSettingsService,
    get_master_settings_service,
)

logger = logging.getLogger(__name__)

master_settings_router = APIRouter(prefix="/api/admin/settings", tags=["Master Settings"])


class SystemParameters(BaseModel):
    # API Settings
    api_timeout: int = Field(30, ge=5, le=300, description="API request timeout in seconds")
    api_rate_limit: int = Field(100, ge=10, le=10000, description="API rate limit per minute")

    # Cache Settings
    cache_enabled: bool = Field(True, description="Enable caching")
    cache_ttl: int = Field(3600, ge=60, le=86400, description="Cache TTL in seconds")
    cache_max_size: int = Field(1000, ge=100, le=10000, description="Maximum cache entries")

    # Sync Settings
    sync_interval: int = Field(3600, ge=60, le=86400, description="ERP sync interval in seconds")
    sync_batch_size: int = Field(100, ge=10, le=1000, description="Sync batch size")
    auto_sync_enabled: bool = Field(True, description="Enable automatic sync")

    # Session Settings
    session_timeout: int = Field(3600, ge=300, le=86400, description="Session timeout in seconds")
    max_concurrent_sessions: int = Field(
        50, ge=10, le=500, description="Maximum concurrent sessions"
    )

    # Logging Settings
    log_level: str = Field("INFO", pattern="^(DEBUG|INFO|WARN|ERROR)$", description="Log level")
    log_retention_days: int = Field(30, ge=1, le=365, description="Log retention in days")
    enable_audit_log: bool = Field(True, description="Enable audit logging")

    # Database Settings
    mongo_pool_size: int = Field(10, ge=1, le=100, description="MongoDB connection pool size")
    sql_pool_size: int = Field(5, ge=1, le=20, description="SQL Server connection pool size")
    query_timeout: int = Field(30, ge=5, le=300, description="Database query timeout in seconds")

    # Security Settings
    password_min_length: int = Field(8, ge=6, le=32, description="Minimum password length")
    password_require_uppercase: bool = Field(True, description="Require uppercase in password")
    password_require_lowercase: bool = Field(True, description="Require lowercase in password")
    password_require_numbers: bool = Field(True, description="Require numbers in password")
    jwt_expiration: int = Field(86400, ge=3600, le=604800, description="JWT expiration in seconds")

    # Performance Settings
    enable_compression: bool = Field(True, description="Enable response compression")
    max_request_size: int = Field(
        10485760, ge=1048576, le=104857600, description="Max request size in bytes"
    )
    enable_cors: bool = Field(True, description="Enable CORS")


@master_settings_router.get("/parameters")
async def get_system_parameters(
    current_user: dict = Depends(require_admin),
    settings_service: MasterSettingsService = Depends(get_master_settings_service),
):
    """Get all system parameters"""
    try:
        settings_doc = await settings_service.get_parameters()

        if settings_doc:
            return {
                "success": True,
                "data": settings_doc,
            }
        else:
            # Return defaults
            default_params = SystemParameters()
            return {
                "success": True,
                "data": default_params.model_dump(),
            }
    except (PyMongoError, RuntimeError, TypeError, ValueError) as e:
        logger.error("Error getting system parameters: %s", sanitize_for_logging(str(e)))
        default_params = SystemParameters()
        return {
            "success": True,
            "data": default_params.model_dump(),
        }


@master_settings_router.put("/parameters")
async def update_system_parameters(
    parameters: SystemParameters,
    current_user: dict = Depends(require_admin),
    settings_service: MasterSettingsService = Depends(get_master_settings_service),
):
    """Update system parameters"""
    try:
        params_dict = parameters.model_dump()
        await settings_service.update_parameters(
            params_dict=params_dict,
            username=current_user.get("username", "admin"),
        )

        return {
            "success": True,
            "message": "System parameters updated successfully",
            "data": params_dict,
            "note": "Some changes may require backend restart to take effect",
        }
    except (PyMongoError, RuntimeError, TypeError, ValueError) as e:
        logger.error("Error updating system parameters: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update system parameters: {str(e)}",
        )


@master_settings_router.get("/categories")
async def get_settings_categories(current_user: dict = Depends(require_admin)):
    """Get settings categories"""
    return {
        "success": True,
        "data": {
            "categories": [
                {
                    "id": "api",
                    "name": "API Settings",
                    "icon": "code",
                    "description": "API timeout, rate limiting, and request settings",
                },
                {
                    "id": "cache",
                    "name": "Cache Settings",
                    "icon": "flash",
                    "description": "Caching configuration and TTL settings",
                },
                {
                    "id": "sync",
                    "name": "Sync Settings",
                    "icon": "sync",
                    "description": "ERP sync interval and batch settings",
                },
                {
                    "id": "session",
                    "name": "Session Settings",
                    "icon": "time",
                    "description": "Session timeout and concurrent session limits",
                },
                {
                    "id": "logging",
                    "name": "Logging Settings",
                    "icon": "document-text",
                    "description": "Log level and retention settings",
                },
                {
                    "id": "database",
                    "name": "Database Settings",
                    "icon": "server",
                    "description": "Connection pool and query timeout settings",
                },
                {
                    "id": "security",
                    "name": "Security Settings",
                    "icon": "shield-checkmark",
                    "description": "Password policies and JWT settings",
                },
                {
                    "id": "performance",
                    "name": "Performance Settings",
                    "icon": "speedometer",
                    "description": "Compression and request size limits",
                },
            ]
        },
    }


@master_settings_router.post("/reset")
async def reset_to_defaults(
    category: Optional[str] = None,
    current_user: dict = Depends(require_admin),
    settings_service: MasterSettingsService = Depends(get_master_settings_service),
):
    """Reset settings to defaults"""
    try:
        default_params = SystemParameters().model_dump()
        await settings_service.reset_parameters(
            category=category,
            default_params=default_params,
            username=current_user.get("username", "admin"),
        )

        return {
            "success": True,
            "message": f"Settings reset to defaults{' for ' + category if category else ''}",
        }
    except (PyMongoError, RuntimeError, TypeError, ValueError) as e:
        logger.error("Error resetting settings: %s", sanitize_for_logging(str(e)))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset settings: {str(e)}",
        )
