from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field

from .user import PyObjectId


class AuditEventType(str, Enum):
    # Auth Events
    AUTH_LOGIN_SUCCESS = "AUTH_LOGIN_SUCCESS"
    AUTH_LOGIN_FAILED = "AUTH_LOGIN_FAILED"
    AUTH_LOGOUT = "AUTH_LOGOUT"
    AUTH_PASSWORD_RESET_REQUEST = "AUTH_PASSWORD_RESET_REQUEST"
    AUTH_PASSWORD_RESET_VERIFY = "AUTH_PASSWORD_RESET_VERIFY"
    AUTH_PASSWORD_RESET_CONFIRM = "AUTH_PASSWORD_RESET_CONFIRM"
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
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    event_type: AuditEventType
    actor_id: Optional[str] = None
    actor_username: Optional[str] = None
    ip_address: Optional[str] = None
    resource_id: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)
    status: AuditLogStatus = Field(default=AuditLogStatus.SUCCESS)

    model_config = ConfigDict(populate_by_name=True)
