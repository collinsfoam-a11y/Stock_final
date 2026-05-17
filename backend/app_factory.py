import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, TypeVar

# Add the parent directory to Python path for proper imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response  # noqa: E402
from starlette.requests import Request  # noqa: E402

import sentry_sdk  # noqa: E402
from sentry_sdk.integrations.fastapi import FastApiIntegration  # noqa: E402
from sentry_sdk.integrations.starlette import StarletteIntegration  # noqa: E402

from backend.app.middleware import register_middleware  # noqa: E402
from backend.app.routers import RouterRegistry, register_routers  # noqa: E402
from backend.app.settings_runtime import run_server_main  # noqa: E402
from backend.app.static import register_static_serving  # noqa: E402

from backend.api import supervisor_pin  # noqa: E402
from backend.api.admin_control_api import admin_control_router  # noqa: E402
from backend.api.admin_dashboard_api import admin_dashboard_router  # noqa: E402
from backend.api.auth import router as auth_router  # noqa: E402
from backend.api.count_lines_api import router as count_lines_router  # noqa: E402
from backend.api.analytics_api import router as analytics_router  # noqa: E402
from backend.api.dynamic_fields_api import dynamic_fields_router  # noqa: E402
from backend.api.dynamic_reports_api import dynamic_reports_router  # noqa: E402
from backend.api.erp_api import router as erp_router  # noqa: E402
from backend.api.error_reporting_api import router as error_reporting_router  # noqa: E402
from backend.api.exports_api import exports_router  # noqa: E402
from backend.api.health import health_router, info_router  # noqa: E402
from backend.api.item_verification_api import verification_router  # noqa: E402
from backend.api.locations_api import router as locations_router  # noqa: E402
from backend.api.logs_api import router as logs_router  # noqa: E402
from backend.api.mapping_api import router as mapping_router  # noqa: E402
from backend.api.master_settings_api import master_settings_router  # noqa: E402
from backend.api.metrics_api import metrics_router  # noqa: E402
from backend.api.notifications_api import router as notifications_router  # noqa: E402

# New feature API routers
from backend.api.permissions_api import permissions_router  # noqa: E402
from backend.api.preferences_api import router as preferences_router  # noqa: E402
from backend.api.rack_api import router as rack_router  # noqa: E402
from backend.api.realtime_dashboard_api import realtime_dashboard_router  # noqa: E402
from backend.api.report_generation_api import report_generation_router  # noqa: E402
from backend.api.reporting_api import router as reporting_router  # noqa: E402
from backend.api.schemas import ApiResponse, Session, TokenResponse  # noqa: E402
from backend.api.search_api import router as search_router  # noqa: E402
from backend.api.security_api import security_router  # noqa: E402
from backend.api.self_diagnosis_api import self_diagnosis_router  # noqa: E402
from backend.api.service_logs_api import service_logs_router  # noqa: E402
from backend.api.session_management_api import router as session_mgmt_router  # noqa: E402
from backend.api.enhanced_item_api import enhanced_item_router  # noqa: E402
from backend.api.pi_api import router as pi_router  # noqa: E402

# Phase 1-3: New Upgrade APIs
from backend.api.sync_batch_api import router as sync_batch_router  # noqa: E402
from backend.api.unknown_items_api import (  # noqa: E402
    public_router as unknown_items_public_router,
    router as unknown_items_router,
)

# New feature services
from backend.api.sync_conflicts_api import sync_conflicts_router  # noqa: E402
from backend.api.sync_management_api import sync_management_router  # noqa: E402
from backend.api.sync_status_api import sync_router  # noqa: E402
from backend.api.recount_api import router as recount_router  # noqa: E402
from backend.api.user_management_api import user_management_router  # noqa: E402
from backend.api.user_settings_api import router as user_settings_router  # noqa: E402
from backend.api.variance_api import router as variance_router  # noqa: E402
from backend.api.websocket_api import router as websocket_router  # noqa: E402
from backend.api.sql_verification_api import router as sql_verification_router  # noqa: E402
from backend.auth.cookies import clear_auth_cookies, get_refresh_token_cookie, set_auth_cookies  # noqa: E402
from backend.auth.dependencies import get_current_user  # noqa: E402
from backend.auth.dependencies import require_admin as auth_require_admin  # noqa: E402
from backend.config import settings  # noqa: E402
from backend.core.lifespan import (  # noqa: E402
    activity_log_service,
    db,
    lifespan,
)
from backend.exceptions import AuthenticationError  # noqa: E402
from backend.exceptions import ValidationError  # noqa: E402
from backend.services.canonical_inventory import build_session_lookup  # noqa: E402
from backend.services.count_line_write_service import CountLineWriteService  # noqa: E402

