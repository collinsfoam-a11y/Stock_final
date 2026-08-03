import logging
import os
from pathlib import Path
from typing import Optional, Any

from fastapi import FastAPI
from fastapi.routing import APIRouter

from backend.config import settings
from backend.core.lifespan import lifespan

from backend.app.middleware import register_middleware
from backend.app.observability import init_observability
from backend.app.static import register_static_serving

# Routers
from backend.app.routers import RouterRegistry, register_routers
from backend.app.root_router import root_router, api_router as legacy_root_api_router
from backend.api import supervisor_pin
from backend.api.admin_control_api import admin_control_router
from backend.api.admin_dashboard_api import admin_dashboard_router
from backend.api.auth import router as auth_router
from backend.api.count_lines_api import router as count_lines_router
from backend.api.analytics_api import router as analytics_router
from backend.api.dynamic_fields_api import dynamic_fields_router
from backend.api.dynamic_reports_api import dynamic_reports_router
from backend.api.erp_api import router as erp_router
from backend.api.error_reporting_api import router as error_reporting_router
from backend.api.exports_api import exports_router
from backend.api.health import health_router, info_router
from backend.api.item_verification_api import verification_router
from backend.api.locations_api import router as locations_router
from backend.api.logs_api import router as logs_router
from backend.api.mapping_api import router as mapping_router
from backend.api.master_settings_api import master_settings_router
from backend.api.metrics_api import metrics_router
from backend.api.notifications_api import router as notifications_router
from backend.api.permissions_api import permissions_router
from backend.api.preferences_api import router as preferences_router
from backend.api.rack_api import router as rack_router
from backend.api.realtime_dashboard_api import realtime_dashboard_router
from backend.api.report_generation_api import report_generation_router
from backend.api.reporting_api import router as reporting_router
from backend.api.search_api import router as search_router
from backend.api.security_api import security_router
from backend.api.self_diagnosis_api import self_diagnosis_router
from backend.api.service_logs_api import service_logs_router
from backend.api.session_management_api import router as session_mgmt_router
from backend.api.enhanced_item_api import enhanced_item_router
from backend.api.pi_api import router as pi_router
from backend.api.sync_batch_api import router as sync_batch_router
from backend.api.offline_sync_api import router as offline_sync_router
from backend.api.unknown_items_api import public_router as unknown_items_public_router, router as unknown_items_router
from backend.api.sync_conflicts_api import sync_conflicts_router
from backend.api.sync_management_api import sync_management_router
from backend.api.sync_status_api import sync_router
from backend.api.recount_api import router as recount_router
from backend.api.approval_api import router as approval_router
from backend.api.damage_api import router as damage_router
from backend.api.user_management_api import user_management_router
from backend.api.user_settings_api import router as user_settings_router
from backend.api.variance_api import router as variance_router
from backend.api.websocket_api import router as websocket_router
from backend.api.sql_verification_api import router as sql_verification_router

# Optional Services
enrichment_router: Optional[APIRouter] = None
try:
    from backend.api.enrichment_api import enrichment_router as e_router
    enrichment_router = e_router
except ImportError:
    pass

enterprise_router: Optional[APIRouter] = None
ENTERPRISE_AVAILABLE = False
try:
    from backend.api.enterprise_api import enterprise_router as ent_router
    enterprise_router = ent_router
    ENTERPRISE_AVAILABLE = True
except ImportError:
    pass

notes_router: Optional[APIRouter] = None
try:
    from backend.api.notes_api import router as n_router
    notes_router = n_router
except ImportError:
    pass

v2_router: Optional[APIRouter] = None
try:
    from backend.api.v2 import v2_router as v2_r
    v2_router = v2_r
except ImportError:
    pass

reconciliation_router: Optional[APIRouter] = None
try:
    from backend.api.reconciliation_api import router as rec_router
    reconciliation_router = rec_router
except ImportError:
    pass

pin_auth_router: Optional[APIRouter] = None
try:
    from backend.api.pin_auth_api import router as pa_router
    pin_auth_router = pa_router
except ImportError:
    pass

SecurityHeadersMiddleware: Any = None
try:
    from backend.middleware.security_headers import SecurityHeadersMiddleware as SHM
    SecurityHeadersMiddleware = SHM
except ImportError:
    pass

logger = logging.getLogger("stock-verify")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

