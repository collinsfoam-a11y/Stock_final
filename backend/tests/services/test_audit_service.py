import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.services.audit_service import AuditService, AuditEventType, AuditLogStatus
from backend.services.watchdog_service import WatchdogService


@pytest.mark.asyncio
async def test_audit_log_event():
    # Setup
    mock_db = MagicMock()
    mock_db.audit_logs.insert_one = AsyncMock()
    mock_db.audit_logs.insert_one.return_value.inserted_id = "mock_id"
    service = AuditService(mock_db)

    # Action
    event_id = await service.log_event(
        event_type=AuditEventType.AUTH_LOGIN_SUCCESS,
        status=AuditLogStatus.SUCCESS,
        actor_username="testuser",
        details={"ip": "127.0.0.1"},
    )

    # Verification
    assert event_id == "mock_id"
    mock_db.audit_logs.insert_one.assert_called_once()
    call_args = mock_db.audit_logs.insert_one.call_args[0][0]
    assert call_args["event_type"] == AuditEventType.AUTH_LOGIN_SUCCESS
    assert call_args["actor_username"] == "testuser"
    assert call_args["status"] == "SUCCESS"


@pytest.mark.asyncio
async def test_watchdog_velocity_alert():
    # Setup
    mock_db = MagicMock()

    # Mock aggregation: aggregate() is sync, returns cursor. cursor.to_list() is async.
    mock_cursor = MagicMock()
    mock_cursor.to_list = AsyncMock()
    mock_cursor.to_list.return_value = [{"_id": "user1", "username": "bad_actor", "count": 20}]

    # When aggregate is called, return the cursor
    mock_db.audit_logs.aggregate.return_value = mock_cursor

    mock_audit_service = AsyncMock()

    service = WatchdogService(mock_db)
    service.audit_service = mock_audit_service  # Inject mock audit service

    # Action
    await service.check_velocity_anomalies()

    # Verification
    # Should create a system alert
    mock_audit_service.log_event.assert_called_once()
    call_args = mock_audit_service.log_event.call_args[1]
    assert call_args["event_type"] == AuditEventType.SYSTEM_ALERT
    assert call_args["status"] == AuditLogStatus.WARNING
    assert "bad_actor" in call_args["details"]["message"]
