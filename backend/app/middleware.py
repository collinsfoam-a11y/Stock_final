"""Middleware registration for FastAPI app composition."""

from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from starlette.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Receive, Send

from backend.db.runtime import get_db
from backend.services.projection_snapshot import (
    capture_latest_session_snapshot,
    reset_projection_snapshot_ts,
    set_projection_snapshot_ts,
    snapshot_mode_enabled,
)

API_VERSION = "2.1.0"
transport_logger = logging.getLogger("stock-verify.transport")


class APIVersionMiddleware:
    """Middleware to add X-API-Version header to all responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_version(message):
            if message["type"] == "http.response.start":
                message["headers"].append((b"x-api-version", API_VERSION.encode()))
            await send(message)

        await self.app(scope, receive, send_with_version)


class TransportExceptionMiddleware:
    """Ensure transport-safe JSON responses for unhandled HTTP exceptions."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        try:
            await self.app(scope, receive, send)
        except Exception as exc:  # pragma: no cover - exercised via integration tests
            transport_logger.exception("Unhandled request exception", exc_info=exc)
            response = JSONResponse(
                status_code=500,
                content={
                    "detail": {
                        "message": "Internal server error",
                        "code": "INTERNAL_SERVER_ERROR",
                    }
                },
            )
            await response(scope, receive, send)


def _safe_decode_header(value: bytes | str | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore")
    return str(value)


def _extract_user_from_authorization(scope_headers: dict[bytes, bytes]) -> str:
    token_header = _safe_decode_header(scope_headers.get(b"authorization")).strip()
    if not token_header.lower().startswith("bearer "):
        return "anonymous"
    token = token_header[7:].strip()
    parts = token.split(".")
    if len(parts) < 2:
        return "anonymous"

    payload = parts[1]
    padding = "=" * ((4 - len(payload) % 4) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{payload}{padding}")
        data = json.loads(decoded.decode("utf-8"))
        if isinstance(data, dict):
            user = data.get("sub") or data.get("username") or data.get("user_id")
            if user:
                return str(user)
    except Exception:  # pragma: no cover - defensive
        return "anonymous"
    return "anonymous"


class RequestAuditMiddleware:
    """Emit request-level structured logs with latency and outcome."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        start_time = time.perf_counter()
        method = _safe_decode_header(scope.get("method"))
        endpoint = _safe_decode_header(scope.get("path"))
        raw_headers = dict(scope.get("headers", []))
        request_id = _safe_decode_header(raw_headers.get(b"x-request-id")) or "unknown"
        user_id = _extract_user_from_authorization(raw_headers)
        status_code = 500

        async def send_wrapper(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message.get("status", 500))

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            status_code = 500
            raise
        finally:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            transport_logger.info(
                "request_audit",
                extra={
                    "request_id": request_id,
                    "user_id": user_id,
                    "endpoint": endpoint,
                    "method": method,
                    "latency_ms": latency_ms,
                    "result": "success" if status_code < 400 else "failure",
                    "status_code": status_code,
                },
            )


class ProjectionSnapshotMiddleware:
    """Pin validation/rollout reads to a request-scoped source snapshot."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not snapshot_mode_enabled():
            return await self.app(scope, receive, send)

        snapshot_ts = None
        try:
            snapshot_ts = await capture_latest_session_snapshot(get_db())
        except Exception:
            transport_logger.warning(
                "projection_snapshot_capture_failed",
                exc_info=True,
            )
        if snapshot_ts is None:
            return await self.app(scope, receive, send)

        scope.setdefault("state", {})["projection_snapshot_ts"] = snapshot_ts
        token = set_projection_snapshot_ts(snapshot_ts)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_projection_snapshot_ts(token)


def _parse_csv_values(value: Any) -> list[str]:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    if not value:
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _resolve_allowed_hosts(settings: Any, env: str) -> list[str]:
    allowed_hosts = _parse_csv_values(getattr(settings, "ALLOWED_HOSTS", None))
    if env in {"development", "test"}:
        # In local development/testing, frontend and mobile clients often hit the
        # backend via LAN IPs or emulator aliases (e.g. 192.168.x.x, 10.0.2.2).
        # Disabling TrustedHost in these environments avoids false 400 responses.
        return ["*"]
    return allowed_hosts


def _resolve_allowed_origins(settings: Any, env: str, logger: Any) -> list[str]:
    configured_origins = _parse_csv_values(getattr(settings, "CORS_ALLOW_ORIGINS", None))
    if configured_origins:
        return configured_origins

    if env != "development":
        logger.warning(
            "CORS_ALLOW_ORIGINS not configured for non-development environment; "
            "requests may be blocked"
        )
        return []

    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:8083",
        "http://127.0.0.1:8083",
        "exp://localhost:8081",
    ]
    dev_origins = _parse_csv_values(getattr(settings, "CORS_DEV_ORIGINS", None))
    if dev_origins:
        allowed_origins.extend(dev_origins)
        logger.info("Added %s additional CORS origins from CORS_DEV_ORIGINS", len(dev_origins))
    return allowed_origins


def _resolve_cors_origin_regex(env: str) -> str | None:
    if env not in {"development", "test"}:
        return None
    return (
        r"(https?|exp)://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?"
    )


def _register_trusted_host_middleware(
    app: FastAPI, *, allowed_hosts: list[str], env: str, logger: Any
) -> None:
    if allowed_hosts and "*" not in allowed_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts)
        logger.info("Trusted host middleware enabled (hosts: %s)", allowed_hosts)
        return
    if env not in {"development", "test"}:
        logger.warning(
            "ALLOWED_HOSTS not configured for non-development environment; "
            "Host header validation is disabled"
        )


