"""Unit tests for DatabaseHealthService (MongoDB health path + aggregation)."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.database_health import DatabaseHealthService

pytestmark = pytest.mark.asyncio


def _make_service(*, ping_ok: bool = True) -> DatabaseHealthService:
    mongo_db = MagicMock(name="mongo_db")
    mongo_db.name = "test_db"
    if ping_ok:
        mongo_db.command = AsyncMock(return_value={"ok": 1})
    else:
        mongo_db.command = AsyncMock(side_effect=RuntimeError("connection refused"))
    sql_connector = MagicMock(name="sql_connector")
    return DatabaseHealthService(mongo_db, sql_connector, check_interval=60)


async def test_check_mongo_health_healthy():
    svc = _make_service(ping_ok=True)
    result = await svc.check_mongo_health()
    assert result["status"] == "healthy"
    assert result["response_time"] >= 0
    assert svc._health_status["mongo"]["status"] == "healthy"
    assert svc._health_status["mongo"]["error"] is None


async def test_check_mongo_health_unhealthy_records_error():
    svc = _make_service(ping_ok=False)
    result = await svc.check_mongo_health()
    assert result["status"] == "unhealthy"
    assert "connection refused" in result["error"]
    assert svc._health_status["mongo"]["status"] == "unhealthy"


async def test_get_status_returns_current_snapshot():
    svc = _make_service(ping_ok=True)
    await svc.check_mongo_health()
    status = svc.get_status()
    assert status["mongo"]["status"] == "healthy"
    assert "overall" in status


async def test_check_all_aggregates_both_backends(monkeypatch):
    svc = _make_service(ping_ok=True)

    async def _sql_ok():
        svc._health_status["sql_server"] = {"status": "healthy"}
        return {"status": "healthy"}

    monkeypatch.setattr(svc, "check_sql_server_health", _sql_ok)
    result = await svc.check_all()
    assert result["mongo"]["status"] == "healthy"
    assert result["sql_server"]["status"] == "healthy"


async def test_check_all_overall_unhealthy_when_mongo_down(monkeypatch):
    svc = _make_service(ping_ok=False)

    async def _sql_ok():
        svc._health_status["sql_server"] = {"status": "healthy"}
        return {"status": "healthy"}

    monkeypatch.setattr(svc, "check_sql_server_health", _sql_ok)
    result = await svc.check_all()
    assert result["mongo"]["status"] == "unhealthy"
    # Overall must reflect the degraded MongoDB backend (the required store).
    assert result["overall"] != "healthy"
