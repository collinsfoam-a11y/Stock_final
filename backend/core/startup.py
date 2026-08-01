import asyncio
import logging
import os

from backend.config import settings

logger = logging.getLogger("stock-verify")

class StartupContext:
    """Holds state across startup and shutdown tasks"""
    def __init__(self):
        self.background_tasks: set[asyncio.Task] = set()
        self.connection_pool = None

    def spawn_background(self, coro, name: str) -> asyncio.Task:
        task = asyncio.create_task(coro, name=name)
        self.background_tasks.add(task)
        task.add_done_callback(self.background_tasks.discard)
        return task

async def init_redis_services():
    from backend.services.redis_service import init_redis
    from backend.services.pubsub_service import get_pubsub_service
    from backend.services.lock_manager import get_lock_manager
    try:
        logger.info("📦 Phase 1: Initializing Redis services...")
        redis_service = await init_redis()
        logger.info("✓ Redis service initialized")

        pubsub_service = get_pubsub_service(redis_service)
        await pubsub_service.start()

        get_lock_manager(redis_service)
        logger.info("✓ Lock manager initialized")
        return redis_service, pubsub_service
    except Exception as e:
        logger.warning("⚠️ Redis services not available: %s", str(e))
        logger.warning("Multi-user locking and real-time updates will be disabled")
        return None, None

async def init_mdns_service():
    from backend.services.mdns_service import start_mdns
    try:
        logger.info("🌐 Starting mDNS service...")
        mdns_port = int(os.getenv("PORT", getattr(settings, "PORT", 8001)))
        await start_mdns(port=mdns_port)
        logger.info("✓ mDNS service started (stock-verify.local on port %s)", mdns_port)
    except Exception as e:
        logger.warning("⚠️ mDNS service failed to start: %s", str(e))

async def init_sql_server(sql_connector, count_lines_router):
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
            "", "your-sql-password", "change-me", "password", "changeme", "your-actual-sql-password",
        }
        sql_credentials_ready = (not sql_user) or bool(sql_password and not sql_password_placeholder)

        try:
            count_lines_router.sql_connector = sql_connector
            logger.info("✓ SQL connector attached to count_lines_router")
        except Exception as e:
            logger.warning("Failed to attach SQL connector to count_lines_router: %s", str(e))

        if sql_host and sql_database and sql_credentials_ready:
            logger.info(f"Attempting to connect to SQL Server at {sql_host}:{sql_port}/{sql_database}...")
            try:
                startup_sql_timeout = getattr(settings, "SQL_STARTUP_CONNECT_TIMEOUT", 5)
                await asyncio.wait_for(
                    asyncio.to_thread(
                        sql_connector.connect,
                        sql_host, sql_port, sql_database, sql_user, sql_password,
                    ),
                    timeout=startup_sql_timeout,
                )
                logger.info("OK: SQL Server connection established")
            except asyncio.TimeoutError:
                logger.warning("SQL Server connection timed out during startup")
                logger.warning("ERP sync will be disabled until SQL Server is available")
            except (ConnectionError, OSError) as e:
                logger.warning("SQL Server connection failed (network/system error): %s", str(e))
                logger.warning("ERP sync will be disabled until SQL Server is configured")
            except Exception as e:
                logger.warning("SQL Server connection failed: %s", str(e))
                logger.warning("ERP sync will be disabled until SQL Server is configured")
        elif sql_host and sql_database:
            logger.warning("SQL Server credentials not configured. Set SQL_SERVER_USER and SQL_SERVER_PASSWORD (or use Windows auth).")
        else:
            logger.warning("SQL Server credentials not configured. Set SQL_SERVER_HOST and SQL_SERVER_DATABASE in .env")
    except Exception as e:
        logger.warning("Unexpected error initializing SQL Server connection: %s", str(e))
    return sql_credentials_ready

