import pytest
from fastapi import HTTPException

from backend.api.user_management_api import list_assignable_staff
from backend.auth.permissions import Permission
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