def _api_docs_enabled() -> bool:
    env = str(getattr(settings, "ENVIRONMENT", "development") or "development").lower()
    if env in {"production", "staging"}:
        return os.getenv("ENABLE_API_DOCS", "false").lower() in {"1", "true", "yes"}
    return os.getenv("ENABLE_API_DOCS", "true").lower() not in {"0", "false", "no"}

def create_app() -> FastAPI:
    _docs_enabled = _api_docs_enabled()
    
    app = FastAPI(
        title=getattr(settings, "APP_NAME", "Stock Count API"),
        description="Stock counting and ERP sync API",
        version=getattr(settings, "APP_VERSION", "1.0.0"),
        lifespan=lifespan,
        docs_url="/docs" if _docs_enabled else None,
        redoc_url="/redoc" if _docs_enabled else None,
        openapi_url="/openapi.json" if _docs_enabled else None,
    )

    init_observability(app, settings)

    register_middleware(
        app,
        settings=settings,
        logger=logger,
        security_headers_middleware=SecurityHeadersMiddleware,
    )

    app.include_router(root_router)
    
    registry = RouterRegistry(
        health_router=health_router,
        info_router=info_router,
        permissions_router=permissions_router,
        user_management_router=user_management_router,
        mapping_router=mapping_router,
        exports_router=exports_router,
        auth_router=auth_router,
        search_router=search_router,
        metrics_router=metrics_router,
        sync_router=sync_router,
        sync_management_router=sync_management_router,
        self_diagnosis_router=self_diagnosis_router,
        security_router=security_router,
        verification_router=verification_router,
        erp_router=erp_router,
        variance_router=variance_router,
        admin_control_router=admin_control_router,
        dynamic_fields_router=dynamic_fields_router,
        dynamic_reports_router=dynamic_reports_router,
        realtime_dashboard_router=realtime_dashboard_router,
        logs_router=logs_router,
        master_settings_router=master_settings_router,
        service_logs_router=service_logs_router,
        locations_router=locations_router,
        count_lines_router=count_lines_router,
        analytics_router=analytics_router,
        sync_batch_router=sync_batch_router,
        offline_sync_router=offline_sync_router,
        unknown_items_router=unknown_items_router,
        unknown_items_public_router=unknown_items_public_router,
        rack_router=rack_router,
        session_mgmt_router=session_mgmt_router,
        user_settings_router=user_settings_router,
        preferences_router=preferences_router,
        reporting_router=reporting_router,
        admin_dashboard_router=admin_dashboard_router,
        report_generation_router=report_generation_router,
        error_reporting_router=error_reporting_router,
        websocket_router=websocket_router,
        sql_verification_router=sql_verification_router,
        enhanced_item_router=enhanced_item_router,
        pi_router=pi_router,
        supervisor_pin_router=supervisor_pin.router,
        notifications_router=notifications_router,
        api_router=legacy_root_api_router,
        damage_router=damage_router,
        enterprise_router=enterprise_router,
        notes_router=notes_router,
        sync_conflicts_router=sync_conflicts_router,
        enrichment_router=enrichment_router,
        v2_router=v2_router,
        pin_auth_router=pin_auth_router,
        reconciliation_router=reconciliation_router,
        recount_router=recount_router,
        approval_router=approval_router,
        enterprise_available=ENTERPRISE_AVAILABLE,
    )
    register_routers(app, registry, logger)

    # Routing safety checks — enforce mobile compatibility (§4.6) and
    # prefix convention (§5.5) at startup.
    from backend.core.startup_checks import run_startup_checks

    run_startup_checks(app)

    # Diagnostic: log all registered health-related routes to troubleshoot
    # /api/health returning 404 (catch-all SPA fallback in static.py returns 404
    # for any api/* path that is not matched by a real router).
    _health_routes = [
        getattr(r, "path", "")
        for r in app.routes
        if "health" in getattr(r, "path", "").lower()
    ]
    logger.info("Registered health routes: %s", _health_routes)

    if os.getenv("LOG_ROUTE_TABLE", "false").lower() == "true":
        for route in app.routes:
            if hasattr(route, "path"):
                logger.info("Route: %s", route.path)

    register_static_serving(app, Path(__file__).parent.parent.parent / "frontend" / "dist", logger)

    return app
