import logging
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional, TypeVar, cast

# Add the parent directory to Python path for proper imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent.parent / ".env")
except ImportError:
    pass

import jwt  # noqa: E402
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer  # noqa: E402
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
from backend.api.schemas import ApiResponse, CountLineCreate, Session, TokenResponse  # noqa: E402
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
from backend.api.user_management_api import user_management_router  # noqa: E402
from backend.api.user_settings_api import router as user_settings_router  # noqa: E402
from backend.api.variance_api import router as variance_router  # noqa: E402
from backend.api.websocket_api import router as websocket_router  # noqa: E402
from backend.api.sql_verification_api import router as sql_verification_router  # noqa: E402
from backend.auth.cookies import clear_auth_cookies, get_refresh_token_cookie, set_auth_cookies  # noqa: E402
from backend.auth.dependencies import get_current_user as auth_get_current_user  # noqa: E402
from backend.config import settings  # noqa: E402
from backend.core.lifespan import (  # noqa: E402
    activity_log_service,
    cache_service,
    db,
    lifespan,
    refresh_token_service,
)
from backend.exceptions import AuthenticationError, NotFoundError  # noqa: E402
from backend.exceptions import RateLimitError as RateLimitExceededError  # noqa: E402
from backend.exceptions import StockVerifyException as DatabaseError  # noqa: E402
from backend.exceptions import ValidationError  # noqa: E402

# Utils
from backend.utils.api_utils import result_to_response, sanitize_for_logging  # noqa: E402
from backend.utils.auth_utils import get_password_hash  # noqa: E402
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
    logger.info(f"Enterprise features not available: {e}")

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

# SECURITY: settings from backend.config already enforce strong secrets
SECRET_KEY: str = cast(str, settings.JWT_SECRET)
ALGORITHM = settings.JWT_ALGORITHM
security = HTTPBearer(auto_error=False)

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
        logger.warning(f"Failed to initialize Sentry SDK: {e}")
else:
    logger.info("Sentry DSN not found, skipping Sentry initialization")
