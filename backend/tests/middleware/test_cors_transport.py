import logging
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app import middleware as middleware_module
from backend.app.middleware import register_middleware
from backend.services.projection_snapshot import get_projection_snapshot_ts
from backend.tests.utils.in_memory_db import InMemoryDatabase


class _TestSettings:
    ENVIRONMENT = "development"
    CORS_ALLOW_ORIGINS = None
    CORS_DEV_ORIGINS = None
    ALLOWED_HOSTS = None
    ENABLE_LAN_ENFORCEMENT = False


def _build_client(*, raise_server_exceptions: bool = True) -> TestClient:
    app = FastAPI()
    register_middleware(
        app,
        settings=_TestSettings(),
        logger=logging.getLogger("test-cors"),
    )

    @app.post("/api/count-lines")
    async def create_count_line():
        return {"ok": True}

    @app.post("/api/count-lines/fail")
    async def create_count_line_failure():
        raise RuntimeError("transport-test-boom")

    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def _build_validation_client(*, raise_server_exceptions: bool = True) -> TestClient:
    app = FastAPI()
    register_middleware(
        app,
        settings=_TestSettings(),
        logger=logging.getLogger("test-validation-mode"),
    )

    @app.get("/api/dashboard/stats")
    async def dashboard_stats():
        return {"ok": True}

    @app.get("/api/snapshot-context")
    async def snapshot_context():
        snapshot_ts = get_projection_snapshot_ts()
        return {"snapshot_ts": snapshot_ts.isoformat() if snapshot_ts else None}

    @app.post("/api/count-lines")
    async def create_count_line():
        return {"ok": True}

    @app.post("/api/reports/generate")
    async def generate_report():
        return {"ok": True}

    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


def test_preflight_allows_tracing_headers_for_count_lines() -> None:
    client = _build_client()
    response = client.options(
        "/api/count-lines",
        headers={
            "Origin": "http://localhost:8083",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,authorization,baggage,sentry-trace",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8083"
    allow_headers = response.headers.get("access-control-allow-headers", "").lower()
    assert "baggage" in allow_headers
    assert "sentry-trace" in allow_headers


def test_post_count_lines_includes_cors_headers() -> None:
    client = _build_client()
    response = client.post(
        "/api/count-lines",
        json={},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_post_unhandled_error_keeps_cors_headers() -> None:
    client = _build_client(raise_server_exceptions=False)
    response = client.post(
        "/api/count-lines/fail",
        json={},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 500
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert response.json().get("detail", {}).get("code") == "INTERNAL_SERVER_ERROR"


def test_validation_mode_keeps_writes_available(monkeypatch) -> None:
    monkeypatch.setenv("VALIDATION_MODE", "true")
    client = _build_validation_client()

    response = client.post(
        "/api/count-lines",
        json={},
        headers={"Origin": "http://localhost:3000"},
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_validation_mode_sets_request_snapshot(monkeypatch) -> None:
    monkeypatch.setenv("VALIDATION_MODE", "true")
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.sessions._documents.append({"session_id": "sess-1", "updated_at": now})
    monkeypatch.setattr(middleware_module, "get_db", lambda: db)
    client = _build_validation_client()

    response = client.get("/api/snapshot-context")

    assert response.status_code == 200
    assert response.json()["snapshot_ts"] == now.isoformat()


def test_validation_mode_allows_read_only_shadow_paths(monkeypatch) -> None:
    monkeypatch.setenv("VALIDATION_MODE", "true")
    client = _build_validation_client()

    stats_response = client.get("/api/dashboard/stats")
    report_response = client.post("/api/reports/generate", json={})

    assert stats_response.status_code == 200
    assert report_response.status_code == 200
