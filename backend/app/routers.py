"""Router registry/composition for FastAPI app."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from fastapi import APIRouter, FastAPI


@dataclass(frozen=True)
class RouterRegistry:
    health_router: APIRouter
    info_router: APIRouter
    permissions_router: APIRouter
    user_management_router: APIRouter
    mapping_router: APIRouter
    exports_router: APIRouter
    auth_router: APIRouter
    search_router: APIRouter
    metrics_router: APIRouter
    sync_router: APIRouter
    sync_management_router: APIRouter
    self_diagnosis_router: APIRouter
    security_router: APIRouter
    verification_router: APIRouter
    erp_router: APIRouter
    variance_router: APIRouter
    admin_control_router: APIRouter
    dynamic_fields_router: APIRouter
    dynamic_reports_router: APIRouter
    realtime_dashboard_router: APIRouter
    logs_router: APIRouter
    master_settings_router: APIRouter
    service_logs_router: APIRouter
    locations_router: APIRouter
    count_lines_router: APIRouter
    analytics_router: APIRouter
    sync_batch_router: APIRouter
    unknown_items_router: APIRouter
    unknown_items_public_router: APIRouter
    rack_router: APIRouter
    session_mgmt_router: APIRouter
    user_settings_router: APIRouter
    preferences_router: APIRouter
    reporting_router: APIRouter
    admin_dashboard_router: APIRouter
    report_generation_router: APIRouter
    error_reporting_router: APIRouter
    websocket_router: APIRouter
    sql_verification_router: APIRouter
    enhanced_item_router: APIRouter
    pi_router: APIRouter
    supervisor_pin_router: APIRouter
    notifications_router: APIRouter
    api_router: APIRouter

    enterprise_router: Optional[APIRouter] = None
    notes_router: Optional[APIRouter] = None
    sync_conflicts_router: Optional[APIRouter] = None
    enrichment_router: Optional[APIRouter] = None
    v2_router: Optional[APIRouter] = None
    pin_auth_router: Optional[APIRouter] = None
    reconciliation_router: Optional[APIRouter] = None
    recount_router: Optional[APIRouter] = None
    enterprise_available: bool = False


def _include_router_specs(
    app: FastAPI, specs: list[tuple[APIRouter, Optional[str], Optional[list[str]]]]
) -> None:
    for router, prefix, tags in specs:
        kwargs: dict[str, Any] = {}
        if prefix is not None:
            kwargs["prefix"] = prefix
        if tags is not None:
            kwargs["tags"] = tags
        app.include_router(router, **kwargs)


def _include_optional_router(
    app: FastAPI,
    router: Optional[APIRouter],
    logger: Any,
    *,
    prefix: Optional[str] = None,
    tags: Optional[list[str]] = None,
    success_log: Optional[str] = None,
    failure_log: str,
) -> None:
    if not router:
        return
    try:
        kwargs: dict[str, Any] = {}
        if prefix is not None:
            kwargs["prefix"] = prefix
        if tags is not None:
            kwargs["tags"] = tags
        app.include_router(router, **kwargs)
        if success_log:
            logger.info(success_log)
    except Exception as exc:
        logger.warning(f"{failure_log}: {exc}")


def _register_core_router_set(app: FastAPI, registry: RouterRegistry) -> None:
    specs: list[tuple[APIRouter, Optional[str], Optional[list[str]]]] = [
        (registry.health_router, None, ["health"]),
        (registry.health_router, "/api", ["health"]),
        (registry.info_router, None, None),
        (registry.permissions_router, "/api", None),
        (registry.user_management_router, "/api", None),
        (registry.mapping_router, None, None),
        (registry.exports_router, "/api", None),
        (registry.auth_router, "/api", None),
        (registry.search_router, None, None),
        (registry.metrics_router, "/api", None),
        (registry.sync_router, "/api", None),
        (registry.sync_management_router, "/api", None),
        (registry.self_diagnosis_router, "/api/diagnosis", None),
        (registry.security_router, None, None),
        (registry.verification_router, None, None),
        (registry.erp_router, "/api", None),
        (registry.variance_router, "/api", None),
        (registry.admin_control_router, None, None),
        (registry.dynamic_fields_router, None, None),
        (registry.dynamic_reports_router, None, None),
        (registry.realtime_dashboard_router, "/api", None),
        (registry.logs_router, "/api", None),
        (registry.master_settings_router, None, None),
        (registry.service_logs_router, None, None),
        (registry.locations_router, None, None),
        (registry.count_lines_router, "/api", None),
        (registry.analytics_router, "/api", None),
        (registry.sync_batch_router, None, None),
        (registry.unknown_items_public_router, "/api", None),
        (registry.unknown_items_router, None, None),
        (registry.rack_router, None, None),
        (registry.session_mgmt_router, None, None),
        (registry.user_settings_router, None, None),
        (registry.preferences_router, "/api", None),
        (registry.reporting_router, None, None),
        (registry.admin_dashboard_router, "/api", None),
        (registry.report_generation_router, "/api", None),
        (registry.error_reporting_router, None, None),
        (registry.websocket_router, None, None),
        (registry.sql_verification_router, None, None),
        (registry.enhanced_item_router, None, None),
        (registry.pi_router, None, None),
        (registry.supervisor_pin_router, "/api", ["Supervisor"]),
        (registry.api_router, "/api", None),
        (registry.notifications_router, None, None),
    ]
    _include_router_specs(app, specs)


def _register_optional_router_set(app: FastAPI, registry: RouterRegistry, logger: Any) -> None:
    if registry.enterprise_available and registry.enterprise_router is not None:
        app.include_router(registry.enterprise_router, prefix="/api")
        logger.info("Enterprise API router registered at /api/enterprise/*")

    if registry.notes_router or registry.sync_conflicts_router:
        try:
            if registry.notes_router:
                app.include_router(registry.notes_router, prefix="/api")
            if registry.sync_conflicts_router:
                app.include_router(registry.sync_conflicts_router, prefix="/api")
        except Exception as exc:
            logger.warning(f"Feature API router registration failed: {exc}")

    _include_optional_router(
        app,
        registry.enrichment_router,
        logger,
        success_log="Enrichment API router registered",
        failure_log="Enrichment API router not available",
    )
    _include_optional_router(
        app,
        registry.v2_router,
        logger,
        success_log="API v2 router registered",
        failure_log="API v2 router registration failed",
    )
    # Legacy PIN auth router intentionally not mounted.
    # Canonical PIN auth is served from backend.api.auth_routes (/api/auth/login-pin).
    _include_optional_router(
        app,
        registry.reconciliation_router,
        logger,
        failure_log="Reconciliation router registration failed",
    )
    _include_optional_router(
        app,
        registry.recount_router,
        logger,
        success_log="Recount API router registered",
        failure_log="Recount router registration failed",
    )


def register_routers(app: FastAPI, registry: RouterRegistry, logger: Any) -> None:
    """Register all routers in a single composition point."""
    _register_core_router_set(app, registry)
    _register_optional_router_set(app, registry, logger)
    logger.info("Phase 1-3 upgrade routers registered")
    logger.info("Admin Dashboard, Report Generation, and Dynamic Reports APIs registered")