# Utils
from backend.utils.api_utils import result_to_response, sanitize_for_logging  # noqa: E402
from backend.utils.auth_utils import get_password_hash, get_password_hash_metadata  # noqa: E402
from backend.utils.result import Fail, Ok, Result  # noqa: E402
from backend.utils.tracing import instrument_fastapi_app  # noqa: E402
from backend.services.runtime import get_refresh_token_service  # noqa: E402

# Initialize logger early
logger = logging.getLogger("stock-verify")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# Optional Services
enrichment_router: Optional[APIRouter] = None
try:
    from backend.api.enrichment_api import enrichment_router as e_router  # noqa: E402

    enrichment_router = e_router
except ImportError:
    pass

enterprise_router: Optional[APIRouter] = None
ENTERPRISE_AVAILABLE = False
try:
    from backend.api.enterprise_api import enterprise_router as ent_router  # noqa: E402

    enterprise_router = ent_router
    ENTERPRISE_AVAILABLE = True
except ImportError as e:
    logger.info(
        "Enterprise features not available: %s",
        sanitize_for_logging(str(e), 200),
    )

notes_router: Optional[APIRouter] = None
try:
    from backend.api.notes_api import router as n_router  # noqa: E402

    notes_router = n_router
except ImportError:
    pass

v2_router: Optional[APIRouter] = None
try:
    from backend.api.v2 import v2_router as v2_r  # noqa: E402

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
    from backend.api.pin_auth_api import router as pa_router  # noqa: E402

    pin_auth_router = pa_router
except ImportError:
    pass

SecurityHeadersMiddleware: Any = None
try:
    from backend.middleware.security_headers import SecurityHeadersMiddleware as SHM  # noqa: E402

    SecurityHeadersMiddleware = SHM
except ImportError:
    pass

T = TypeVar("T")
E = TypeVar("E", bound=Exception)
R = TypeVar("R")

RUNNING_UNDER_PYTEST = "pytest" in sys.modules

ROOT_DIR = Path(__file__).parent

# Removed redundant SECRET_KEY, ALGORITHM bindings

# Initialize Sentry if DSN is provided
sentry_dsn = getattr(settings, "SENTRY_DSN", None)
if sentry_dsn:
    try:
        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[
                StarletteIntegration(transaction_style="endpoint"),
                FastApiIntegration(transaction_style="endpoint"),
            ],
            traces_sample_rate=getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", 0.1),
            profiles_sample_rate=getattr(settings, "SENTRY_PROFILES_SAMPLE_RATE", 0.1),
            environment=(
                getattr(settings, "SENTRY_ENVIRONMENT", None)
                or getattr(settings, "ENVIRONMENT", "development")
            ),
        )
        logger.info("Sentry SDK initialized")
    except Exception as e:
        logger.warning(
            "Failed to initialize Sentry SDK: %s",
            sanitize_for_logging(str(e), 200),
        )
else:
    logger.info("Sentry DSN not found, skipping Sentry initialization")


def _api_docs_enabled() -> bool:
    """Disable generated API docs in production unless explicitly enabled."""
    env = str(getattr(settings, "ENVIRONMENT", "development") or "development").lower()
    if env in {"production", "staging"}:
        return os.getenv("ENABLE_API_DOCS", "false").lower() in {"1", "true", "yes"}
    return os.getenv("ENABLE_API_DOCS", "true").lower() not in {"0", "false", "no"}


_docs_enabled = _api_docs_enabled()

