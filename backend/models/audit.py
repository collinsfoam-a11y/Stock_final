from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .user import PyObjectId


class AuditEventType(str, Enum):
    # Auth Events
    AUTH_LOGIN_SUCCESS = "AUTH_LOGIN_SUCCESS"
    AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
    AUTH_LOGOUT = "AUTH_LOGOUT"
    AUTH_PASSWORD_RESET_REQUEST = "AUTH_PASSWORD_RESET_REQUEST"  # nosec B105
    AUTH_PASSWORD_RESET_VERIFY = "AUTH_PASSWORD_RESET_VERIFY"  # nosec B105
    AUTH_PASSWORD_RESET_CONFIRM = "AUTH_PASSWORD_RESET_CONFIRM"  # nosec B105
    AUTH_PIN_SETUP = "AUTH_PIN_SETUP"

    # Stock Events
    STOCK_COUNT_SUBMITTED = "STOCK_COUNT_SUBMITTED"
    STOCK_VARIANCE_DETECTED = "STOCK_VARIANCE_DETECTED"
    STOCK_BATCH_UPDATED = "STOCK_BATCH_UPDATED"

    # System Events
    SYSTEM_ALERT = "SYSTEM_ALERT"
    WATCHDOG_TRIGGER = "WATCHDOG_TRIGGER"
    USER_SETTINGS_UPDATE = "USER_SETTINGS_UPDATE"


class AuditLogStatus(str, Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    WARNING = "WARNING"


class AuditLog(BaseModel):
    id: PyObjectId | None = Field(alias="_id", default=None)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: AuditEventType
    actor_id: str | None = None
    actor_username: str | None = None
    ip_address: str | None = None
    resource_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    status: AuditLogStatus = Field(default=AuditLogStatus.SUCCESS)

    model_config = ConfigDict(populate_by_name=True)
