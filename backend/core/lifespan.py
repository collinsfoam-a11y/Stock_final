# ruff: noqa: E402
# flake8: noqa: E402

import asyncio
import logging
import os
import secrets
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Generic, Optional, TypeVar, cast

from fastapi import FastAPI
from fastapi.security import HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel

# Add project root to path for direct execution (debugging)
# This allows the file to be run directly for testing/debugging
project_root = Path(__file__).parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))


from backend.api.enhanced_item_api import init_enhanced_api

# API Initialization
from backend.api.erp_api import init_erp_api
from backend.api.item_verification_api import init_verification_api
from backend.api.metrics_api import set_monitoring_service
from backend.api.sync_management_api import set_change_detection_service, set_erp_sync_service
from backend.api.sync_status_api import set_auto_sync_manager
from backend.auth.dependencies import init_auth_dependencies
from backend.config import settings
from backend.core import globals as g
from backend.db.initialization import init_default_users
from backend.db.migrations import MigrationManager
from backend.db.runtime import set_client, set_db
from backend.exceptions import StockVerifyException as DatabaseError

# Services
from backend.services.activity_log import ActivityLogService

# Auto-sync manager
from backend.services.auto_sync_manager import AutoSyncManager
from backend.services.batch_operations import BatchOperationsService
from backend.services.cache_service import CacheService
from backend.services.change_detection_sync import ChangeDetectionSyncService
from backend.services.database_health import DatabaseHealthService
from backend.services.database_optimizer import DatabaseOptimizer
from backend.services.error_log import ErrorLogService
from backend.services.lock_manager import get_lock_manager
from backend.services.mdns_service import start_mdns, stop_mdns
from backend.services.monitoring_service import MonitoringService
from backend.services.pubsub_service import get_pubsub_service
from backend.services.rate_limiter import ConcurrentRequestHandler, RateLimiter
from backend.services.redis_service import close_redis, init_redis
from backend.services.refresh_token import RefreshTokenService
from backend.services.runtime import set_cache_service, set_refresh_token_service
from backend.services.scheduled_export_service import ScheduledExportService
from backend.services.sql_sync_service import SQLSyncService
from backend.services.sync_conflicts_service import SyncConflictsService
from backend.services.lock_service import LockService
from backend.services.variant_service import VariantService
from backend.services.governance_guard import install_db_write_guards
from backend.services.watchdog_service import WatchdogService
from backend.sql_server_connector import SQLServerConnector
from backend.utils.port_detector import PortDetector, save_backend_info

# Enterprise Imports
try:
    from backend.api.enrichment_api import init_enrichment_api
    from backend.services.enrichment_service import EnrichmentService
except ImportError:
    EnrichmentService = None  # type: ignore
    init_enrichment_api = None  # type: ignore

try:
    from backend.services.data_governance import DataGovernanceService
    from backend.services.enterprise_audit import EnterpriseAuditService
    from backend.services.enterprise_security import EnterpriseSecurityService
    from backend.services.feature_flags import FeatureFlagService

    g.ENTERPRISE_AVAILABLE = True
except ImportError:
    g.ENTERPRISE_AVAILABLE = False

# Utils
from backend.utils.logging_config import setup_logging
from backend.utils.tracing import init_tracing

# Logger setup
logger = logging.getLogger("stock-verify")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# Global service instances
scheduled_export_service = None
sync_conflicts_service = None

# Setup logging
logger = setup_logging(
    log_level=settings.LOG_LEVEL,
    log_format=settings.LOG_FORMAT,
    log_file=settings.LOG_FILE or "app.log",
    app_name=settings.APP_NAME,
    log_max_bytes=settings.LOG_MAX_BYTES,
    log_backup_count=settings.LOG_BACKUP_COUNT,
)

# Initialize tracing (optional, env-gated). This only configures the
# tracer provider and exporter; FastAPI is instrumented later once the
# app instance is created.
# PW-05: capture the return value so lifespan() can expose it on app.state.
_TRACING_ACTIVE: bool = False
try:
    _TRACING_ACTIVE = bool(init_tracing())
except Exception:
    # Never break startup due to tracing
    pass

T = TypeVar("T")
E = TypeVar("E", bound=Exception)
R = TypeVar("R")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    error: Optional[dict[str, Optional[Any]]] = None

    @classmethod
    def success_response(cls, data: T):
        return cls(success=True, data=data)

    @classmethod
    def error_response(cls, error: dict[str, Any]):
        return cls(success=False, error=error)


RUNNING_UNDER_PYTEST = "pytest" in sys.modules

ROOT_DIR = Path(__file__).parent

# Keep lifecycle/orchestration logs on the app logger configured above.
if RUNNING_UNDER_PYTEST:
    logging.getLogger().setLevel(logging.INFO)