# Create FastAPI app with lifespan
app = FastAPI(
    title=getattr(settings, "APP_NAME", "Stock Count API"),
    description="Stock counting and ERP sync API",
    version=getattr(settings, "APP_VERSION", "1.0.0"),
    lifespan=lifespan,
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
def test_direct():
    return {"status": "ok"}


# Pydantic Models


# Note: verify_password and get_password_hash are imported from backend.utils.auth_utils (line 72)


def create_access_token(data: dict[str, Any]) -> str:
    """Create a JWT access token from user data"""
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict[str, Any]:
    return await auth_get_current_user(request, credentials)


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
                    "hashed_password": get_password_hash("staff123"),
                    "full_name": "Staff Member",
                    "role": "staff",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: staff1/staff123")

        # Check for supervisor
        supervisor_exists = await db.users.find_one({"username": "supervisor"})
        if not supervisor_exists:
            await db.users.insert_one(
                {
                    "username": "supervisor",
                    "hashed_password": get_password_hash("super123"),
                    "full_name": "Supervisor",
                    "role": "supervisor",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: supervisor/super123")

        # Check for admin
        admin_exists = await db.users.find_one({"username": "admin"})
        if not admin_exists:
            await db.users.insert_one(
                {
                    "username": "admin",
                    "hashed_password": get_password_hash("admin123"),
                    "full_name": "Administrator",
                    "role": "admin",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: admin/admin123")
    except Exception as e:
        logger.error(f"Error creating default users: {str(e)}")
        raise


# Initialize mock ERP data
async def init_mock_erp_data():
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


# Helper functions for login
async def check_rate_limit(ip_address: str) -> Result[bool, Exception]:
    """
    Check if the IP has exceeded the login attempt limit.

    Rate limiting is configurable via RATE_LIMIT_ENABLED environment variable.
    Default: Enabled in production, disabled in development.
    """
    # Check if rate limiting is enabled (default: True for production)
    rate_limit_enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

    if not rate_limit_enabled:
        logger.debug(f"Rate limiting disabled for IP: {ip_address}")
        return Ok(True)

    namespace = "login_attempts"
    key = ip_address

    # Get current attempt count
    attempts = (await cache_service.get(namespace, key)) or 0
    try:
        attempts = int(attempts)
    except (ValueError, TypeError):
        attempts = 0

    # Configuration: max attempts and TTL
    max_attempts = int(getattr(settings, "RATE_LIMIT_MAX_ATTEMPTS", 5))
    ttl_seconds = int(getattr(settings, "RATE_LIMIT_TTL_SECONDS", 300))

    if attempts >= max_attempts:
        # Block for configured TTL period
        await cache_service.set(namespace, key, attempts, ttl=ttl_seconds)
        logger.warning(f"Rate limit exceeded for IP {ip_address}: {attempts} attempts")
        return Fail(
            RateLimitExceededError(
                f"Too many login attempts. Please try again in {ttl_seconds // 60} minutes.",
                retry_after=ttl_seconds,
            )
        )

    # Increment attempt counter with TTL
    await cache_service.set(namespace, key, attempts + 1, ttl=ttl_seconds)
    logger.debug(
        f"Rate limit check passed for IP {ip_address}: {attempts + 1}/{max_attempts} attempts"
    )
    return Ok(True)


async def find_user_by_username(username: str) -> Result[dict[str, Any], Exception]:
    """Find a user by username with error handling."""
    try:
        user = await db.users.find_one({"username": username})
        if not user:
            return Fail(NotFoundError("User not found"))
        return Ok(user)
    except Exception as e:
        logger.error(f"Error finding user {sanitize_for_logging(username)}: {str(e)}")
        return Fail(DatabaseError("Error accessing user data"))


async def generate_auth_tokens(
    user: dict[str, Any], ip_address: str, request: Request
) -> Result[dict[str, Any], Exception]:
    """Generate access and refresh tokens with error handling."""
    try:
        # Generate access token
        access_token_expires = timedelta(
            minutes=getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15)
        )
        access_token = create_access_token(
            {"sub": user["username"], "role": user.get("role", "staff")}
        )

        # Generate refresh token using service
        refresh_payload = {"sub": user["username"], "role": user.get("role", "staff")}
        refresh_token = refresh_token_service.create_refresh_token(refresh_payload)
        refresh_token_expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            days=getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 30)
        )

        # Store refresh token via service
        await refresh_token_service.store_refresh_token(
            refresh_token,
            user["username"],
            refresh_token_expires,
            ip_address=ip_address,
            user_agent=request.headers.get("user-agent"),
        )

        return Ok(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": int(access_token_expires.total_seconds()),
            }
        )
    except Exception as e:
        logger.error(f"Error generating auth tokens: {str(e)}")
        return Fail(DatabaseError("Error generating authentication tokens"))


async def log_failed_login_attempt(
    username: str, ip_address: str, user_agent: Optional[str], error: str
) -> None:
    """Log a failed login attempt."""
    try:
        await db.login_attempts.insert_one(
            {
                "username": username,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "success": False,
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
                "error": error,
            }
        )
    except Exception as e:
        logger.error(f"Failed to log login attempt: {str(e)}")


async def log_successful_login(user: dict[str, Any], ip_address: str, request: Request) -> None:
    """Log a successful login."""
    try:
        await db.login_attempts.insert_one(
            {
                "user_id": user["_id"],
                "username": user["username"],
                "ip_address": ip_address,
                "user_agent": request.headers.get("user-agent"),
                "success": True,
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        # Update last login timestamp
        await db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"last_login_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
        )

        # Log to monitoring
        # monitoring_service.log_event(
        #     "user_login",
        #     user_id=user["_id"],
        #     username=user["username"],
        #     ip_address=ip_address,
        #     user_agent=request.headers.get("user-agent")
        # )
    except Exception as e:
        logger.error(f"Failed to log successful login: {str(e)}")


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
        logger.error(f"Token refresh error: {str(e)}")
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
            if payload and payload.get("sub") == current_user.get("username"):
                await token_service.revoke_token(refresh_token_value)

        clear_auth_cookies(response)
        return {"message": "Logged out successfully"}
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(status_code=500, detail="Logout failed") from e


# Session routes
@api_router.post("/sessions/bulk/close")
async def bulk_close_sessions(
    session_ids: list[str], current_user: dict = Depends(get_current_user)
):
    """Bulk close sessions (supervisor only)"""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        updated_count = 0
        errors = []

        for session_id in session_ids:
            try:
                result = await db.sessions.update_one(
                    {"id": session_id},
                    {
                        "$set": {
                            # Keep canonical session fields to match Session schema + UI expectations.
                            "status": "CLOSED",
                            "closed_at": datetime.now(timezone.utc).replace(tzinfo=None),
                            # Backwards compatible alias for older data readers (if any).
                            "ended_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        }
                    },
                )
                if result.modified_count > 0:
                    updated_count += 1
                    # Log activity
                    await activity_log_service.log_activity(
                        user=current_user["username"],
                        role=current_user["role"],
                        action="bulk_close_session",
                        entity_type="session",
                        entity_id=session_id,
                        details={"operation": "bulk_close"},
                        ip_address=None,
                        user_agent=None,
                    )
            except Exception as e:
                errors.append({"session_id": session_id, "error": str(e)})

        return {
            "success": True,
            "updated_count": updated_count,
            "total": len(session_ids),
            "errors": errors,
        }
    except Exception as e:
        logger.error(f"Bulk close sessions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@api_router.post("/sessions/bulk/reconcile")
async def bulk_reconcile_sessions(
    session_ids: list[str], current_user: dict = Depends(get_current_user)
):
    """Bulk reconcile sessions (supervisor only)"""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        updated_count = 0
        errors = []

        for session_id in session_ids:
            try:
                result = await db.sessions.update_one(
                    {"id": session_id},
                    {
                        "$set": {
                            # Store as ACTIVE + reconciled_at so the Session schema can present it
                            # back to clients as RECONCILE while keeping DB normalized.
                            "status": "ACTIVE",
                            "reconciled_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        }
                    },
                )
                if result.modified_count > 0:
                    updated_count += 1
                    # Log activity
                    await activity_log_service.log_activity(
                        user=current_user["username"],
                        role=current_user["role"],
                        action="bulk_reconcile_session",
                        entity_type="session",
                        entity_id=session_id,
                        details={"operation": "bulk_reconcile"},
                        ip_address=None,
                        user_agent=None,
                    )
            except Exception as e:
                errors.append({"session_id": session_id, "error": str(e)})

        return {
            "success": True,
            "updated_count": updated_count,
            "total": len(session_ids),
            "errors": errors,
        }
    except Exception as e:
        logger.error(f"Bulk reconcile sessions error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


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
            session = await db.sessions.find_one({"session_id": session_id})
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
        logger.error(f"Bulk export sessions error: {str(e)}")
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
        logger.error(f"Analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# Legacy route retained under explicit namespace to avoid duplicate /api/sessions/{session_id}.
@api_router.get("/legacy/sessions/{session_id}")
async def get_session_by_id(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get a specific session by ID"""
    try:
        session = await db.sessions.find_one({"session_id": session_id})

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Check permissions
        if (
            current_user["role"] != "supervisor"
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
        logger.error(f"Error fetching session {session_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


# ERP Item routes


# Helper function to detect high-risk corrections
def detect_risk_flags(erp_item: dict, line_data: CountLineCreate, variance: float) -> list[str]:
    """Detect high-risk correction patterns"""
    risk_flags = []

    # Get values
    erp_qty = erp_item.get("stock_qty", 0)
    erp_mrp = erp_item.get("mrp", 0)
    counted_mrp = line_data.mrp_counted or erp_mrp

    # Calculate percentages safely
    variance_percent = (abs(variance) / erp_qty * 100) if erp_qty > 0 else 100
    mrp_change_percent = ((counted_mrp - erp_mrp) / erp_mrp * 100) if erp_mrp > 0 else 0

    # Rule 1: Large variance
    if abs(variance) > 100 or variance_percent > 50:
        risk_flags.append("LARGE_VARIANCE")

    # Rule 2: MRP reduced significantly
    if mrp_change_percent < -20:
        risk_flags.append("MRP_REDUCED_SIGNIFICANTLY")

    # Rule 3: High value item with variance
    if erp_mrp > 10000 and variance_percent > 5:
        risk_flags.append("HIGH_VALUE_VARIANCE")

    # Rule 4: Serial numbers missing for high-value item
    if erp_mrp > 5000 and (not line_data.serial_numbers or len(line_data.serial_numbers) == 0):
        risk_flags.append("SERIAL_MISSING_HIGH_VALUE")

    # Rule 5: Correction without reason when variance exists
    if abs(variance) > 0 and not line_data.correction_reason and not line_data.variance_reason:
        risk_flags.append("MISSING_CORRECTION_REASON")

    # Rule 6: MRP change without reason
    if (
        abs(mrp_change_percent) > 5
        and not line_data.correction_reason
        and not line_data.variance_reason
    ):
        risk_flags.append("MRP_CHANGE_WITHOUT_REASON")

    # Rule 7: Photo required but missing
    photo_required = (
        abs(variance) > 100
        or variance_percent > 50
        or abs(mrp_change_percent) > 20
        or erp_mrp > 10000
    )
    if (
        photo_required
        and not line_data.photo_base64
        and (not line_data.photo_proofs or len(line_data.photo_proofs) == 0)
    ):
        risk_flags.append("PHOTO_PROOF_REQUIRED")

    return risk_flags


# Helper function to calculate financial impact
def calculate_financial_impact(erp_mrp: float, counted_mrp: float, counted_qty: float) -> float:
    """Calculate revenue impact of MRP change"""
    old_value = erp_mrp * counted_qty
    new_value = counted_mrp * counted_qty
    return new_value - old_value


# Count Line routes
# Legacy route retained under explicit namespace to avoid duplicate /api/count-lines.
@api_router.post("/legacy/count-lines")
async def create_count_line(
    request: Request,
    line_data: CountLineCreate,
    current_user: dict = Depends(get_current_user),
):
    # Validate session exists
    session = await db.sessions.find_one({"session_id": line_data.session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get ERP item
    erp_item = await db.erp_items.find_one({"item_code": line_data.item_code})
    if not erp_item:
        raise HTTPException(status_code=404, detail="Item not found in ERP")

    # Calculate variance
    variance = line_data.counted_qty - erp_item["stock_qty"]

    # Validate mandatory correction reason for variance
    if abs(variance) > 0 and not line_data.correction_reason and not line_data.variance_reason:
        raise HTTPException(
            status_code=400,
            detail="Correction reason is mandatory when variance exists",
        )

    # Detect risk flags
    risk_flags = detect_risk_flags(erp_item, line_data, variance)

    # Calculate financial impact
    counted_mrp = line_data.mrp_counted or erp_item["mrp"]
    financial_impact = calculate_financial_impact(
        erp_item["mrp"], counted_mrp, line_data.counted_qty
    )

    # Determine approval status based on risk
    # High-risk corrections require supervisor review
    approval_status = "NEEDS_REVIEW" if risk_flags else "PENDING"

    # Check for duplicates
    duplicate_check = await db.count_lines.count_documents(
        {
            "session_id": line_data.session_id,
            "item_code": line_data.item_code,
            "counted_by": current_user["username"],
        }
    )
    if duplicate_check > 0:
        risk_flags.append("DUPLICATE_CORRECTION")
        approval_status = "NEEDS_REVIEW"

    # Create count line with enhanced fields
    count_line = {
        "id": str(uuid.uuid4()),
        "session_id": line_data.session_id,
        "item_code": line_data.item_code,
        "item_name": erp_item["item_name"],
        "barcode": erp_item["barcode"],
        "erp_qty": erp_item["stock_qty"],
        "counted_qty": line_data.counted_qty,
        "variance": variance,
        # Legacy fields
        "variance_reason": line_data.variance_reason,
        "variance_note": line_data.variance_note,
        "remark": line_data.remark,
        "photo_base64": line_data.photo_base64,
        # Enhanced fields
        "damaged_qty": line_data.damaged_qty,
        "item_condition": line_data.item_condition,
        "floor_no": line_data.floor_no,
        "rack_no": line_data.rack_no,
        "mark_location": line_data.mark_location,
        "sr_no": line_data.sr_no,
        "manufacturing_date": line_data.manufacturing_date,
        "correction_reason": (
            line_data.correction_reason.model_dump() if line_data.correction_reason else None
        ),
        "photo_proofs": (
            [p.model_dump() for p in line_data.photo_proofs] if line_data.photo_proofs else None
        ),
        "correction_metadata": (
            line_data.correction_metadata.model_dump() if line_data.correction_metadata else None
        ),
        "approval_status": approval_status,
        "approval_by": None,
        "approval_at": None,
        "rejection_reason": None,
        "risk_flags": risk_flags,
        "financial_impact": financial_impact,
        # User and timestamp
        "counted_by": current_user["username"],
        "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        # MRP tracking
        "mrp_erp": erp_item["mrp"],
        "mrp_counted": line_data.mrp_counted,
        # Additional fields
        "split_section": line_data.split_section,
        "serial_numbers": line_data.serial_numbers,
        # Legacy approval fields
        "status": "pending",
        "verified": False,
        "verified_at": None,
        "verified_by": None,
    }

    await db.count_lines.insert_one(count_line)

    # Update item location in ERP items collection if floor/rack provided
    if line_data.floor_no or line_data.rack_no:
        update_fields = {}
        if line_data.floor_no:
            update_fields["floor_no"] = line_data.floor_no
        if line_data.rack_no:
            update_fields["rack_no"] = line_data.rack_no

        if update_fields:
            try:
                await db.erp_items.update_one(
                    {"item_code": line_data.item_code}, {"$set": update_fields}
                )
            except Exception as e:
                logger.error(f"Failed to update item location: {str(e)}")
                # Non-critical error, continue execution

    # Update session stats atomically using aggregation
    try:
        pipeline = [
            {"$match": {"session_id": line_data.session_id}},
            {
                "$group": {
                    "_id": None,
                    "total_items": {"$sum": 1},
                    "total_variance": {"$sum": "$variance"},
                }
            },
        ]
        stats = await db.count_lines.aggregate(pipeline).to_list(1)  # type: ignore
        if stats:
            await db.sessions.update_one(
                {"id": line_data.session_id},
                {
                    "$set": {
                        "total_items": stats[0]["total_items"],
                        "total_variance": stats[0]["total_variance"],
                    }
                },
            )
    except Exception as e:
        logger.error(f"Failed to update session stats: {str(e)}")
        # Non-critical error, continue execution

    # Log high-risk correction
    if risk_flags:
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user["role"],
            action="high_risk_correction",
            entity_type="count_line",
            entity_id=count_line["id"],
            details={"risk_flags": risk_flags, "item_code": line_data.item_code},
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    # Remove the MongoDB _id field before returning
    count_line.pop("_id", None)
    return count_line


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

    update_result = await db_client.count_lines.update_one(
        {"id": line_id},
        update={
            "$set": {
                "verified": True,
                "verified_by": current_user["username"],
                "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
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

    update_result = await db_client.count_lines.update_one(
        {"id": line_id},
        update={"$set": {"verified": False, "verified_by": None, "verified_at": None}},
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
        enterprise_available=ENTERPRISE_AVAILABLE,
    ),
    logger,
)

if os.getenv("LOG_ROUTE_TABLE", "false").lower() == "true":
    for route in app.routes:
        if hasattr(route, "path"):
            logger.info(f"Route: {route.path}")

register_static_serving(app, ROOT_DIR.parent / "frontend" / "dist", logger)


if __name__ == "__main__":
    run_server_main(
        app_import_path="backend.server:app",
        settings=settings,
        logger=logger,
        project_root=Path(__file__).parent.parent,
    )
