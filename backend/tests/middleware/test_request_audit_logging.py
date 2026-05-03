from __future__ import annotations

import base64
import json
import logging
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.middleware import register_middleware


class _TestSettings:
    ENVIRONMENT = "development"
    CORS_ALLOW_ORIGINS = None
    CORS_DEV_ORIGINS = None
    ALLOWED_HOSTS = None
    ENABLE_LAN_ENFORCEMENT = False


def _b64url(value: dict) -> str:
    encoded = base64.urlsafe_b64encode(
        json.dumps(value, separators=(",", ":")).encode("utf-8")
    ).decode("utf-8")
    return encoded.rstrip("=")


def _make_bearer_token(payload: dict) -> str:
    header = _b64url({"alg": "none", "typ": "JWT"})
    body = _b64url(payload)
    return f"Bearer {header}.{body}.signature"


def _build_client() -> TestClient:
    app = FastAPI()
    register_middleware(
        app,
        settings=_TestSettings(),
        logger=logging.getLogger("test-request-audit"),
    )

    @app.get("/api/ping")
    async def ping():
        return {"ok": True}

    return TestClient(app)


def test_request_audit_middleware_logs_request_context(caplog) -> None:
    caplog.set_level(logging.INFO, logger="stock-verify.transport")
    client = _build_client()

    with patch("backend.app.middleware.transport_logger.info") as mock_log:
        response = client.get(
            "/api/ping",
            headers={
                "X-Request-ID": "req-123",
                "Authorization": _make_bearer_token({"sub": "staff1"}),
            },
        )

    assert response.status_code == 200
    assert mock_log.called

    _, kwargs = mock_log.call_args
    extra = kwargs.get("extra", {})
    assert extra.get("request_id") == "req-123"
    assert extra.get("user_id") == "staff1"
    assert extra.get("endpoint") == "/api/ping"
    assert extra.get("method") == "GET"
    assert extra.get("status_code") == 200
    assert extra.get("result") == "success"
