"""
Canonical audit coverage for admin settings changes (BSR remediation).

update_system_parameters previously wrote an ad-hoc document directly to
db.audit_logs with a shape incompatible with the AuditLog model (no
event_type field) -- replaced with a proper ADMIN_SETTING_CHANGED event.
"""

from unittest.mock import AsyncMock, MagicMock, patch

from backend.api.master_settings_api import (
    SystemParameters,
    reset_to_defaults,
    update_system_parameters,
)
from backend.models.audit import AuditEventType


def _mock_db():
    db = MagicMock()
    db.system_settings.replace_one = AsyncMock()
    db.system_settings.find_one = AsyncMock(return_value=None)
    db.system_settings.insert_one = AsyncMock()
    db.config_versions.insert_one = AsyncMock()
    return db


async def test_update_system_parameters_writes_canonical_audit_event():
    db = _mock_db()
    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.master_settings_api.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await update_system_parameters(
            parameters=SystemParameters(),
            current_user={"username": "admin1", "role": "admin"},
        )

    assert result["success"] is True
    # The old ad-hoc db.audit_logs.insert_one call must be gone.
    db.audit_logs.insert_one.assert_not_called()

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.ADMIN_SETTING_CHANGED
    assert kwargs["entity_type"] == "system_settings"
    assert kwargs["actor_username"] == "admin1"


async def test_reset_to_defaults_writes_canonical_audit_event():
    db = _mock_db()
    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with (
        patch("backend.api.master_settings_api.get_db", return_value=db),
        patch("backend.services.audit_service.AuditService", return_value=audit_service),
    ):
        result = await reset_to_defaults(
            category=None,
            current_user={"username": "admin1", "role": "admin"},
        )

    assert result["success"] is True
    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.ADMIN_SETTING_CHANGED
    assert kwargs["decision"] == "RESET"
