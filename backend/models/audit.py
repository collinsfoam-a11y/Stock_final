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

    # Count-line lifecycle (BSR canonical audit coverage)
    COUNT_LINE_SUBMITTED = "COUNT_LINE_SUBMITTED"
    COUNT_LINE_APPROVED = "COUNT_LINE_APPROVED"
    COUNT_LINE_REJECTED = "COUNT_LINE_REJECTED"
    COUNT_LINE_RECOUNT_REQUESTED = "COUNT_LINE_RECOUNT_REQUESTED"
    COUNT_LINE_RECOUNT_SUBMITTED = "COUNT_LINE_RECOUNT_SUBMITTED"
    DUPLICATE_SCAN_ATTEMPT = "DUPLICATE_SCAN_ATTEMPT"

    # Unknown item lifecycle
    UNKNOWN_ITEM_REPORTED = "UNKNOWN_ITEM_REPORTED"
    UNKNOWN_ITEM_MAPPED = "UNKNOWN_ITEM_MAPPED"
    UNKNOWN_ITEM_DISMISSED = "UNKNOWN_ITEM_DISMISSED"

    # Session lifecycle (only states that are real in this codebase's
    # canonical CREATED->ACTIVE->REVIEW->FINALIZED model -- see
    # governance_guard.SESSION_TRANSITIONS. PAUSED/RESUMED/LOCKED/UNLOCKED/
    # REOPEN/CANCELLED are not implemented as session-level states and are
    # deliberately not added here; see the BSR remediation report.)
    SESSION_CREATED = "SESSION_CREATED"
    SESSION_ACTIVATED = "SESSION_ACTIVATED"
    SESSION_REVIEW_STARTED = "SESSION_REVIEW_STARTED"
    SESSION_FINALIZED = "SESSION_FINALIZED"

    # Governed physical-location hierarchy
    LOCATION_CREATED = "LOCATION_CREATED"
    LOCATION_LEGACY_UPSERTED = "LOCATION_LEGACY_UPSERTED"
    LOCATION_MIGRATION_ROLLED_BACK = "LOCATION_MIGRATION_ROLLED_BACK"

    # User management
    USER_CREATED = "USER_CREATED"
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED"
    USER_DISABLED = "USER_DISABLED"

    # Admin / operational
    ADMIN_SETTING_CHANGED = "ADMIN_SETTING_CHANGED"
    EXPORT_GENERATED = "EXPORT_GENERATED"
    EXPORT_PREVIEW_GENERATED = "EXPORT_PREVIEW_GENERATED"
    EXPORT_MAPPING_CHANGED = "EXPORT_MAPPING_CHANGED"
    EXPORT_PREVIEW_APPROVED = "EXPORT_PREVIEW_APPROVED"
    EXPORT_FILE_GENERATED = "EXPORT_FILE_GENERATED"
    EXPORT_CORRECTION_PROPOSED = "EXPORT_CORRECTION_PROPOSED"
    EXPORT_CORRECTION_APPROVED = "EXPORT_CORRECTION_APPROVED"
    EXPORT_CORRECTION_REJECTED = "EXPORT_CORRECTION_REJECTED"
    EXPORT_CORRECTION_APPLIED = "EXPORT_CORRECTION_APPLIED"
    EXPORT_PHOTO_MANIFEST_SNAPSHOTTED = "EXPORT_PHOTO_MANIFEST_SNAPSHOTTED"
    EXPORT_HSN_GST_VALIDATED = "EXPORT_HSN_GST_VALIDATED"
    HSN_DIRECTORY_RECORD_IMPORTED = "HSN_DIRECTORY_RECORD_IMPORTED"
    EXPORT_HSN_SUGGESTION_SELECTED = "EXPORT_HSN_SUGGESTION_SELECTED"
    SYNC_CONFLICT_CREATED = "SYNC_CONFLICT_CREATED"
    SYNC_CONFLICT_RESOLVED = "SYNC_CONFLICT_RESOLVED"
    GOVERNANCE_VIOLATION = "GOVERNANCE_VIOLATION"


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

    # Canonical audit fields (BSR remediation). All optional so existing
    # callers and existing stored documents remain valid.
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    session_id: Optional[str] = None
    count_line_id: Optional[str] = None
    item_code: Optional[str] = None
    location_context: Optional[Dict[str, Any]] = None
    actor_role: Optional[str] = None
    decision: Optional[str] = None
    reason: Optional[str] = None
    before: Optional[Dict[str, Any]] = None
    after: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    device_id: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)
