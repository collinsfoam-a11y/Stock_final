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
from backend.db.initialization import init_default_users, init_mock_erp_data
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
try:
    init_tracing()
except Exception:
    # Never break startup due to tracing
    logger.debug("Suppressed non-fatal exception", exc_info=True)

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
install_db_write_guards(db)

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
if getattr(settings, "CHANGE_DETECTION_SYNC_ENABLED", True):
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

# Auto-sync manager - automatically syncs when SQL Server becomes available
auto_sync_manager = None
if getattr(settings, "AUTO_SYNC_ENABLED", False):
    try:
        auto_sync_manager = AutoSyncManager(
            sql_connector=sql_connector,
            mongo_db=db,
            sync_interval=getattr(settings, "AUTO_SYNC_INTERVAL", 3600),
            enabled=True,
        )
        set_auto_sync_manager(auto_sync_manager)
    except Exception as e:
        logger.warning("Auto-sync manager initialization failed: %s", str(e))

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


async def _init_auth(db_instance):
    from backend.config import settings
    from backend.db.initialization import init_default_users, init_mock_erp_data
    import logging
    logger = logging.getLogger("stock-verify")
    try:
        if getattr(settings, "AUTO_SEED_DEFAULT_USERS", False):
            await init_default_users(db_instance)
            logger.info("OK: Default users initialized")
        else:
            logger.info("Default user seeding disabled")

        if getattr(settings, "AUTO_SEED_MOCK_ERP_DATA", False):
            await init_mock_erp_data(db_instance)
            logger.info("OK: Mock ERP data check complete")
        else:
            logger.info("Mock ERP data seeding disabled")
    except Exception as e:
        logger.warning(
            f"Could not initialize optional seed data (may be due to MongoDB unavailability): {str(e)}"
        )