# Note: sanitize_for_logging and create_safe_error_response are imported from backend.utils.api_utils (line 73)


# Load configuration with validation
# Note: settings already imported at top of file (line 68)
# Configuration validation happens during import


# Only define fallback Settings if settings is None
# Removed insecure local Settings fallback. All configuration must come from backend.config


# settings is guaranteed from backend.config


# MongoDB connection with optimization
mongo_url = settings.MONGO_URL
# Normalize trailing slash (avoid accidental DB name in URL)
mongo_url = mongo_url.rstrip("/")
# Do not append pool options to URL; keep them in client options only

mongo_client_options: dict[str, Any] = {
    "maxPoolSize": 100,
    "minPoolSize": 10,
    "maxIdleTimeMS": 45000,
    "serverSelectionTimeoutMS": 5000,
    "connectTimeoutMS": 20000,
    "socketTimeoutMS": 20000,
    "retryWrites": True,
    "retryReads": True,
}

client: AsyncIOMotorClient = AsyncIOMotorClient(
    mongo_url,
    **mongo_client_options,  # type: ignore
)
# Use DB_NAME from settings (database name should not be in URL for this setup)
db = client[settings.DB_NAME]
# M-11: install_db_write_guards is called inside lifespan() after the MongoDB
# ping succeeds, not here at module level.  Calling it here fires before the
# db_optimizer may replace the Motor client, and runs unconditionally on every
# import (including test collection) before any connection is established.

# Database optimizer
if not RUNNING_UNDER_PYTEST:
    db_optimizer = DatabaseOptimizer(
        mongo_client=client,
        max_pool_size=100,
        min_pool_size=10,
        max_idle_time_ms=45000,
        server_selection_timeout_ms=5000,
        connect_timeout_ms=20000,
        socket_timeout_ms=20000,
    )
    client = db_optimizer.optimize_client()

# Security - Modern password hashing with Argon2 (OWASP recommended)
# Fallback to bcrypt-only if argon2 is not available
try:
    pwd_context = CryptContext(
        schemes=[
            "argon2",
            "bcrypt",
        ],  # Argon2 first (preferred), bcrypt for backward compatibility
        deprecated="auto",  # Auto-upgrade old hashes on next login
        argon2__memory_cost=65536,  # 64 MB memory (resistant to GPU attacks)
        argon2__time_cost=3,  # 3 iterations
        argon2__parallelism=4,  # 4 threads
    )
    # Test if bcrypt backend is available
    try:
        import bcrypt

        # Verify bcrypt is working
        probe_password = secrets.token_bytes(24)
        test_hash = bcrypt.hashpw(probe_password, bcrypt.gensalt())
        bcrypt.checkpw(probe_password, test_hash)
        logger.info("Password hashing: Using Argon2 with bcrypt fallback")
    except Exception as e:
        logger.warning(
            "Bcrypt backend check failed, using bcrypt-only context: %s",
            type(e).__name__,
        )
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception as e:
    logger.warning("Argon2 not available, using bcrypt-only: %s", type(e).__name__)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# SECURITY: settings from backend.config already enforce strong secrets
SECRET_KEY: str = cast(str, settings.JWT_SECRET)
ALGORITHM = settings.JWT_ALGORITHM
security = HTTPBearer(auto_error=False)

# Initialize production services
# Enhanced Connection pool (if using SQL Server)
connection_pool: Any = None


# Cache service
cache_service = CacheService(
    redis_url=getattr(settings, "REDIS_URL", None),
    default_ttl=getattr(settings, "CACHE_TTL", 3600),
)

# Rate limiter
rate_limiter = RateLimiter(
    default_rate=getattr(settings, "RATE_LIMIT_PER_MINUTE", 100),
    default_burst=getattr(settings, "RATE_LIMIT_BURST", 20),
    per_user=True,
    per_endpoint=False,
)

# Concurrent request handler
concurrent_handler = ConcurrentRequestHandler(
    max_concurrent=getattr(settings, "MAX_CONCURRENT", 50),
    queue_size=getattr(settings, "QUEUE_SIZE", 100),
)

# Monitoring service
monitoring_service = MonitoringService(
    history_size=getattr(settings, "METRICS_HISTORY_SIZE", 1000),
)

# SQL Server connector (global instance)
sql_connector = SQLServerConnector()

# Database health service (reuse shared db to avoid extra client)
database_health_service = DatabaseHealthService(
    mongo_db=db,
    sql_connector=sql_connector,
    check_interval=60,  # Check every 60 seconds
    mongo_uri=mongo_url,
    db_name=settings.DB_NAME,
    mongo_client_options=mongo_client_options,
)