async def init_connection_pool(ctx: StartupContext):
    try:
        from backend.services.enhanced_connection_pool import EnhancedSQLServerConnectionPool
        ctx.connection_pool = await asyncio.to_thread(
            EnhancedSQLServerConnectionPool,
            host=str(settings.SQL_SERVER_HOST or "localhost"),
            port=settings.SQL_SERVER_PORT,
            database=str(settings.SQL_SERVER_DATABASE or "StockDB"),
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

async def verify_mongodb(db):
    try:
        await db.command("ping")
        logger.info("✅ MongoDB connection verified - MongoDB is required and available")
    except Exception as e:
        error_type = type(e).__name__
        logger.error("❌ MongoDB is required but unavailable (%s): %s", error_type, e)
        if os.getenv("ENVIRONMENT", "development").lower() in ["development", "dev"]:
            logger.warning("⚠️ Running in DEVELOPMENT mode without MongoDB - some features may be limited")
        else:
            logger.error("Application cannot start without MongoDB. Please ensure MongoDB is running.")
            raise SystemExit(f"MongoDB is required but unavailable ({error_type}). Please start MongoDB and try again.") from e

async def run_migrations(migration_manager):
    from backend.exceptions import StockVerifyException as DatabaseError
    try:
        await migration_manager.ensure_indexes()
        await migration_manager.run_migrations()
        logger.info("OK: Migrations completed")
    except DatabaseError as e:
        logger.warning(f"Database error during migrations (may be due to MongoDB unavailability): {str(e)}")
    except Exception as e:
        logger.warning("Migration error (may be due to MongoDB unavailability): %s", str(e))

async def init_auto_sync(auto_sync_manager, sql_connector, db, ctx: StartupContext):
    try:
        auto_sync_enabled = bool(getattr(settings, "AUTO_SYNC_ENABLED", False))
        if auto_sync_enabled and auto_sync_manager:
            async def on_connection_restored():
                logger.info("📢 SQL Server connection restored - sync will start automatically")
            async def on_connection_lost():
                logger.warning("📢 SQL Server connection lost - sync paused")
            async def on_sync_complete():
                logger.info("📢 Sync completed successfully")

            auto_sync_manager.set_callbacks(
                on_connection_restored=on_connection_restored,
                on_connection_lost=on_connection_lost,
                on_sync_complete=on_sync_complete,
            )

            ctx.spawn_background(auto_sync_manager.start(), "auto-sync-manager-start")
            logger.info("✅ Auto-sync manager starting (background)")
        else:
            logger.info("Auto-sync manager disabled")
    except Exception as e:
        logger.warning("Auto-sync manager initialization failed: %s", str(e))

async def start_sync_services(erp_sync_service, change_detection_sync):
    if erp_sync_service:
        try:
            await erp_sync_service.start()
            logger.info("✓ ERP sync service started")
        except Exception as e:
            logger.error("Failed to start ERP sync service: %s", str(e))

    if change_detection_sync:
        try:
            await change_detection_sync.start()
        except Exception as e:
            logger.error("Failed to start change detection sync service: %s", str(e))


def save_port_info(project_root):
    from backend.utils.port_detector import PortDetector, save_backend_info
    try:
        port_str = os.getenv("PORT", str(getattr(settings, "PORT", 8001)))
        port = int(port_str)
    except Exception:
        port = 8001

    try:
        local_ip = PortDetector.get_local_ip()
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

async def stop_services(ctx: StartupContext, auto_sync_manager, erp_sync_service, scheduled_export_service, database_health_service, pubsub_service):
    shutdown_tasks = []

    if erp_sync_service is not None:
        async def stop_erp_sync():
            try:
                await erp_sync_service.stop()
                logger.info("✓ ERP sync service stopped")
            except Exception as e:
                logger.error("Error stopping ERP sync service: %s", str(e))
        shutdown_tasks.append(stop_erp_sync())

    if scheduled_export_service:
        async def stop_export_service():
            try:
                await scheduled_export_service.stop()
                logger.info("✓ Scheduled export service stopped")
            except Exception as e:
                logger.error("Error stopping scheduled export service: %s", str(e))
        shutdown_tasks.append(stop_export_service())

    if database_health_service:
        async def stop_health_monitoring():
            try:
                await database_health_service.stop()
                logger.info("✓ Database health monitoring stopped")
            except Exception as e:
                logger.error("Error stopping database health monitoring: %s", str(e))
        shutdown_tasks.append(stop_health_monitoring())

    if auto_sync_manager:
        async def stop_auto_sync():
            try:
                await auto_sync_manager.stop()
                logger.info("✅ Auto-sync manager stopped")
            except Exception as e:
                logger.error("Error stopping auto-sync manager: %s", e)
        shutdown_tasks.append(stop_auto_sync())

    async def stop_redis_services():
        try:
            if pubsub_service:
                await pubsub_service.stop()
                logger.info("✓ Pub/Sub service stopped")
            from backend.services.redis_service import close_redis
            await close_redis()
            logger.info("✓ Redis connection closed")
        except Exception as e:
            logger.error("Error stopping Redis services: %s", str(e))
    shutdown_tasks.append(stop_redis_services())

    return shutdown_tasks
