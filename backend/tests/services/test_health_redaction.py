from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.api import health as health_api
from backend.services.database_health import DatabaseHealthService
from backend.tests.utils.in_memory_db import InMemoryDatabase


SENSITIVE_KEYS = {
    "config",
    "password",
    "pwd",
    "username",
    "user",
    "uid",
    "host",
    "server",
    "dsn",
    "connection_string",
    "connectionstring",
}
SENSITIVE_VALUES = {
    "super-secret-password",
    "erp-sql.internal",
    "sql-report-user",
    "Driver={ODBC Driver 18 for SQL Server};Server=erp-sql.internal;UID=sql-report-user;PWD=super-secret-password",
    "erp-prod-dsn",
}


def _walk_keys(payload: object) -> list[str]:
    if isinstance(payload, dict):
        keys = [str(key).lower() for key in payload.keys()]
        for value in payload.values():
            keys.extend(_walk_keys(value))
        return keys
    if isinstance(payload, list):
        keys: list[str] = []
        for value in payload:
            keys.extend(_walk_keys(value))
        return keys
    return []


def _payload_text(payload: object) -> str:
    return json.dumps(payload, default=str, sort_keys=True)


def _assert_no_sensitive_sql_details(payload: dict) -> None:
    keys = set(_walk_keys(payload))
    assert keys.isdisjoint(SENSITIVE_KEYS)

    text = _payload_text(payload)
    for value in SENSITIVE_VALUES:
        assert value not in text


@pytest.mark.asyncio
async def test_database_health_detailed_redacts_sql_connector_config_at_source():
    db = InMemoryDatabase()
    sql_connector = SimpleNamespace(
        config={
            "host": "erp-sql.internal",
            "server": "erp-sql.internal",
            "username": "sql-report-user",
            "password": "super-secret-password",
            "connection_string": (
                "Driver={ODBC Driver 18 for SQL Server};"
                "Server=erp-sql.internal;UID=sql-report-user;PWD=super-secret-password"
            ),
            "dsn": "erp-prod-dsn",
        },
        test_connection=lambda: True,
    )
    service = DatabaseHealthService(db, sql_connector)

    result = await service.get_detailed_health()

    _assert_no_sensitive_sql_details(result)


@pytest.mark.asyncio
async def test_detailed_health_route_sanitizes_sensitive_nested_health_payload(monkeypatch):
    import backend.core.globals as globals_module

    monkeypatch.setattr(
        globals_module,
        "database_health_service",
        SimpleNamespace(
            get_detailed_health=AsyncMock(
                return_value={
                    "overall": "healthy",
                    "database_stats": {
                        "sql_server": {
                            "connected": True,
                            "config": {
                                "host": "erp-sql.internal",
                                "username": "sql-report-user",
                                "password": "super-secret-password",
                                "dsn": "erp-prod-dsn",
                            },
                        }
                    },
                }
            )
        ),
        raising=False,
    )
    monkeypatch.setattr(globals_module, "cache_service", None, raising=False)
    monkeypatch.setattr(globals_module, "websocket_manager", None, raising=False)
    monkeypatch.setattr(health_api, "_gather_system_resources", lambda: {}, raising=False)
    monkeypatch.setattr(health_api, "_build_mongo_pool_info", lambda: {}, raising=False)

    result = await health_api.detailed_health_check()

    _assert_no_sensitive_sql_details(result)
