import re

with open("backend/core/lifespan.py", "r") as f:
    content = f.read()

# Find where lifespan starts
match = re.search(r'@asynccontextmanager\nasync def lifespan\(app: FastAPI\):', content)
start_idx = match.start()

new_lifespan = """@asynccontextmanager
async def lifespan(app: FastAPI):
    from backend.core.startup import (
        StartupContext, init_redis_services, init_mdns_service,
        init_sql_server, init_connection_pool, verify_mongodb,
        run_migrations, init_auto_sync, start_sync_services,
        save_port_info, stop_services
    )

    logger.info("🚀 Starting StockVerify application...")
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
    global auto_sync_manager
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
        global sync_conflicts_service
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
    
    global scheduled_export_service
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
"""

new_content = content[:start_idx] + new_lifespan

with open("backend/core/lifespan.py", "w") as f:
    f.write(new_content)
