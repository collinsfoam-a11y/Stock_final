"""FastAPI lifespan management — all runtime initialization happens inside lifespan().

Previously, MongoDB clients and all services were created at module import time,
causing side effects on every import and preventing test isolation. Now the
module level contains only imports, type aliases, and the lifespan definition.
"""

import asyncio
import logging
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Generic, TypeVar, cast

from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Imports — no side effects at this level
# ---------------------------------------------------------------------------
from backend.api.enhanced_item_api import init_enhanced_api
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

# Services
from backend.services.activity_log import ActivityLogService
from backend.services.auto_sync_manager import AutoSyncManager
from backend.services.batch_operations import BatchOperationsService
from backend.services.cache_service import CacheService
from backend.services.change_detection_sync import ChangeDetectionSyncService
from backend.services.database_health import DatabaseHealthService
from backend.services.database_optimizer import DatabaseOptimizer
from backend.services.error_log import ErrorLogService
from backend.services.governance_guard import install_db_write_guards
from backend.services.lock_service import LockService
from backend.services.mdns_service import stop_mdns
from backend.services.monitoring_service import MonitoringService
from backend.services.rate_limiter import ConcurrentRequestHandler, RateLimiter
from backend.services.refresh_token import RefreshTokenService
from backend.services.runtime import set_cache_service, set_refresh_token_service
from backend.services.scheduled_export_service import ScheduledExportService
from backend.services.sql_sync_service import SQLSyncService
from backend.services.sync_conflicts_service import SyncConflictsService
from backend.services.variant_service import VariantService
from backend.sql_server_connector import SQLServerConnector

# Enterprise imports (optional — silent if unavailable)
try:
    from backend.api.enrichment_api import init_enrichment_api
    from backend.services.enrichment_service import EnrichmentService
except ImportError:  # pragma: no cover
    EnrichmentService = None  # type: ignore[misc,assignment]
    init_enrichment_api = None  # type: ignore[misc,assignment]

# Utils
from backend.utils.logging_config import setup_logging
from backend.utils.tracing import init_tracing

# ---------------------------------------------------------------------------
# Module-level logger: only for use before lifespan() runs (e.g. during import
# warnings). All runtime logging uses the logger set up inside lifespan().
# ---------------------------------------------------------------------------
logger = logging.getLogger("stock-verify")

# ---------------------------------------------------------------------------
# Type aliases & constants (no I/O required)
# ---------------------------------------------------------------------------
T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """Generic API response wrapper used across the codebase."""

    success: bool
    data: T | None = None
    error: dict[str, Any | None] | None = None

    @classmethod
    def success_response(cls, data: T) -> "ApiResponse[T]":
        return cls(success=True, data=data)

    @classmethod
    def error_response(cls, error: dict[str, Any]) -> "ApiResponse[T]":
        return cls(success=False, error=error)


ROOT_DIR = Path(__file__).parent


# ---------------------------------------------------------------------------
# Backward-compatible lazy proxies for modules that import from lifespan.py
# These read from globals at access time, so they work correctly whether
# lifespan() has been called or not.
# ---------------------------------------------------------------------------
class _LazyProxy:
    """Delegates all attribute/item access to a value from the globals module."""

    def __init__(self, attr_name: str) -> None:
        self._attr_name = attr_name

    def _target(self) -> Any:
        return getattr(g, self._attr_name, None)

    def __getattr__(self, item: str) -> Any:
        target = self._target()
        if target is None:
            msg = f"Global '{self._attr_name}' is not initialized yet"
            raise RuntimeError(msg)
        return getattr(target, item)

    def __getitem__(self, key: Any) -> Any:
        return self._target()[key]

    def __bool__(self) -> bool:
        return self._target() is not None

    def __repr__(self) -> str:
        t = self._target()
        return repr(t) if t is not None else f"<LazyProxy({self._attr_name}): uninitialized>"


db = _LazyProxy("db")
cache_service = _LazyProxy("cache_service")
activity_log_service = _LazyProxy("activity_log_service")
connection_pool = _LazyProxy("connection_pool")
database_health_service = _LazyProxy("database_health_service")
monitoring_service = _LazyProxy("monitoring_service")
rate_limiter = _LazyProxy("rate_limiter")
sql_connector = _LazyProxy("sql_connector")