# ERP sync service (full sync)
erp_sync_service = None
if getattr(settings, "ERP_SYNC_ENABLED", True):
    try:
        erp_sync_service = SQLSyncService(
            sql_connector=sql_connector,
            mongo_db=db,
            sync_interval=getattr(settings, "ERP_SYNC_INTERVAL", 3600),
            enabled=True,
        )
        set_erp_sync_service(erp_sync_service)
    except Exception as e:
        logger.warning("ERP sync service initialization failed: %s", str(e))

# Change detection sync service (syncs item_name, manual_barcode, MRP changes)
change_detection_sync = None
if getattr(settings, "CHANGE_DETECTION_ENABLED", True):
    try:
        change_detection_sync = ChangeDetectionSyncService(
            sql_connector=sql_connector,
            mongo_db=db,
            sync_interval=getattr(settings, "CHANGE_DETECTION_INTERVAL", 300),
            enabled=True,
        )
        set_change_detection_service(change_detection_sync)
    except Exception as e:
        logger.warning("Change detection sync service initialization failed: %s", str(e))

# auto_sync_manager is created inside lifespan() after SQL connectivity is confirmed.
# Do NOT instantiate here — this module-level call is always superseded (and the
# resulting instance silently discarded) by the lifespan() instantiation below,
# causing two AutoSyncManager instances with duplicate background tasks (M-02).
auto_sync_manager = None

# Migration manager
migration_manager = MigrationManager(db)

# Initialize refresh token and batch operations services
refresh_token_service = RefreshTokenService(
    db,
    cast(str, settings.JWT_REFRESH_SECRET),
    ALGORITHM,
    access_secret_key=SECRET_KEY,
)
batch_operations = BatchOperationsService(db)
activity_log_service = ActivityLogService(db)
error_log_service = ErrorLogService(db)