# Create the main app with lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.core.startup import (
        StartupContext, init_redis_services, init_mdns_service,
        init_sql_server, init_connection_pool, verify_mongodb,
        run_migrations, init_auto_sync, start_sync_services,
        save_port_info, stop_services
    )

    logger.info("🚀 Starting StockVerify application...")
    global scheduled_export_service, sync_conflicts_service, auto_sync_manager
    ctx = StartupContext()
    
    # Initialize runtime globals
    set_client(client)
    set_db(db)
    set_cache_service(cache_service)
    set_refresh_token_service(refresh_token_service)

    # Phase 1: Initialize Redis and related services
    redis_service, pubsub_service = await init_redis_services()

    # Start mDNS service
    await init_mdns_service()

    # Initialize SQL Server connection
    sql_credentials_ready = await init_sql_server(sql_connector, count_lines_router=None)
    # Note: count_lines_router is imported locally in the original, we will do it here
    try:
        from backend.api.count_lines_api import router as count_lines_router
        count_lines_router.sql_connector = sql_connector
        logger.info("✓ SQL connector attached to count_lines_router")
    except Exception as e:
        logger.warning("Failed to attach SQL connector to count_lines_router: %s", str(e))

    # Initialize connection pool in background
    if (
        not RUNNING_UNDER_PYTEST
        and getattr(settings, "USE_CONNECTION_POOL", True)
        and getattr(settings, "SQL_SERVER_HOST", None)
        and getattr(settings, "SQL_SERVER_DATABASE", None)
        and sql_credentials_ready
    ):
        ctx.spawn_background(init_connection_pool(ctx), "init-connection-pool")

    # Verify MongoDB
    await verify_mongodb(db)

    # Bootstrap
    await _init_auth(db)

    # Migrations
    await run_migrations(migration_manager)

    # Auto sync
    await init_auto_sync(auto_sync_manager, sql_connector, db, ctx)

    # Start ERP and Change Detection sync
    await start_sync_services(erp_sync_service, change_detection_sync)

    # Database health monitoring
    try:
        database_health_service.start()
        logger.info("OK: Database health monitoring started")
    except Exception as e:
        logger.error("Failed to start database health monitoring: %s", str(e))

    # Initialize cache
    try:
        await cache_service.initialize()
        cache_stats = await cache_service.get_stats()
        logger.info("OK: Cache service initialized: %s", cache_stats.get("backend", "unknown"))
    except Exception as e:
        logger.warning("Cache service error: %s", str(e))

    # Auth deps
    try:
        init_auth_dependencies(db, SECRET_KEY, ALGORITHM)
        logger.info("OK: Auth dependencies initialized")
    except Exception as e:
        logger.error("Failed to initialize auth dependencies: %s", str(e))

    # Lock service
    try:
        lock_service = LockService(db)
        await lock_service.initialize()
        logger.info("✓ Lock service initialized")
    except Exception as e:
        logger.error("Failed to initialize lock service: %s", str(e))
        lock_service = None

    # Variant Service
    try:
        variant_service = VariantService(db)
        logger.info("✓ Variant service initialized for Rule 5 compliance")
    except Exception as e:
        logger.error("Failed to initialize variant service: %s", str(e))
        variant_service = None

    # Snapshot Service
    try:
        from backend.services.snapshot_service import SnapshotService
        snapshot_service = SnapshotService(db)
        logger.info("✓ Snapshot service initialized for Rule 2 compliance")
    except Exception as e:
        logger.error("Failed to initialize snapshot service: %s", str(e))
        snapshot_service = None

    # CountLines API
    try:
        from backend.api.count_lines_api import init_count_lines_api
        init_count_lines_api(
            activity_log_service,
            lock_service,
            snapshot_service,
            variant_service,
        )
        logger.info("✓ CountLines API initialized with dependencies")
    except Exception as e:
        logger.error("Failed to initialize CountLines API: %s", str(e))

    try:
        scheduled_export_service = ScheduledExportService(db)
        scheduled_export_service.start()
    except Exception as e:
        logger.error("Failed to start scheduled export service: %s", str(e))

    # Enrichment
    if EnrichmentService is not None and init_enrichment_api is not None:
        try:
            enrichment_svc = EnrichmentService(db)
            init_enrichment_api(enrichment_svc)
            logger.info("✓ Enrichment service initialized")
        except Exception as e:
            logger.error("Failed to initialize enrichment service: %s", str(e))

    # Enterprise Services
    if g.ENTERPRISE_AVAILABLE:
        try:
            app.state.enterprise_audit = EnterpriseAuditService(db)
            await app.state.enterprise_audit.initialize()
        except Exception as e:
            app.state.enterprise_audit = None
            logger.warning("Enterprise audit service not available: %s", str(e))

        try:
            app.state.enterprise_security = EnterpriseSecurityService(db)
            await app.state.enterprise_security.initialize()
        except Exception as e:
            app.state.enterprise_security = None
            logger.warning("Enterprise security service not available: %s", str(e))

        try:
            app.state.feature_flags = FeatureFlagService(db)
            await app.state.feature_flags.initialize()
        except Exception as e:
            app.state.feature_flags = None
            logger.warning("Feature flags service not available: %s", str(e))

        try:
            app.state.data_governance = DataGovernanceService(db)
            await app.state.data_governance.initialize()
        except Exception as e:
            app.state.data_governance = None
            logger.warning("Data governance service not available: %s", str(e))
    else:
        app.state.enterprise_audit = None
        app.state.enterprise_security = None
        app.state.feature_flags = None
        app.state.data_governance = None

    # Sync conflicts
    try:
        sync_conflicts_service = SyncConflictsService(db)
        logger.info("✓ Sync conflicts service initialized")
    except Exception as e:
        logger.error("Failed to initialize sync conflicts service: %s", str(e))

    try:
        set_monitoring_service(monitoring_service)
        logger.info("✓ Monitoring service connected to metrics API")
    except Exception as e:
        logger.error("Failed to set monitoring service: %s", str(e))

    try:
        init_erp_api(db, cache_service, sql_connector)
        logger.info("✓ ERP API initialized")
    except Exception as e:
        logger.error("Failed to initialize ERP API: %s", str(e))

    try:
        init_enhanced_api(db, cache_service, monitoring_service, sql_connector)
        logger.info("✓ Enhanced Item API initialized")
    except Exception as e:
        logger.error("Failed to initialize Enhanced Item API: %s", str(e))

    try:
        init_verification_api(db, cache_service, erp_sync_service)
        logger.info("✓ Item verification API initialized")
    except Exception as e:
        logger.error("Failed to initialize verification API: %s", str(e))

    # Search service
    try:
        from backend.db.runtime import get_db
        from backend.services.search_service import init_search_service
        database = get_db()
        init_search_service(database)
        logger.info("✓ Search service initialized successfully")
    except Exception as e:
        logger.error("❌ Failed to initialize search service: %s", e)

    logger.info("OK: Application startup complete")

    # Inject services into globals
    g.db = db
    g.cache_service = cache_service
    g.rate_limiter = rate_limiter
    g.concurrent_handler = concurrent_handler
    g.activity_log_service = activity_log_service
    g.error_log_service = error_log_service
    g.refresh_token_service = refresh_token_service
    g.batch_operations = batch_operations
    g.migration_manager = migration_manager
    
    g.scheduled_export_service = scheduled_export_service
    g.sync_conflicts_service = sync_conflicts_service
    g.monitoring_service = monitoring_service
    g.database_health_service = database_health_service
    g.auto_sync_manager = auto_sync_manager

    if g.ENTERPRISE_AVAILABLE:
        g.enterprise_audit_service = getattr(app.state, "enterprise_audit", None)
        g.enterprise_security_service = getattr(app.state, "enterprise_security", None)

    save_port_info(project_root)

    yield

    # Shutdown
    logger.info("🛑 Shutting down application...")
    shutdown_start = time.time()
    
    for task in list(ctx.background_tasks):
        if not task.done():
            task.cancel()
    if ctx.background_tasks:
        await asyncio.gather(*ctx.background_tasks, return_exceptions=True)

    shutdown_tasks = await stop_services(
        ctx, auto_sync_manager, erp_sync_service, scheduled_export_service,
        database_health_service, pubsub_service
    )
    
    try:
        await asyncio.wait_for(
            asyncio.gather(*shutdown_tasks, return_exceptions=True),
            timeout=30,
        )
    except TimeoutError:
        logger.warning("⚠️  Shutdown timeout forcing shutdown...")
    except Exception as e:
        logger.error("Error during shutdown: %s", str(e))

    if ctx.connection_pool:
        try:
            ctx.connection_pool.close_all()
            logger.info("✓ Connection pool closed")
        except Exception as e:
            logger.error("Error closing connection pool: %s", str(e))

    try:
        if "client" in globals() and client:
            client.close()
            logger.info("✓ MongoDB connection closed")
    except Exception as e:
        logger.error("Error closing MongoDB connection: %s", str(e))

    from backend.services.mdns_service import stop_mdns
    try:
        await stop_mdns()
        logger.info("✓ mDNS service stopped")
    except Exception as e:
        logger.error("Error stopping mDNS service: %s", str(e))

    logger.info("✓ Application shutdown complete (took %.2fs)", time.time() - shutdown_start)