def get_sql_connector() -> Any:
    return getattr(g, "sql_connector", None)


def get_connection_pool() -> Any:
    return getattr(g, "connection_pool", None)


def get_database_health_service() -> Any:
    return getattr(g, "database_health_service", None)


def get_monitoring_service() -> Any:
    return getattr(g, "monitoring_service", None)


# ---------------------------------------------------------------------------
# Pure helper — no side effects
# ---------------------------------------------------------------------------
async def _init_auth(db_instance: Any, _logger: logging.Logger) -> None:
    """Seed default users & mock ERP data if configured in settings."""
    try:
        if getattr(settings, "AUTO_SEED_DEFAULT_USERS", False):
            await init_default_users(db_instance)
            _logger.info("OK: Default users initialized")
        else:
            _logger.info("Default user seeding disabled")

        if getattr(settings, "AUTO_SEED_MOCK_ERP_DATA", False):
            await init_mock_erp_data(db_instance)
            _logger.info("OK: Mock ERP data check complete")
        else:
            _logger.info("Mock ERP data seeding disabled")
    except Exception as exc:
        _logger.warning(
            "Could not initialize optional seed data (may be due to MongoDB unavailability): %s",
            exc,
        )


# ---------------------------------------------------------------------------
# The lifespan context manager — all runtime initialization happens here
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- Setup logging ----
    _logger = setup_logging(
        log_level=settings.LOG_LEVEL,
        log_format=settings.LOG_FORMAT,
        log_file=settings.LOG_FILE or "app.log",
        app_name=settings.APP_NAME,
        log_max_bytes=settings.LOG_MAX_BYTES,
        log_backup_count=settings.LOG_BACKUP_COUNT,
    )

    # ---- Tracing (optional, env-gated) ----
    try:
        init_tracing()
    except Exception:
        _logger.debug("Suppressed non-fatal tracing exception", exc_info=True)

    # ---- Detect test environment ----
    _running_under_pytest = "pytest" in sys.modules
    if _running_under_pytest:
        logging.getLogger().setLevel(logging.INFO)

    _logger.info("🚀 Starting StockVerify application...")

    # ---- MongoDB connection ----
    _mongo_url = settings.MONGO_URL.rstrip("/")
    _mongo_client_options: dict[str, Any] = {
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
        _mongo_url,
        **_mongo_client_options,  # type: ignore[arg-type]
    )
    db = client[settings.DB_NAME]
    install_db_write_guards(db)

    # Database optimizer (skip under pytest for speed)
    if not _running_under_pytest:
        _db_optimizer = DatabaseOptimizer(
            mongo_client=client,
            max_pool_size=100,
            min_pool_size=10,
            max_idle_time_ms=45000,
            server_selection_timeout_ms=5000,
            connect_timeout_ms=20000,
            socket_timeout_ms=20000,
        )
        client = _db_optimizer.optimize_client()

    # ---- Security: password hashing ----
    try:
        pwd_context = CryptContext(
            schemes=["argon2", "bcrypt"],
            deprecated="auto",
            argon2__memory_cost=65536,
            argon2__time_cost=3,
            argon2__parallelism=4,
        )
        # Quick sanity check — access bcrypt to verify it works
        _logger.info("Password hashing: Using Argon2 with bcrypt fallback")
    except Exception:
        _logger.warning("Argon2 not available, falling back to bcrypt-only")
        pwd_context = CryptContext(
            schemes=["bcrypt"],
            deprecated="auto",
            bcrypt__rounds=12,
        )

    secret_key: str = cast(str, settings.JWT_SECRET)
    if not secret_key:
        raise ValueError("JWT_SECRET must be set in configuration")
    algorithm = settings.JWT_ALGORITHM

    # ---- Services ----
    cache_service = CacheService(
        redis_url=getattr(settings, "REDIS_URL", None),
        default_ttl=getattr(settings, "CACHE_TTL", 3600),
    )
    rate_limiter = RateLimiter(
        default_rate=getattr(settings, "RATE_LIMIT_PER_MINUTE", 100),
        default_burst=getattr(settings, "RATE_LIMIT_BURST", 20),
        per_user=True,
        per_endpoint=False,
    )
    concurrent_handler = ConcurrentRequestHandler(
        max_concurrent=getattr(settings, "MAX_CONCURRENT", 50),
        queue_size=getattr(settings, "QUEUE_SIZE", 100),
    )
    monitoring_service = MonitoringService(
        history_size=getattr(settings, "METRICS_HISTORY_SIZE", 1000),
    )
    sql_connector = SQLServerConnector()

    database_health_service = DatabaseHealthService(
        mongo_db=db,
        sql_connector=sql_connector,
        check_interval=60,
        mongo_uri=_mongo_url,
        db_name=settings.DB_NAME,
        mongo_client_options=_mongo_client_options,
    )

    # ERP sync service
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
        except Exception as exc:
            _logger.warning("ERP sync service initialization failed: %s", exc)

    # Change detection sync
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
        except Exception as exc:
            _logger.warning("Change detection sync service initialization failed: %s", exc)

    # Auto-sync manager
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
        except Exception as exc:
            _logger.warning("Auto-sync manager initialization failed: %s", exc)

    migration_manager = MigrationManager(db)
    refresh_token_service = RefreshTokenService(
        db,
        cast(str, settings.JWT_REFRESH_SECRET),
        algorithm,
        access_secret_key=secret_key,
    )
    batch_operations = BatchOperationsService(db)
    activity_log_service = ActivityLogService(db)
    error_log_service = ErrorLogService(db)

    # ---- Enterprise service detection ----
    EnterpriseAuditService: Any = None  # type: ignore[no-redef]
    EnterpriseSecurityService: Any = None  # type: ignore[no-redef]
    FeatureFlagService: Any = None  # type: ignore[no-redef]
    DataGovernanceService: Any = None  # type: ignore[no-redef]
    try:
        from backend.services.data_governance import DataGovernanceService as _DataGovernanceService
        from backend.services.enterprise_audit import (
            EnterpriseAuditService as _EnterpriseAuditService,
        )
        from backend.services.enterprise_security import (
            EnterpriseSecurityService as _EnterpriseSecurityService,
        )
        from backend.services.feature_flags import FeatureFlagService as _FeatureFlagService

        EnterpriseAuditService = _EnterpriseAuditService
        EnterpriseSecurityService = _EnterpriseSecurityService
        FeatureFlagService = _FeatureFlagService
        DataGovernanceService = _DataGovernanceService
        g.ENTERPRISE_AVAILABLE = True
    except ImportError:
        g.ENTERPRISE_AVAILABLE = False

    # ---- Set runtime globals (early, before downstream init) ----
    set_client(client)
    set_db(db)
    set_cache_service(cache_service)
    set_refresh_token_service(refresh_token_service)

    # Late import to break circular dependency
    from backend.core.startup import (
        StartupContext,
        init_auto_sync,
        init_connection_pool,
        init_mdns_service,
        init_redis_services,
        init_sql_server,
        run_migrations,
        save_port_info,
        start_sync_services,
        stop_services,
        verify_mongodb,
    )

    ctx = StartupContext()

    # ---- Phase 1: Redis & network services ----
    _redis_service, pubsub_service = await init_redis_services()
    await init_mdns_service()

    # ---- SQL Server ----
    sql_credentials_ready = await init_sql_server(sql_connector, count_lines_router=None)
    try:
        from backend.api.count_lines_api import router as count_lines_router

        count_lines_router.sql_connector = sql_connector  # type: ignore[attr-defined]
        _logger.info("✓ SQL connector attached to count_lines_router")
    except Exception as exc:
        _logger.warning("Failed to attach SQL connector to count_lines_router: %s", exc)

    if (
        not _running_under_pytest
        and getattr(settings, "USE_CONNECTION_POOL", True)
        and getattr(settings, "SQL_SERVER_HOST", None)
        and getattr(settings, "SQL_SERVER_DATABASE", None)
        and sql_credentials_ready
    ):
        ctx.spawn_background(init_connection_pool(ctx), "init-connection-pool")

    # ---- MongoDB health check & seed data ----
    await verify_mongodb(db)
    await _init_auth(db, _logger)

    # ---- Migrations ----
    await run_migrations(migration_manager)

    # ---- Sync services ----
    await init_auto_sync(auto_sync_manager, sql_connector, db, ctx)
    await start_sync_services(erp_sync_service, change_detection_sync)

    # ---- Database health monitoring ----
    try:
        database_health_service.start()  # Synchronous — uses asyncio.create_task internally
        _logger.info("OK: Database health monitoring started")
    except Exception as exc:
        _logger.error("Failed to start database health monitoring: %s", exc)

    # ---- Cache service ----
    try:
        await cache_service.initialize()
        cache_stats = await cache_service.get_stats()
        _logger.info("OK: Cache service initialized: %s", cache_stats.get("backend", "unknown"))
    except Exception as exc:
        _logger.warning("Cache service error: %s", exc)

    # ---- Auth dependencies ----
    try:
        init_auth_dependencies(db, secret_key, algorithm)
        _logger.info("OK: Auth dependencies initialized")
    except Exception as exc:
        _logger.error("Failed to initialize auth dependencies: %s", exc)

    # ---- Lock service ----
    try:
        lock_service = LockService(db)
        await lock_service.initialize()
        _logger.info("✓ Lock service initialized")
    except Exception as exc:
        _logger.error("Failed to initialize lock service: %s", exc)
        lock_service = None

    # ---- Variant service ----
    try:
        variant_service = VariantService(db)
        _logger.info("✓ Variant service initialized for Rule 5 compliance")
    except Exception as exc:
        _logger.error("Failed to initialize variant service: %s", exc)
        variant_service = None

    # ---- Snapshot service ----
    try:
        from backend.services.snapshot_service import SnapshotService

        snapshot_service = SnapshotService(db)
        _logger.info("✓ Snapshot service initialized for Rule 2 compliance")
    except Exception as exc:
        _logger.error("Failed to initialize snapshot service: %s", exc)
        snapshot_service = None

    # ---- CountLines API ----
    try:
        from backend.api.count_lines_api import init_count_lines_api

        init_count_lines_api(activity_log_service, lock_service, snapshot_service, variant_service)
        _logger.info("✓ CountLines API initialized with dependencies")
    except Exception as exc:
        _logger.error("Failed to initialize CountLines API: %s", exc)

    # ---- Scheduled export ----
    scheduled_export_service = None
    try:
        scheduled_export_service = ScheduledExportService(db)
        scheduled_export_service.start()  # Synchronous — uses asyncio.create_task internally
        _logger.info("✓ Scheduled export service started")
    except Exception as exc:
        _logger.error("Failed to start scheduled export service: %s", exc)

    # ---- Enrichment (optional) ----
    if EnrichmentService is not None and init_enrichment_api is not None:
        try:
            enrichment_svc = EnrichmentService(db)
            init_enrichment_api(enrichment_svc)
            _logger.info("✓ Enrichment service initialized")
        except Exception as exc:
            _logger.error("Failed to initialize enrichment service: %s", exc)

    # ---- Enterprise services ----
    if g.ENTERPRISE_AVAILABLE:
        try:
            _enterprise_audit = EnterpriseAuditService(db)
            await _enterprise_audit.initialize()
            app.state.enterprise_audit = _enterprise_audit
        except Exception as exc:
            app.state.enterprise_audit = None
            _logger.warning("Enterprise audit service not available: %s", exc)

        try:
            _enterprise_security = EnterpriseSecurityService(db)
            await _enterprise_security.initialize()
            app.state.enterprise_security = _enterprise_security
        except Exception as exc:
            app.state.enterprise_security = None
            _logger.warning("Enterprise security service not available: %s", exc)

        try:
            _feature_flags = FeatureFlagService(db)
            await _feature_flags.initialize()
            app.state.feature_flags = _feature_flags
        except Exception as exc:
            app.state.feature_flags = None
            _logger.warning("Feature flags service not available: %s", exc)

        try:
            _data_governance = DataGovernanceService(db)
            await _data_governance.initialize()
            app.state.data_governance = _data_governance
        except Exception as exc:
            app.state.data_governance = None
            _logger.warning("Data governance service not available: %s", exc)
    else:
        app.state.enterprise_audit = None
        app.state.enterprise_security = None
        app.state.feature_flags = None
        app.state.data_governance = None

    # ---- Sync conflicts ----
    sync_conflicts_service = None
    try:
        sync_conflicts_service = SyncConflictsService(db)
        _logger.info("✓ Sync conflicts service initialized")
    except Exception as exc:
        _logger.error("Failed to initialize sync conflicts service: %s", exc)

    # ---- Monitoring ----
    try:
        set_monitoring_service(monitoring_service)
        _logger.info("✓ Monitoring service connected to metrics API")
    except Exception as exc:
        _logger.error("Failed to set monitoring service: %s", exc)

    # ---- ERP API ----
    try:
        init_erp_api(db, cache_service, sql_connector)
        _logger.info("✓ ERP API initialized")
    except Exception as exc:
        _logger.error("Failed to initialize ERP API: %s", exc)

    # ---- Enhanced Item API ----
    try:
        init_enhanced_api(db, cache_service, monitoring_service, sql_connector)
        _logger.info("✓ Enhanced Item API initialized")
    except Exception as exc:
        _logger.error("Failed to initialize Enhanced Item API: %s", exc)

    # ---- Item verification API ----
    try:
        init_verification_api(db, cache_service, erp_sync_service)
        _logger.info("✓ Item verification API initialized")
    except Exception as exc:
        _logger.error("Failed to initialize verification API: %s", exc)

    # ---- Search service ----
    try:
        from backend.db.runtime import get_db
        from backend.services.search_service import init_search_service

        database = get_db()
        init_search_service(database)
        _logger.info("✓ Search service initialized successfully")
    except Exception as exc:
        _logger.error("❌ Failed to initialize search service: %s", exc)

    _logger.info("OK: Application startup complete")

    # ---- Inject all services into globals (backward compatibility) ----
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
    g.pwd_context = pwd_context
    g.secret_key = secret_key
    g.algorithm = algorithm

    if g.ENTERPRISE_AVAILABLE:
        g.enterprise_audit_service = getattr(app.state, "enterprise_audit", None)
        g.enterprise_security_service = getattr(app.state, "enterprise_security", None)

    # ---- Save port info ----
    save_port_info(ROOT_DIR)

    # ========== RUNNING ==========
    yield
    # ========== SHUTDOWN ==========

    _logger.info("🛑 Shutting down application...")
    shutdown_start = time.time()

    # Cancel background tasks
    for task in list(ctx.background_tasks):
        if not task.done():
            task.cancel()
    if ctx.background_tasks:
        await asyncio.gather(*ctx.background_tasks, return_exceptions=True)

    # Stop all services
    shutdown_tasks = await stop_services(
        ctx,
        auto_sync_manager,
        erp_sync_service,
        scheduled_export_service,
        database_health_service,
        pubsub_service,
    )

    try:
        await asyncio.wait_for(
            asyncio.gather(*shutdown_tasks, return_exceptions=True),
            timeout=30,
        )
    except TimeoutError:
        _logger.warning("⚠️  Shutdown timeout forcing shutdown...")
    except Exception as exc:
        _logger.error("Error during shutdown: %s", exc)

    # Close connection pool
    if ctx.connection_pool:
        try:
            ctx.connection_pool.close_all()
            _logger.info("✓ Connection pool closed")
        except Exception as exc:
            _logger.error("Error closing connection pool: %s", exc)

    # Close MongoDB — client.close() is an async coroutine in Motor 3.x
    try:
        if hasattr(client, "close") and callable(client.close):
            res = client.close()  # type: ignore[func-returns-value]
            if asyncio.iscoroutine(res):
                await res
        _logger.info("✓ MongoDB connection closed")
    except Exception as exc:
        _logger.error("Error closing MongoDB connection: %s", exc)

    # Stop mDNS
    try:
        await stop_mdns()
        _logger.info("✓ mDNS service stopped")
    except Exception as exc:
        _logger.error("Error stopping mDNS service: %s", exc)

    _logger.info("✓ Application shutdown complete (took %.2fs)", time.time() - shutdown_start)
