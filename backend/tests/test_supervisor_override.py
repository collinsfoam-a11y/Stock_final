from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from backend.api import count_lines_routes, supervisor_pin
from backend.tenancy.org_context import set_current_org_id
from backend.utils.auth_utils import create_supervisor_override_token


@pytest.mark.asyncio
async def test_supervisor_verify_pin_returns_override_token():
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.rate_limits.find_one = AsyncMock(return_value=None)
    mock_db.rate_limits.delete_one = AsyncMock(return_value=None)
    mock_db.users.find_one = AsyncMock(
        return_value={"_id": "sup-1", "username": "sup1", "role": "supervisor", "pin_hash": "h"}
    )
    mock_db.activity_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="log-1"))

    payload = supervisor_pin.PinVerificationRequest(
        supervisor_username="sup1",
        pin="1234",
        action="count_line.delete",
        reason_code="RC",
        reason="R",
        staff_username="staff1",
        entity_id="line-1",
        entity_type="count_line",
    )

    with (
        patch("backend.api.supervisor_pin.get_db", return_value=mock_db),
        patch("backend.api.supervisor_pin.verify_pin_hash", return_value=True),
    ):
        result = await supervisor_pin.verify_supervisor_pin(
            http_request=MagicMock(),
            payload=payload,
            current_user={"username": "staff1", "role": "staff", "org_id": "org-a"},
        )

    assert result["success"] is True
    assert result["override_token"]
    assert result["expires_in"] == 300


@pytest.mark.asyncio
async def test_supervisor_verify_pin_rejects_mismatched_staff_username():
    set_current_org_id("org-a")
    mock_db = MagicMock()
    mock_db.rate_limits.find_one = AsyncMock(return_value=None)

    payload = supervisor_pin.PinVerificationRequest(
        supervisor_username="sup1",
        pin="1234",
        action="count_line.delete",
        reason_code="RC",
        reason="R",
        staff_username="someone_else",
        entity_id="line-1",
        entity_type="count_line",
    )

    with patch("backend.api.supervisor_pin.get_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc:
            await supervisor_pin.verify_supervisor_pin(
                http_request=MagicMock(),
                payload=payload,
                current_user={"username": "staff1", "role": "staff", "org_id": "org-a"},
            )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_count_line_requires_override_token(monkeypatch):
    set_current_org_id("org-a")
    with pytest.raises(HTTPException) as exc:
        await count_lines_routes.delete_count_line(
            line_id="line-1",
            request=MagicMock(),
            override_token=None,
            current_user={"username": "staff1", "role": "supervisor", "org_id": "org-a"},
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_count_line_accepts_valid_override_token(monkeypatch):
    set_current_org_id("org-a")
    token = create_supervisor_override_token(
        {
            "org_id": "org-a",
            "override_action": "count_line.delete",
            "entity_id": "line-1",
            "entity_type": "count_line",
            "requested_by": "staff1",
            "staff_username": "staff1",
            "supervisor_username": "sup1",
        }
    )

    mock_db = MagicMock()
    mock_db.override_tokens.insert_one = AsyncMock(return_value=MagicMock(inserted_id="jti-1"))

    monkeypatch.setattr(count_lines_routes, "_get_db_client", lambda *a, **k: mock_db)
    monkeypatch.setattr(
        count_lines_routes,
        "_find_count_line",
        AsyncMock(return_value={"_id": "oid", "id": "line-1", "session_id": "sess-1"}),
    )
    monkeypatch.setattr(count_lines_routes, "_ensure_count_line_mutable", AsyncMock(return_value={}))
    monkeypatch.setattr(
        count_lines_routes, "_enforce_count_line_logic_from_line", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(count_lines_routes, "_recalculate_session_stats", AsyncMock(return_value=None))
    monkeypatch.setattr(
        count_lines_routes, "_broadcast_dashboard_refresh", AsyncMock(return_value=None)
    )
    monkeypatch.setattr(count_lines_routes, "_log_delete_activity", AsyncMock(return_value=None))

    write_service = MagicMock()
    write_service.process_write = AsyncMock(return_value=MagicMock(modified_count=1))
    monkeypatch.setattr(count_lines_routes, "_get_count_line_write_service", lambda *a, **k: write_service)

    result = await count_lines_routes.delete_count_line(
        line_id="line-1",
        request=MagicMock(headers={}, client=None),
        override_token=token,
        current_user={"username": "staff1", "role": "supervisor", "org_id": "org-a"},
    )

    assert result["success"] is True
