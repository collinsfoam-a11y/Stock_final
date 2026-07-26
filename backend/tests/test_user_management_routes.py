from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from backend.api.user_management_api import (
    CreateUserRequest,
    UpdateUserRequest,
    create_user,
    list_assignable_staff,
    update_user,
)
from backend.auth.permissions import Permission
from backend.models.audit import AuditEventType
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_list_assignable_staff_returns_active_staff_only(monkeypatch: pytest.MonkeyPatch):
    db = InMemoryDatabase()
    await db.users.insert_many(
        [
            {
                "username": "staff_b",
                "full_name": "Beta Staff",
                "role": "staff",
                "is_active": True,
            },
            {
                "username": "staff_a",
                "full_name": "Alpha Staff",
                "role": "staff",
                "is_active": True,
            },
            {
                "username": "inactive_staff",
                "full_name": "Inactive Staff",
                "role": "staff",
                "is_active": False,
            },
            {
                "username": "supervisor_1",
                "full_name": "Supervisor",
                "role": "supervisor",
                "is_active": True,
            },
        ]
    )

    monkeypatch.setattr("backend.api.user_management_api.get_db", lambda: db)

    result = await list_assignable_staff(
        current_user={
            "username": "supervisor_1",
            "role": "supervisor",
            "permissions": [Permission.COUNT_LINE_REJECT.value],
        }
    )

    assert [user.username for user in result] == ["staff_a", "staff_b"]
    assert [user.full_name for user in result] == ["Alpha Staff", "Beta Staff"]


@pytest.mark.asyncio
async def test_list_assignable_staff_requires_recount_permission(
    monkeypatch: pytest.MonkeyPatch,
):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.user_management_api.get_db", lambda: db)

    with pytest.raises(HTTPException) as exc_info:
        await list_assignable_staff(
            current_user={
                "username": "staff_1",
                "role": "staff",
                "permissions": [],
            }
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["error"]["code"] == "PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_create_user_writes_audit_event(monkeypatch: pytest.MonkeyPatch):
    db = InMemoryDatabase()
    monkeypatch.setattr("backend.api.user_management_api.get_db", lambda: db)

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        await create_user(
            request=CreateUserRequest(username="new_staff", password="secretpw", role="staff"),
            current_user={"username": "admin1", "role": "admin"},
        )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.USER_CREATED
    assert kwargs["entity_type"] == "user"
    assert kwargs["actor_username"] == "admin1"
    assert kwargs["after"]["username"] == "new_staff"
    assert "secretpw" not in str(kwargs)


@pytest.mark.asyncio
async def test_update_user_role_change_writes_audit_event(monkeypatch: pytest.MonkeyPatch):
    db = InMemoryDatabase()
    result = await db.users.insert_one(
        {"username": "staff_1", "role": "staff", "is_active": True}
    )
    monkeypatch.setattr("backend.api.user_management_api.get_db", lambda: db)

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        await update_user(
            user_id=str(result.inserted_id),
            request=UpdateUserRequest(role="supervisor"),
            current_user={"username": "admin1", "role": "admin"},
        )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.USER_ROLE_CHANGED
    assert kwargs["before"]["role"] == "staff"
    assert kwargs["after"]["role"] == "supervisor"
    assert kwargs["resource_id"] == "staff_1"


@pytest.mark.asyncio
async def test_update_user_deactivation_writes_disabled_audit_event(
    monkeypatch: pytest.MonkeyPatch,
):
    db = InMemoryDatabase()
    result = await db.users.insert_one(
        {"username": "staff_2", "role": "staff", "is_active": True}
    )
    monkeypatch.setattr("backend.api.user_management_api.get_db", lambda: db)

    audit_service = AsyncMock()
    audit_service.log_event = AsyncMock()

    with patch("backend.services.audit_service.AuditService", return_value=audit_service):
        await update_user(
            user_id=str(result.inserted_id),
            request=UpdateUserRequest(is_active=False),
            current_user={"username": "admin1", "role": "admin"},
        )

    audit_service.log_event.assert_awaited_once()
    kwargs = audit_service.log_event.await_args.kwargs
    assert kwargs["event_type"] == AuditEventType.USER_DISABLED
    assert kwargs["resource_id"] == "staff_2"