# Create the main app with lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: C901
    # Startup
    logger.info("🚀 Starting StockVerify application...")

    # PW-05: Expose OTel tracing status on app.state so health checks and
    # diagnostics can report it without importing OTel internals.
    app.state.tracing_active = _TRACING_ACTIVE
    logger.info("Tracing active: %s", _TRACING_ACTIVE)

    # Initialize runtime globals
    set_client(client)
    set_db(db)
    set_cache_service(cache_service)
    set_refresh_token_service(refresh_token_service)

    from backend.core.websocket_manager import manager as _ws_manager

    _ws_manager.attach_replay_store(db)

    # Phase 1: Initialize Redis and related services
    redis_service = None
    pubsub_service = None
    try:
        logger.info("📦 Phase 1: Initializing Redis services...")
        redis_service = await init_redis()
        logger.info("✓ Redis service initialized")

        # Start Pub/Sub service
        pubsub_service = get_pubsub_service(redis_service)
        await pubsub_service.start()

        # Initialize lock manager (will be used by APIs)
        get_lock_manager(redis_service)
        logger.info("✓ Lock manager initialized")

        # Attach Redis fan-out to the WebSocket manager so broadcasts reach
        # clients on every worker process, not just the one handling the event.
        await _ws_manager.attach_redis(redis_service)
        logger.info("✓ WebSocket Redis fan-out enabled")

        # Upgrade rate limiter to Redis-backed sliding-window enforcement so
        # limits are shared across all worker processes (H-07).
        rate_limiter.attach_redis(redis_service)
        logger.info("✓ Rate limiter: Redis backend attached")

    except Exception as e:
        logger.warning("⚠️ Redis services not available: %s", str(e))
        logger.warning("Multi-user locking and real-time updates will be disabled")

    # Start mDNS service
    try:
        logger.info("🌐 Starting mDNS service...")
        # Use PORT env var if set (by PortDetector), otherwise settings
        mdns_port = int(os.getenv("PORT", getattr(settings, "PORT", 8001)))
        await start_mdns(port=mdns_port)
        logger.info("✓ mDNS service started (stock-verify.local on port %s)", mdns_port)
    except Exception as e:
        logger.warning("⚠️ mDNS service failed to start: %s", str(e))

    # Create MongoDB indexes via MigrationManager
    # MigrationManager.ensure_indexes() now calls create_indexes internally

    # Initialize SQL Server connection if credentials are available
    sql_connected = False
    sql_credentials_ready = False
    try:
        sql_host = getattr(settings, "SQL_SERVER_HOST", None)
        sql_port = getattr(settings, "SQL_SERVER_PORT", 1433)
        sql_database = getattr(settings, "SQL_SERVER_DATABASE", None)
        sql_user = getattr(settings, "SQL_SERVER_USER", None)
        sql_password = getattr(settings, "SQL_SERVER_PASSWORD", None)
        sql_password_placeholder = isinstance(
            sql_password, str
        ) and sql_password.strip().lower() in {
            "",
            "your-sql-password",
            "change-me",
            "password",
            "changeme",
            "your-actual-sql-password",
        }
        sql_credentials_ready = (not sql_user) or bool(
            sql_password and not sql_password_placeholder
        )

        # Always attach SQL connector to count_lines_router so it can handle its own fallbacks
        try:
            from backend.api.count_lines_api import router as count_lines_router

            setattr(count_lines_router, "sql_connector", sql_connector)
            logger.info("✓ SQL connector attached to count_lines_router")
        except Exception as e:
            logger.warning("Failed to attach SQL connector to count_lines_router: %s", str(e))

        if sql_host and sql_database and sql_credentials_ready:
            logger.info(
                f"Attempting to connect to SQL Server at {sql_host}:{sql_port}/{sql_database}..."
            )
            try:
                startup_sql_timeout = getattr(settings, "SQL_STARTUP_CONNECT_TIMEOUT", 5)
                await asyncio.wait_for(
                    asyncio.to_thread(
                        sql_connector.connect,
                        sql_host,
                        sql_port,
                        sql_database,
                        sql_user,
                        sql_password,
                    ),
                    timeout=startup_sql_timeout,
                )
                sql_connected = True
                logger.info("OK: SQL Server connection established")
            except (ConnectionError, OSError) as e:
                logger.warning("SQL Server connection failed (network/system error): %s", str(e))
                logger.warning("ERP sync will be disabled until SQL Server is configured")
            except asyncio.TimeoutError:
                logger.warning("SQL Server connection timed out during startup")
                logger.warning("ERP sync will be disabled until SQL Server is available")
            except Exception as e:
                # Catch-all for other SQL Server connection errors (authentication, database not found, etc.)
                logger.warning("SQL Server connection failed: %s", str(e))
                logger.warning("ERP sync will be disabled until SQL Server is configured")
        elif sql_host and sql_database:
            logger.warning(
                "SQL Server credentials not configured. "
                "Set SQL_SERVER_USER and SQL_SERVER_PASSWORD (or use Windows auth)."
            )
        else:
            logger.warning(
                "SQL Server credentials not configured. Set SQL_SERVER_HOST and SQL_SERVER_DATABASE in .env"
            )
    except (ValueError, AttributeError) as e:
        # Configuration errors - invalid settings
        logger.warning("Error initializing SQL Server connection (configuration error): %s", str(e))
    except Exception as e:
        # Other unexpected errors during initialization
        logger.warning("Unexpected error initializing SQL Server connection: %s", str(e))

    # Initialize enhanced connection pool in background (never block API startup)
    if (
        not RUNNING_UNDER_PYTEST
        and getattr(settings, "USE_CONNECTION_POOL", True)
        and getattr(settings, "SQL_SERVER_HOST", None)
        and getattr(settings, "SQL_SERVER_DATABASE", None)
        and sql_credentials_ready
    ):

        async def _init_connection_pool():
            global connection_pool
            try:
                from backend.services.enhanced_connection_pool import (
                    EnhancedSQLServerConnectionPool,
                )

                connection_pool = await asyncio.to_thread(
                    EnhancedSQLServerConnectionPool,
                    host=settings.SQL_SERVER_HOST,
                    port=settings.SQL_SERVER_PORT,
                    database=settings.SQL_SERVER_DATABASE,
                    user=getattr(settings, "SQL_SERVER_USER", None),
                    password=getattr(settings, "SQL_SERVER_PASSWORD", None),
                    pool_size=getattr(settings, "POOL_SIZE", 10),
                    max_overflow=getattr(settings, "MAX_OVERFLOW", 5),
                    retry_attempts=getattr(settings, "CONNECTION_RETRY_ATTEMPTS", 3),
                    retry_delay=getattr(settings, "CONNECTION_RETRY_DELAY", 1.0),
                    health_check_interval=getattr(settings, "CONNECTION_HEALTH_CHECK_INTERVAL", 60),
                )
                logger.info("✓ Enhanced connection pool initialized")
            except Exception as e:
                logger.warning("Connection pool initialization failed: %s", str(e))

        asyncio.create_task(_init_connection_pool())

    # PW-08: task handle — set after MongoDB confirmed; cancelled during shutdown
    _watchdog_task: Optional[asyncio.Task] = None

    # CRITICAL: Verify MongoDB is available (required)
    try:
        await db.command("ping")
        logger.info("✅ MongoDB connection verified - MongoDB is required and available")
        # M-11: Install governance write guards now that db is fully initialised
        # (Motor client connected, db_optimizer already applied if configured).
        install_db_write_guards(db)
        logger.info("✓ DB write guards installed")

        # PW-08: Start the periodic watchdog loop now that the db is confirmed live.
        # The loop sleeps *first* so it does not fire during the startup burst.
        _watchdog_interval = int(os.getenv("WATCHDOG_INTERVAL_SECONDS", "60"))
        _watchdog_svc = WatchdogService(db)

        async def _watchdog_loop():
            while True:
                try:
                    await asyncio.sleep(_watchdog_interval)
                    await _watchdog_svc.run_all_checks()
                except asyncio.CancelledError:
                    break
                except Exception as _wdg_exc:
                    logger.warning("Watchdog check iteration failed: %s", _wdg_exc)

        _watchdog_task = asyncio.create_task(_watchdog_loop(), name="watchdog")
        logger.info("✓ Watchdog background task started (interval=%ds)", _watchdog_interval)

    except Exception as e:
        # MongoDB connection failed - check if we're in development mode
        error_type = type(e).__name__
        logger.error("❌ MongoDB is required but unavailable ({error_type}): %s", e)

        # In development, allow app to run without MongoDB
        if os.getenv("ENVIRONMENT", "development").lower() in ["development", "dev"]:
            logger.warning(
                "⚠️ Running in DEVELOPMENT mode without MongoDB - some features may be limited"
            )
        else:
            logger.error(
                "Application cannot start without MongoDB. Please ensure MongoDB is running."
            )
            raise SystemExit(
                f"MongoDB is required but unavailable ({error_type}). Please start MongoDB and try again."
            ) from e

    # Optional bootstrap seeding for controlled dev/test environments only.
    try:
        if getattr(settings, "AUTO_SEED_DEFAULT_USERS", False):
            if getattr(settings, "ENVIRONMENT", "production") == "production":
                logger.warning(
                    "AUTO_SEED_DEFAULT_USERS is enabled in a production environment. "
                    "Default credentials (staff123, 1234 PIN) are active. "
                    "Disable this immediately via AUTO_SEED_DEFAULT_USERS=false."
                )
            await init_default_users(db)
            logger.info("OK: Default users initialized")
        else:
            logger.info("Default user seeding disabled")

    except Exception as e:
        logger.warning(
            f"Could not initialize optional seed data (may be due to MongoDB unavailability): {str(e)}"
        )

    # Run migrations
    try:
        await migration_manager.ensure_indexes()
        await migration_manager.run_migrations()
        logger.info("OK: Migrations completed")
    except DatabaseError as e:
        logger.warning(
            f"Database error during migrations (may be due to MongoDB unavailability): {str(e)}"
        )
    except Exception as e:
        # Catch-all for migration errors (index creation failures, etc.)
        logger.warning("Migration error (may be due to MongoDB unavailability): %s", str(e))

    # Initialize auto-sync manager (monitors SQL Server and auto-syncs when available)
    global auto_sync_manager
    try:
        sql_configured = sql_connected
        auto_sync_manager = AutoSyncManager(
            sql_connector=sql_connector,
            mongo_db=db,
            sync_interval=getattr(settings, "ERP_SYNC_INTERVAL", 3600),
            check_interval=30,  # Check connection every 30 seconds
            enabled=sql_configured,
        )

        if sql_configured:
            # Set callbacks for admin notifications
            async def on_connection_restored():
                logger.info("📢 SQL Server connection restored - sync will start automatically")
                # Could send notification to admin panel here

            async def on_connection_lost():
                logger.warning("📢 SQL Server connection lost - sync paused")
                # Could send notification to admin panel here

            async def on_sync_complete():
                logger.info("📢 Sync completed successfully")
                # Could send notification to admin panel here

            auto_sync_manager.set_callbacks(
                on_connection_restored=on_connection_restored,
                on_connection_lost=on_connection_lost,
                on_sync_complete=on_sync_complete,
            )

            asyncio.create_task(auto_sync_manager.start())
            logger.info("✅ Auto-sync manager starting (background)")
        else:
            logger.info("Auto-sync manager disabled: SQL Server not configured")

        # Register with API router
        set_auto_sync_manager(auto_sync_manager)
    except Exception as e:
        logger.warning("Auto-sync manager initialization failed: %s", str(e))
        auto_sync_manager = None

    # Start ERP sync service (full sync)
    if erp_sync_service:
        try:
            # SQLSyncService.start() is now async
            await erp_sync_service.start()
            logger.info("✓ ERP sync service started")
        except Exception as e:
            logger.error("Failed to start ERP sync service: %s", str(e))

    # Start change detection sync service
    if change_detection_sync:
        try:
            # ChangeDetectionSyncService.start() is already async
            await change_detection_sync.start()
        except Exception as e:
            logger.error("Failed to start change detection sync service: %s", str(e))

    # Start database health monitoring
    try:
        database_health_service.start()
        logger.info("OK: Database health monitoring started")
    except Exception as e:
        logger.error("Failed to start database health monitoring: %s", str(e))

    # Initialize cache
    try:
        await cache_service.initialize()
        cache_stats = await cache_service.get_stats()
        logger.info("OK: Cache service initialized: %s", cache_stats.get('backend', 'unknown'))
    except Exception as e:
        logger.warning("Cache service error: %s", str(e))

    # Initialize auth dependencies for routers (avoid circular imports)
    try:
        init_auth_dependencies(db, SECRET_KEY, ALGORITHM)
        logger.info("OK: Auth dependencies initialized")
    except Exception as e:
        logger.error("Failed to initialize auth dependencies: %s", str(e))

    # Initialize Lock Service
    try:
        lock_service = LockService(db)
        await lock_service.initialize()
        logger.info("✓ Lock service initialized")
    except Exception as e:
        logger.error("Failed to initialize lock service: %s", str(e))
        logger.warning(
            "⚠️  OPERATOR ACTION REQUIRED: LockService failed to initialize. "
            "Concurrent write operations (count-line submit, approve, reject) are NOT "
            "protected against race conditions. Fix the underlying error and restart."
        )
        lock_service = None

    # Initialize Variant Service (Rule 5)
    try:
        variant_service = VariantService(db)
        logger.info("✓ Variant service initialized for Rule 5 compliance")
    except Exception as e:
        logger.error("Failed to initialize variant service: %s", str(e))
        variant_service = None

    # Initialize Snapshot Service (Rule 2 Mandatory)
    try:
        from backend.services.snapshot_service import SnapshotService

        snapshot_service = SnapshotService(db)
        logger.info("✓ Snapshot service initialized for Rule 2 compliance")
    except Exception as e:
        logger.error("Failed to initialize snapshot service: %s", str(e))
        snapshot_service = None

    # Initialize count_lines_api with dependencies
    try:
        from backend.api.count_lines_routes import init_count_lines_api

        # Use global activity_log_service

        init_count_lines_api(
            activity_log_service,
            lock_service,
            snapshot_service,
            variant_service,
            sql_connector,
        )
        logger.info("✓ CountLines API initialized with dependencies (including VariantService)")

        # PW-01: Verify the critical dependency was wired in.  activity_log_service
        # is not Optional inside count_lines_routes — if it is None here, every
        # activity-log call will silently no-op, losing audit trail permanently.
        from backend.api.count_lines_routes import _activity_log_service as _als_check
        if _als_check is None:
            logger.error(
                "CRITICAL: _activity_log_service is None after init_count_lines_api(). "
                "All count-line audit logging is disabled. Check ActivityLogService init."
            )
        else:
            logger.info("✓ CountLines API: _activity_log_service wired correctly")
    except Exception as e:
        logger.error("Failed to initialize CountLines API: %s", str(e))
    try:
        # Scheduled export service
        scheduled_export_service = ScheduledExportService(db)
        scheduled_export_service.start()
    except Exception as e:
        logger.error("Failed to start scheduled export service: %s", str(e))

    # Initialize enrichment service
    if EnrichmentService is not None and init_enrichment_api is not None:
        try:
            enrichment_svc = EnrichmentService(db)
            init_enrichment_api(enrichment_svc)
            logger.info("✓ Enrichment service initialized")
        except Exception as e:
            logger.error("Failed to initialize enrichment service: %s", str(e))

    # Initialize enterprise services
    if g.ENTERPRISE_AVAILABLE:
        try:
            # Enterprise Audit Service
            app.state.enterprise_audit = EnterpriseAuditService(db)
            await app.state.enterprise_audit.initialize()
        except Exception as e:
            app.state.enterprise_audit = None
            logger.warning("Enterprise audit service not available: %s", str(e))

        try:
            # Enterprise Security Service
            app.state.enterprise_security = EnterpriseSecurityService(db)
            await app.state.enterprise_security.initialize()
        except Exception as e:
            app.state.enterprise_security = None
            logger.warning("Enterprise security service not available: %s", str(e))

        try:
            # Feature Flags Service
            app.state.feature_flags = FeatureFlagService(db)
            await app.state.feature_flags.initialize()
        except Exception as e:
            app.state.feature_flags = None
            logger.warning("Feature flags service not available: %s", str(e))

        try:
            # Data Governance Service
            app.state.data_governance = DataGovernanceService(db)
            await app.state.data_governance.initialize()
        except Exception as e:
            app.state.data_governance = None
            logger.warning("Data governance service not available: %s", str(e))
    else:
        # Set None for enterprise services if not available
        app.state.enterprise_audit = None
        app.state.enterprise_security = None
        app.state.feature_flags = None
        app.state.data_governance = None

    try:
        # Sync conflicts service
        sync_conflicts_service = SyncConflictsService(db)
        logger.info("✓ Sync conflicts service initialized")
    except Exception as e:
        logger.error("Failed to initialize sync conflicts service: %s", str(e))

    try:
        # Set monitoring service for metrics API
        set_monitoring_service(monitoring_service)
        logger.info("✓ Monitoring service connected to metrics API")
    except Exception as e:
        logger.error("Failed to set monitoring service: %s", str(e))

    try:
        # Initialize ERP API
        init_erp_api(db, cache_service, sql_connector)
        logger.info("✓ ERP API initialized")
    except Exception as e:
        logger.error("Failed to initialize ERP API: %s", str(e))

    try:
        # Initialize Enhanced Item API
        init_enhanced_api(db, cache_service, monitoring_service, sql_connector)
        logger.info("✓ Enhanced Item API initialized")
    except Exception as e:
        logger.error("Failed to initialize Enhanced Item API: %s", str(e))

    try:
        # Initialize verification API
        init_verification_api(db, cache_service, erp_sync_service)
        logger.info("✓ Item verification API initialized")
    except Exception as e:
        logger.error("Failed to initialize verification API: %s", str(e))

    # Startup checklist verification
    startup_checklist = {
        "mongodb": False,
        "sql_server": False,
        "cache": False,
        "auth": False,
        "services": False,
    }

    # Verify MongoDB
    try:
        await db.command("ping")
        startup_checklist["mongodb"] = True
        logger.info("✓ Startup Check: MongoDB connected")
    except Exception as e:
        logger.warning("⚠️  Startup Check: MongoDB not connected - %s", str(e))

    # Verify SQL Server (optional)
    try:
        sql_ok = False
        if sql_connector:
            sql_ok = await asyncio.wait_for(
                asyncio.to_thread(sql_connector.test_connection),
                timeout=3,
            )
        if sql_ok:
            startup_checklist["sql_server"] = True
            logger.info("✓ Startup Check: SQL Server connected")
        else:
            logger.info("ℹ️  Startup Check: SQL Server not configured (optional)")
    except asyncio.TimeoutError:
        logger.info("ℹ️  Startup Check: SQL Server not available - timeout")
    except Exception as e:
        logger.info("ℹ️  Startup Check: SQL Server not available - %s", str(e))

    # Verify Cache
    try:
        cache_stats = await cache_service.get_stats()
        logger.info("✓ Startup Check: Cache initialized (%s)", cache_stats.get('backend', 'unknown'))
    except Exception as e:
        logger.warning("⚠️ Startup Check: Cache service warning: %s", str(e))

    # Verify Auth
    try:
        from backend.auth.dependencies import auth_deps

        if auth_deps._initialized:
            startup_checklist["auth"] = True
            logger.info("✓ Startup Check: Auth initialized")
    except Exception as e:
        logger.warning("⚠️  Startup Check: Auth error - %s", str(e))

    # Verify Services
    services_running = []
    # if erp_sync_service:
    #     services_running.append("ERP Sync")
    if scheduled_export_service:
        services_running.append("Scheduled Export")
    if sync_conflicts_service:
        services_running.append("Sync Conflicts")
    if monitoring_service:
        services_running.append("Monitoring")
    if database_health_service:
        services_running.append("Database Health")

    if services_running:
        startup_checklist["services"] = True
        logger.info("✓ Startup Check: %s services running", len(services_running))

    # Log startup summary
    critical_services = ["mongodb", "auth"]
    all_critical_ok = all(startup_checklist[svc] for svc in critical_services)

    if all_critical_ok:
        logger.info("✅ Startup Checklist: All critical services OK")
    else:
        failed = [svc for svc in critical_services if not startup_checklist[svc]]
        logger.warning("⚠️  Startup Checklist: Critical services failed - %s", ', '.join(failed))

    # Initialize search service
    try:
        from backend.db.runtime import get_db
        from backend.services.search_service import init_search_service

        database = get_db()
        init_search_service(database)
        logger.info("✓ Search service initialized successfully")
    except Exception as e:
        logger.error("❌ Failed to initialize search service: %s", e)

    logger.info("OK: Application startup complete")

    # Inject services into runtime globals

    # Core Services
    g.db = db

    g.cache_service = cache_service

    g.rate_limiter = rate_limiter

    g.concurrent_handler = concurrent_handler

    g.activity_log_service = activity_log_service

    g.error_log_service = error_log_service

    g.refresh_token_service = refresh_token_service

    g.batch_operations = batch_operations

    g.migration_manager = migration_manager

    # Functional Services
    g.scheduled_export_service = scheduled_export_service

    g.sync_conflicts_service = sync_conflicts_service

    g.monitoring_service = monitoring_service

    g.database_health_service = database_health_service

    g.auto_sync_manager = auto_sync_manager

    if g.ENTERPRISE_AVAILABLE:
        g.enterprise_audit_service = getattr(app.state, "enterprise_audit", None)

        g.enterprise_security_service = getattr(app.state, "enterprise_security", None)

    logger.info("✓ Global services initialized")

    # Save backend port info (replaces deprecated on_event("startup"))
    try:
        port_str = os.getenv("PORT", str(getattr(settings, "PORT", 8001)))
        port = int(port_str)
    except Exception:
        port = 8001

    try:
        local_ip = PortDetector.get_local_ip()

        # Check for SSL certificates to determine protocol
        # project_root is defined at top of file as backend/
        repo_root = project_root.parent
        default_key = repo_root / "nginx" / "ssl" / "privkey.pem"
        default_cert = repo_root / "nginx" / "ssl" / "fullchain.pem"

        ssl_keyfile = os.getenv("SSL_KEYFILE", str(default_key))
        ssl_certfile = os.getenv("SSL_CERTFILE", str(default_cert))
        use_ssl = os.path.exists(ssl_keyfile) and os.path.exists(ssl_certfile)
        protocol = "https" if use_ssl else "http"

        save_backend_info(port, local_ip, protocol)
    except Exception as e:
        logger.error("Error saving backend port info: %s", e)

    yield

    # Shutdown with timeout handling
    logger.info("🛑 Shutting down application...")
    shutdown_start = time.time()
    shutdown_timeout = 30  # 30 seconds max for graceful shutdown

    shutdown_tasks = []

    # Stop sync services
    # if erp_sync_service is not None:
    #     erp_sync = erp_sync_service  # Type narrowing for Pyright

    #     async def stop_erp_sync():
    #         try:
    #             erp_sync.stop()
    #             logger.info("✓ ERP sync service stopped")
    #         except Exception as e:
    #             logger.error("Error stopping ERP sync service: %s", str(e))

    #     shutdown_tasks.append(stop_erp_sync())

    # Stop scheduled export service
    if scheduled_export_service:

        async def stop_export_service():
            try:
                await scheduled_export_service.stop()
                logger.info("✓ Scheduled export service stopped")
            except Exception as e:
                logger.error("Error stopping scheduled export service: %s", str(e))

        shutdown_tasks.append(stop_export_service())

    # Stop database health monitoring
    async def stop_health_monitoring():
        try:
            await database_health_service.stop()
            logger.info("✓ Database health monitoring stopped")
        except Exception as e:
            logger.error("Error stopping database health monitoring: %s", str(e))

    shutdown_tasks.append(stop_health_monitoring())

    # Stop auto-sync manager
    async def stop_auto_sync():
        if auto_sync_manager:
            try:
                await auto_sync_manager.stop()
                logger.info("✅ Auto-sync manager stopped")
            except Exception as e:
                logger.error("Error stopping auto-sync manager: %s", e)

    shutdown_tasks.append(stop_auto_sync())

    # Phase 1: Stop Pub/Sub and Redis services
    async def stop_redis_services():
        try:
            # Detach Redis from WebSocket manager before closing the connection
            from backend.core.websocket_manager import manager as _ws_manager
            await _ws_manager.detach_redis()
            _ws_manager.detach_replay_store()
            logger.info("\u2713 WebSocket Redis fan-out detached")

            rate_limiter.detach_redis()

            if pubsub_service:
                await pubsub_service.stop()
                logger.info("\u2713 Pub/Sub service stopped")

            await close_redis()
            logger.info("\u2713 Redis connection closed")
        except Exception as e:
            logger.error("Error stopping Redis services: %s", str(e))

    shutdown_tasks.append(stop_redis_services())

    # Execute shutdown tasks with timeout
    try:
        await asyncio.wait_for(
            asyncio.gather(*shutdown_tasks, return_exceptions=True),
            timeout=shutdown_timeout,
        )
    except TimeoutError:
        logger.warning("\u26a0\ufe0f  Shutdown timeout exceeded; some services may not have shut down cleanly.")

    # PW-08: Cancel watchdog background task before closing MongoDB so the
    # final in-flight check does not hit a closed connection.
    if _watchdog_task is not None and not _watchdog_task.done():
        _watchdog_task.cancel()
        try:
            await _watchdog_task
        except asyncio.CancelledError:
            pass
        logger.info("\u2713 Watchdog background task stopped")

    # Close MongoDB connection
    try:
        if "client" in globals() and client:
            client.close()
            logger.info("MongoDB connection closed")
    except Exception as e:
        logger.error("Error closing MongoDB connection: %s", str(e))
