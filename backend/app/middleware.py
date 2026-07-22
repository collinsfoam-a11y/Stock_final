"""Middleware registration for FastAPI app composition."""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.types import ASGIApp, Receive, Send

API_VERSION = "2.1.0"


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
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "exp://localhost:8081",
    ]
    dev_origins = _parse_csv_values(getattr(settings, "CORS_DEV_ORIGINS", None))
    if dev_origins:
        allowed_origins.extend(dev_origins)
        logger.info("Added %s additional CORS origins from CORS_DEV_ORIGINS", len(dev_origins))
    return allowed_origins


def _resolve_cors_origin_regex(env: str) -> str | None:
    if env != "development":
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


def _register_projection_consistency_guard(app: FastAPI, settings: Any, logger: Any) -> None:
    enabled = getattr(settings, "PROJECTION_GUARD_ENABLED", None)
    if enabled is None:
        enabled = os.getenv("PROJECTION_GUARD_ENABLED", "true")
    if str(enabled).lower() != "true":
        logger.info("Projection consistency guard middleware disabled")
        return

    try:
        from backend.middleware.projection_consistency_guard import (
            ProjectionConsistencyGuardMiddleware,
        )

        app.add_middleware(ProjectionConsistencyGuardMiddleware)
        logger.info("Projection consistency guard middleware enabled")
    except Exception as exc:
        logger.warning("Projection consistency guard middleware registration failed: %s", exc)


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
    _register_projection_consistency_guard(app, settings, logger)

    app.add_middleware(APIVersionMiddleware)
    logger.info("API version middleware enabled (version: %s)", API_VERSION)

    app.add_middleware(GZipMiddleware, minimum_size=1000)

    # CORSMiddleware MUST be registered last so it is the outermost middleware
    # in Starlette's execution stack and can apply CORS headers to all responses (including 500 errors).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