def _register_security_headers(app: FastAPI, security_headers_middleware: Any, logger: Any) -> None:
    if security_headers_middleware is None:
        logger.warning("Security headers middleware not available")
        return

    try:
        strict_csp = os.getenv("STRICT_CSP", "false").lower() == "true"
        force_https = os.getenv("FORCE_HTTPS", "false").lower() == "true"
        app.add_middleware(
            security_headers_middleware,  # type: ignore[arg-type]
            STRICT_CSP=strict_csp,
            force_https=force_https,
        )
        logger.info("Security headers middleware enabled")
    except Exception as exc:
        logger.warning("Security headers middleware registration failed: %s", exc)


def _register_lan_enforcement(app: FastAPI, settings: Any, logger: Any) -> None:
    if not getattr(settings, "ENABLE_LAN_ENFORCEMENT", False):
        return

    try:
        from backend.middleware.lan_enforcement import LANEnforcementMiddleware

        app.add_middleware(LANEnforcementMiddleware)
        logger.info("LAN enforcement middleware enabled")
    except Exception as exc:
        logger.warning("LAN enforcement middleware registration failed: %s", exc)


def register_middleware(
    app: FastAPI,
    *,
    settings: Any,
    logger: Any,
    security_headers_middleware: Any = None,
) -> None:
    """Register app middleware while preserving current behavior/order."""
    env = getattr(settings, "ENVIRONMENT", "development").lower()
    allowed_hosts = _resolve_allowed_hosts(settings, env)
    allowed_origins = _resolve_allowed_origins(settings, env, logger)
    cors_origin_regex = _resolve_cors_origin_regex(env)

    _register_trusted_host_middleware(app, allowed_hosts=allowed_hosts, env=env, logger=logger)
    _register_security_headers(app, security_headers_middleware, logger)
    _register_lan_enforcement(app, settings, logger)

    app.add_middleware(APIVersionMiddleware)
    logger.info("API version middleware enabled (version: %s)", API_VERSION)

    app.add_middleware(RequestAuditMiddleware)
    app.add_middleware(ProjectionSnapshotMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(TransportExceptionMiddleware)

    # Keep CORS outermost so all responses (including error responses raised by
    # downstream middleware/routes) carry transport headers expected by browsers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
