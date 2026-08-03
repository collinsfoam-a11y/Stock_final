"""
Startup assertions for mobile route compatibility and prefix convention.

Mobile clients maintain an offline mutation queue (expo-sqlite). When regaining
connectivity, they flush queued POST/PUT/PATCH requests. HTTP 301/302 redirects
can alter request methods or drop bodies, corrupting queued mutations.

These checks enforce §4.6 mobile compatibility rules at application startup
and §5.5 prefix consistency standards.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRoute

from backend.config.core import settings

logger = logging.getLogger(__name__)

MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

FORBIDDEN_REDIRECT_CODES = {301, 302}

ALLOWED_ROOT_PATHS = {
    "/health",
    "/health/",
    "/docs",
    "/openapi.json",
    "/redoc",
}

MIN_CLIENT_VERSION = getattr(settings, "MIN_CLIENT_VERSION", "1.0.0")


def assert_mobile_compatibility(app: FastAPI) -> None:
    """
    Verify that mutation endpoints (POST/PUT/PATCH/DELETE) do not use
    301/302 redirects, which would corrupt offline mutation queues.

    Raises:
        RuntimeError: If a mutation endpoint has a forbidden redirect response.
    """
    violations: list[str] = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        if not any(
            method in MUTATION_METHODS
            for method in (route.methods or set())
        ):
            continue

        responses = getattr(route, "responses", None) or {}
        for status_code in responses.keys():
            # FastAPI accepts both int and str keys in `responses`, e.g.
            # {"301": {...}}. Normalize so string keys are not silently missed.
            try:
                code = int(status_code)
            except (TypeError, ValueError):
                continue
            if code in FORBIDDEN_REDIRECT_CODES:
                violations.append(
                    f"{route.name} {route.path} [{sorted(route.methods)}] "
                    f"has 301/302 redirect response — this corrupts "
                    f"offline mutation queues"
                )

    if violations:
        raise RuntimeError(
            "❌ Mobile compatibility violation: " + "; ".join(violations)
        )

    logger.info(
        "✅ Mobile compatibility check passed: no 301/302 on mutation paths"
    )


def assert_prefix_consistency(app: FastAPI) -> None:
    """
    Verify all business routes are under /api prefix.

    Exceptions (infra-only, not business routes):
    - /health*, /healthz (load balancer / Docker probes)
    - /docs, /redoc, /openapi.json (API documentation)
    """
    inconsistent: list[str] = []

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        if route.path in ALLOWED_ROOT_PATHS:
            continue

        if route.path.startswith("/health"):
            continue

        if route.path.startswith("/healthz"):
            continue

        if not route.path.startswith("/api"):
            inconsistent.append(f"{route.path} [{sorted(route.methods)}]")

    if inconsistent:
        for path in inconsistent:
            logger.warning(
                "⚠️  Route not under /api prefix: %s — "
                "consider moving to /api for forward consistency",
                path,
            )

    logger.info("✅ Prefix consistency check completed")


def assert_no_duplicate_routes(app: FastAPI) -> None:
    """
    Verify no path+method combination is registered more than once.

    Duplicate registrations can cause routing ambiguity and were the root
    cause of the health_router double-registration issue.
    """
    signatures: dict[tuple[str, str], list[str]] = {}

    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue

        for method in route.methods or []:
            if method in {"HEAD", "OPTIONS"}:
                continue
            key = (route.path, method)
            if key not in signatures:
                signatures[key] = []
            signatures[key].append(route.name)

    duplicates = {
        key: names
        for key, names in signatures.items()
        if len(names) > 1
    }

    if duplicates:
        msgs = [
            f"{path} {method} registered by {', '.join(names)}"
            for (path, method), names in sorted(duplicates.items())
        ]
        raise RuntimeError(
            "❌ Duplicate route registrations detected:\n" + "\n".join(msgs)
        )

    logger.info("✅ No duplicate route registrations")


def run_startup_checks(app: FastAPI) -> None:
    """
    Run all startup assertions for routing safety.

    Call this after register_routers() in the app factory.
    """
    assert_no_duplicate_routes(app)
    assert_mobile_compatibility(app)
    assert_prefix_consistency(app)


async def check_mongodb_replica_set(client: Any) -> None:
    """
    Assert that MongoDB is a replica set in production/staging.

    Per ARCHITECTURE_REVIEW.md §4.2: standalone Mongo silently degrades
    mongo_transaction() to no-op, making dev writes non-atomic. Production
    must run a replica set for transactional guarantees to hold.

    Per Phase 1 mandatory gate: fail fast in prod/staging if not a replica set.
    Development may warn or use a documented non-transactional mode.

    Args:
        client: AsyncIOMotorClient instance (from lifespan initialization).

    Raises:
        RuntimeError: If MongoDB is standalone in production/staging.
    """
    if client is None:
        logger.warning("MongoDB client not initialized — skipping replica-set check")
        return

    environment = getattr(settings, "ENVIRONMENT", "development").lower()

    try:
        repl_status = await client.admin.command("replSetGetStatus")
    except Exception as exc:
        # Any failure to query means we could not positively confirm a replica
        # set. Fail closed in prod/staging: an auth error or a network blip must
        # not be mistaken for a healthy topology.
        _raise_or_warn(
            environment,
            "Could not verify that MongoDB is a replica set. "
            "Transactions may degrade to no-op (non-atomic writes).",
            exc,
        )
        return

    if repl_status and repl_status.get("set"):
        logger.info("✅ MongoDB replica set verified: %s", repl_status.get("set"))
        return

    # Command succeeded but reported no set name — standalone or misconfigured.
    _raise_or_warn(
        environment,
        "MongoDB is not configured as a replica set. "
        "Transactions will degrade to no-op (non-atomic writes).",
        repl_status,
    )


def _raise_or_warn(environment: str, message: str, detail: Any) -> None:
    """Raise in production, warn in development."""
    if environment in ("production", "staging"):
        raise RuntimeError(
            f"FATAL: {message} "
            f"Production requires a MongoDB replica set. "
            f"Detail: {detail}"
        )
    logger.warning(
        "⚠️ %s (development mode — non-fatal)",
        message,
    )
