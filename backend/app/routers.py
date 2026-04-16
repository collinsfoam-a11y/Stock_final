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
    enterprise_available: bool = False


def register_routers(app: FastAPI, registry: RouterRegistry, logger: Any) -> None:
    """Register all routers in a single composition point."""
    app.include_router(registry.health_router, tags=["health"])
    app.include_router(registry.health_router, prefix="/api", tags=["health"])
    app.include_router(registry.info_router)

    app.include_router(registry.permissions_router, prefix="/api")
    app.include_router(registry.user_management_router, prefix="/api")
    app.include_router(registry.mapping_router)
    app.include_router(registry.exports_router, prefix="/api")
    app.include_router(registry.auth_router, prefix="/api")
    app.include_router(registry.search_router)
    app.include_router(registry.metrics_router, prefix="/api")
    app.include_router(registry.sync_router, prefix="/api")
    app.include_router(registry.sync_management_router, prefix="/api")
    app.include_router(registry.self_diagnosis_router, prefix="/api/diagnosis")
    app.include_router(registry.security_router)
    app.include_router(registry.verification_router)
    app.include_router(registry.erp_router, prefix="/api")
    app.include_router(registry.variance_router, prefix="/api")
    app.include_router(registry.admin_control_router)
    app.include_router(registry.dynamic_fields_router)
    app.include_router(registry.dynamic_reports_router)
    app.include_router(registry.realtime_dashboard_router, prefix="/api")
    app.include_router(registry.logs_router, prefix="/api")
    app.include_router(registry.master_settings_router)
    app.include_router(registry.service_logs_router)
    app.include_router(registry.locations_router)
    app.include_router(registry.count_lines_router, prefix="/api")
    app.include_router(registry.analytics_router, prefix="/api")

    app.include_router(registry.sync_batch_router)
    app.include_router(registry.unknown_items_public_router, prefix="/api")
    app.include_router(registry.unknown_items_router)
    app.include_router(registry.rack_router)
    app.include_router(registry.session_mgmt_router)
    app.include_router(registry.user_settings_router)
    app.include_router(registry.preferences_router, prefix="/api")
    app.include_router(registry.reporting_router)
    app.include_router(registry.admin_dashboard_router, prefix="/api")
    app.include_router(registry.report_generation_router, prefix="/api")
    app.include_router(registry.error_reporting_router)
    app.include_router(registry.websocket_router)
    app.include_router(registry.sql_verification_router)
    app.include_router(registry.enhanced_item_router)
    app.include_router(registry.pi_router)

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

    if registry.enrichment_router:
        try:
            app.include_router(registry.enrichment_router)
            logger.info("Enrichment API router registered")
        except Exception as exc:
            logger.warning(f"Enrichment API router not available: {exc}")

    if registry.v2_router:
        try:
            app.include_router(registry.v2_router)
            logger.info("API v2 router registered")
        except Exception as exc:
            logger.warning(f"API v2 router registration failed: {exc}")

    app.include_router(registry.supervisor_pin_router, prefix="/api", tags=["Supervisor"])

    if registry.pin_auth_router:
        try:
            app.include_router(registry.pin_auth_router, prefix="/api", tags=["PIN Auth"])
        except Exception as exc:
            logger.warning(f"PIN auth API router registration failed: {exc}")

    app.include_router(registry.api_router, prefix="/api")

    if registry.reconciliation_router:
        try:
            app.include_router(registry.reconciliation_router)
        except Exception as exc:
            logger.warning(f"Reconciliation router registration failed: {exc}")

    app.include_router(registry.notifications_router)

    logger.info("Phase 1-3 upgrade routers registered")
    logger.info("Admin Dashboard, Report Generation, and Dynamic Reports APIs registered")
