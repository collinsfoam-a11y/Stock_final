from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.api.auth_routes import (
    _ensure_single_session_for_login,
    get_active_session_record,
)
from backend.utils.result import Ok


class _DummyRefreshTokens:
    def __init__(self, record=None):
        self.record = record

    async def find_one(self, *args, **kwargs):
        return self.record


class _DummyDb:
    def __init__(self, record=None):
        self.refresh_tokens = _DummyRefreshTokens(record)


@pytest.mark.asyncio
async def test_get_active_session_record_returns_empty_dict_when_no_active_session(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr("backend.api.auth_routes.get_db", lambda: _DummyDb(None))
    monkeypatch.setattr(
        "backend.api.auth_routes.settings",
        SimpleNamespace(AUTH_SINGLE_SESSION=True),
    )

    result = await get_active_session_record("staff1")

    assert result.is_ok
    assert result.unwrap() == {}


@pytest.mark.asyncio
async def test_ensure_single_session_for_login_returns_ok_when_no_active_session(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "backend.api.auth_routes.get_active_session_record",
        AsyncMock(return_value=Ok({})),
    )

    result = await _ensure_single_session_for_login(
        username="staff1",
        request=SimpleNamespace(),
        client_ip="127.0.0.1",
    )

    assert result.is_ok
    assert result.unwrap() == {}