# Create FastAPI app with lifespan
app = FastAPI(
    title=getattr(settings, "APP_NAME", "Stock Count API"),
    description="Stock counting and ERP sync API",
    version=getattr(settings, "APP_VERSION", "1.0.0"),
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Attach OpenTelemetry tracing to the FastAPI app if enabled
try:
    instrument_fastapi_app(app)
except Exception:
    # Tracing should never prevent the app from starting
    pass

register_middleware(
    app,
    settings=settings,
    logger=logger,
    security_headers_middleware=SecurityHeadersMiddleware,
)

# Create API router
api_router = APIRouter()


# Add root endpoint
@app.get("/", status_code=200)
async def root():
    """Root endpoint - basic service information"""
    return {
        "service": "stock-verify-backend",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {"health": "/health", "api": "/api", "docs": "/docs"},
    }


@app.get("/api/mapping/test_direct")
def test_direct(_current_user: dict = Depends(auth_require_admin)):
    """Return a minimal payload for mapping smoke tests."""
    return {"status": "ok"}


# Pydantic Models


# Note: verify_password and get_password_hash are imported from backend.utils.auth_utils (line 72)


def _password_fields(password: str) -> dict[str, str]:
    hashed_password = get_password_hash(password)
    return {"hashed_password": hashed_password, **get_password_hash_metadata(hashed_password)}





# Initialize default users
async def init_default_users():
    """Create default users if they don't exist"""
    try:
        # Check for staff1
        staff_exists = await db.users.find_one({"username": "staff1"})
        if not staff_exists:
            await db.users.insert_one(
                {
                    "username": "staff1",
                    **_password_fields("staff123"),
                    "full_name": "Staff Member",
                    "role": "staff",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: staff1")

        # Check for supervisor
        supervisor_exists = await db.users.find_one({"username": "supervisor"})
        if not supervisor_exists:
            await db.users.insert_one(
                {
                    "username": "supervisor",
                    **_password_fields("super123"),
                    "full_name": "Supervisor",
                    "role": "supervisor",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: supervisor")

        # Check for admin
        admin_exists = await db.users.find_one({"username": "admin"})
        if not admin_exists:
            await db.users.insert_one(
                {
                    "username": "admin",
                    **_password_fields("admin123"),
                    "full_name": "Administrator",
                    "role": "admin",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: admin")
    except Exception as e:
        logger.error(
            "Error creating default users: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise


# Initialize mock ERP data
async def init_mock_erp_data():
    """Populate local mock ERP data when the collection is empty."""
    count = await db.erp_items.count_documents({})
    if count == 0:
        mock_items = [
            {
                "item_code": "ITEM001",
                "item_name": "Rice Bag 25kg",
                "barcode": "1234567890123",
                "stock_qty": 150.0,
                "mrp": 1200.0,
                "category": "Food",
                "warehouse": "Main",
                "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=200",
            },
            {
                "item_code": "ITEM002",
                "item_name": "Cooking Oil 5L",
                "barcode": "1234567890124",
                "stock_qty": 80.0,
                "mrp": 650.0,
                "category": "Food",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM003",
                "item_name": "Sugar 1kg",
                "barcode": "1234567890125",
                "stock_qty": 200.0,
                "mrp": 50.0,
                "category": "Food",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM004",
                "item_name": "Tea Powder 250g",
                "barcode": "1234567890126",
                "stock_qty": 95.0,
                "mrp": 180.0,
                "category": "Beverages",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM005",
                "item_name": "Soap Bar",
                "barcode": "1234567890127",
                "stock_qty": 300.0,
                "mrp": 25.0,
                "category": "Personal Care",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM006",
                "item_name": "Shampoo 200ml",
                "barcode": "1234567890128",
                "stock_qty": 120.0,
                "mrp": 150.0,
                "category": "Personal Care",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM007",
                "item_name": "Toothpaste",
                "barcode": "1234567890129",
                "stock_qty": 180.0,
                "mrp": 75.0,
                "category": "Personal Care",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM008",
                "item_name": "Wheat Flour 10kg",
                "barcode": "1234567890130",
                "stock_qty": 90.0,
                "mrp": 400.0,
                "category": "Food",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM009",
                "item_name": "Detergent Powder 1kg",
                "barcode": "1234567890131",
                "stock_qty": 110.0,
                "mrp": 120.0,
                "category": "Household",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM010",
                "item_name": "Biscuits Pack",
                "barcode": "1234567890132",
                "stock_qty": 250.0,
                "mrp": 30.0,
                "category": "Snacks",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM_TEST_E2E",
                "item_name": "E2E Test Item",
                "barcode": "513456",
                "stock_qty": 100.0,
                "mrp": 999.0,
                "category": "Test",
                "warehouse": "Main",
            },
        ]
        await db.erp_items.insert_many(mock_items)
        logger.info("Mock ERP data initialized")


# Routes





@api_router.post("/auth/refresh", response_model=ApiResponse[TokenResponse])
@result_to_response(success_status=200)
async def refresh_token(
    request: Request,
    response: Response,
) -> Result[dict[str, Any], Exception]:
    """
    Refresh access token using refresh token.

    Request body should contain: {"refresh_token": "uuid-string"}
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}
        refresh_token_value = body.get("refresh_token") or get_refresh_token_cookie(request)

        if not refresh_token_value:
            return Fail(ValidationError("Refresh token is required"))

        token_service = get_refresh_token_service()
        refreshed = await token_service.refresh_access_token(refresh_token_value)
        if not refreshed:
            return Fail(AuthenticationError("Invalid or expired refresh token"))

        access_token = refreshed.get("access_token")
        next_refresh_token = refreshed.get("refresh_token")
        if isinstance(access_token, str) and isinstance(next_refresh_token, str):
            set_auth_cookies(response, access_token, next_refresh_token)

        return Ok(refreshed)
    except Exception as e:
        logger.error("Token refresh error: %s", sanitize_for_logging(str(e), 200))
        return Fail(e)


@api_router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Logout user by revoking their refresh token.

    Request body should contain: {"refresh_token": "uuid-string"}
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}
        refresh_token_value = body.get("refresh_token") or get_refresh_token_cookie(request)

        if refresh_token_value:
            token_service = get_refresh_token_service()
            payload = await token_service.verify_refresh_token(refresh_token_value)
            # M11 fix: Always revoke the token if it's valid, regardless of sub match.
            # The user is already authenticated via get_current_user, so the logout
            # intent is clear. Skipping revocation on sub mismatch leaves tokens active.
            if payload:
                await token_service.revoke_token(refresh_token_value)

        clear_auth_cookies(response)
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.error("Logout error: %s", sanitize_for_logging(str(e), 200))
        raise HTTPException(status_code=500, detail="Logout failed") from e


# Session routes
# NOTE: /sessions/bulk/close is handled by session_management_api.py (canonical)


@api_router.post("/sessions/bulk/export")
async def bulk_export_sessions(
    session_ids: list[str],
    format: str = "excel",
    current_user: dict = Depends(get_current_user),
):
    """Bulk export sessions (supervisor only)"""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        sessions = []
        for session_id in session_ids:
            session = await db.sessions.find_one(
                {"$or": [{"id": session_id}, {"session_id": session_id}]}
            )
            if session:
                sessions.append(session)

        # Log activity
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user["role"],
            action="bulk_export_sessions",
            entity_type="session",
            entity_id=None,
            details={
                "operation": "bulk_export",
                "count": len(sessions),
                "format": format,
            },
            ip_address=None,
            user_agent=None,
        )

        return {
            "success": True,
            "exported_count": len(sessions),
            "total": len(session_ids),
            "data": sessions,
            "format": format,
        }
    except Exception as e:
        logger.error(
            "Bulk export sessions error: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


@api_router.get("/legacy/sessions/analytics")
async def get_sessions_analytics(current_user: dict = Depends(get_current_user)):
    """Get aggregated session analytics (supervisor only)"""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        # Aggregation pipeline for efficient server-side calculation
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_sessions": {"$sum": 1},
                    "total_items": {"$sum": "$total_items"},
                    "total_variance": {"$sum": "$total_variance"},
                    "avg_variance": {"$avg": "$total_variance"},
                    "sessions_by_status": {"$push": {"status": "$status", "count": 1}},
                }
            }
        ]

        # Sessions by date
        date_pipeline = [
            {
                "$project": {
                    "date": {"$substr": ["$started_at", 0, 10]},
                    "warehouse": 1,
                    "staff_name": 1,
                    "total_items": 1,
                    "total_variance": 1,
                }
            },
            {"$group": {"_id": "$date", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]

        # Variance by warehouse
        warehouse_pipeline = [
            {
                "$group": {
                    "_id": "$warehouse",
                    "total_variance": {"$sum": {"$abs": "$total_variance"}},
                    "session_count": {"$sum": 1},
                }
            }
        ]

        # Items by staff
        staff_pipeline = [
            {
                "$group": {
                    "_id": "$staff_name",
                    "total_items": {"$sum": "$total_items"},
                    "session_count": {"$sum": 1},
                }
            }
        ]

        # Execute aggregations
        overall = await db.sessions.aggregate(pipeline).to_list(1)
        by_date = await db.sessions.aggregate(date_pipeline).to_list(None)  # type: ignore
        by_warehouse = await db.sessions.aggregate(warehouse_pipeline).to_list(None)
        by_staff = await db.sessions.aggregate(staff_pipeline).to_list(None)

        # Transform results
        sessions_by_date = {item["_id"]: item["count"] for item in by_date}
        variance_by_warehouse = {item["_id"]: item["total_variance"] for item in by_warehouse}
        items_by_staff = {item["_id"]: item["total_items"] for item in by_staff}

        return {
            "success": True,
            "data": {
                "overall": overall[0] if overall else {},
                "sessions_by_date": sessions_by_date,
                "variance_by_warehouse": variance_by_warehouse,
                "items_by_staff": items_by_staff,
                "total_sessions": overall[0]["total_sessions"] if overall else 0,
            },
        }
    except Exception as e:
        logger.error("Analytics error: %s", sanitize_for_logging(str(e), 200))
        raise HTTPException(status_code=500, detail=str(e)) from e


# Legacy route retained under explicit namespace to avoid duplicate /api/sessions/{session_id}.
@api_router.get("/legacy/sessions/{session_id}")
async def get_session_by_id(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a specific session by ID"""
    try:
        session = await db.sessions.find_one(build_session_lookup(session_id))

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check permissions
        if (
            current_user["role"] not in ("supervisor", "admin")
            and session.get("staff_user") != current_user["username"]
        ):
            raise HTTPException(status_code=403, detail="Access denied")

        # Preserve identity: use string version of '_id' if 'id' is missing
        if "_id" in session:
            if "id" not in session:
                session["id"] = str(session["_id"])
            del session["_id"]

        return Session(**session)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error fetching session %s: %s",
            sanitize_for_logging(session_id),
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


def _get_db_client(db_override=None):
    """Resolve the active database client, raising if not initialized."""
    db_client = db_override or db
    if db_client is None:
        raise HTTPException(status_code=500, detail="Database is not initialized")
    return db_client


def _require_supervisor(current_user: dict):
    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Supervisor access required")


async def verify_stock(
    line_id: str,
    current_user: dict,
    *,
    request: Optional[Request] = None,
    db_override=None,
):
    """Mark a count line as verified. Exposed for direct test usage."""
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await db_client.count_lines.find_one({"id": line_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    filter_query = {"_id": count_line["_id"]} if count_line.get("_id") else {"id": line_id}
    write_service = CountLineWriteService(db_client)

    update_result = await write_service.process_write(
        {"operation": "update_one", "filter": filter_query, "update": {"$set": {}}},
        context={
            "transition": "verify",
            "username": current_user["username"],
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
            "skip_session_totals_update": True,
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    if activity_log_service:
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="verify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    return {"message": "Stock verified", "verified": True}


async def unverify_stock(
    line_id: str,
    current_user: dict,
    *,
    request: Optional[Request] = None,
    db_override=None,
):
    """Remove verification metadata from a count line."""
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await db_client.count_lines.find_one({"id": line_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    filter_query = {"_id": count_line["_id"]} if count_line.get("_id") else {"id": line_id}
    write_service = CountLineWriteService(db_client)

    update_result = await write_service.process_write(
        {"operation": "update_one", "filter": filter_query, "update": {"$set": {}}},
        context={
            "transition": "unverify",
            "username": current_user["username"],
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
            "skip_session_totals_update": True,
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    if activity_log_service:
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="unverify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    return {"message": "Stock verification removed", "verified": False}


async def get_count_lines(
    session_id: str,
    current_user: dict,
    page: int = 1,
    page_size: int = 50,
    verified: Optional[bool] = None,
    *,
    db_override=None,
):
    """Get count lines with pagination. Shared between routes and tests."""
    skip = (page - 1) * page_size
    filter_query: dict[str, Any] = {"session_id": session_id}

    if verified is not None:
        filter_query["verified"] = verified

    db_client = _get_db_client(db_override)
    total = await db_client.count_lines.count_documents(filter_query)
    lines_cursor = (
        db_client.count_lines.find(filter_query, {"_id": 0})
        .sort("counted_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    lines = await lines_cursor.to_list(page_size)

    return {
        "items": lines,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "has_next": skip + page_size < total,
            "has_prev": page > 1,
        },
    }


register_routers(
    app,
    RouterRegistry(
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
        api_router=api_router,
        enterprise_router=enterprise_router,
        notes_router=notes_router,
        sync_conflicts_router=sync_conflicts_router,
        enrichment_router=enrichment_router,
        v2_router=v2_router,
        pin_auth_router=pin_auth_router,
        reconciliation_router=reconciliation_router,
        recount_router=recount_router,
        enterprise_available=ENTERPRISE_AVAILABLE,
    ),
    logger,
)

if os.getenv("LOG_ROUTE_TABLE", "false").lower() == "true":
    for route in app.routes:
        if hasattr(route, "path"):
            logger.info("Route: %s", route.path)

register_static_serving(app, ROOT_DIR.parent / "frontend" / "dist", logger)


if __name__ == "__main__":
    run_server_main(
        app_import_path="backend.server:app",
        settings=settings,
        logger=logger,
        project_root=Path(__file__).parent.parent,
    )
