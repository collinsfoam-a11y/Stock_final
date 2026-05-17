"""
Database Health Monitoring Service
Monitors database connections and provides health checks
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.errors import InvalidOperation

if TYPE_CHECKING:
    from backend.sql_server_connector import SQLServerConnector
else:
    # Import SQLServerConnector - will be injected at runtime
    SQLServerConnector = None

logger = logging.getLogger(__name__)


class DatabaseHealthService:
    """
    Service to monitor database health and connection status
    Provides health checks, connection monitoring, and automatic recovery
    """

    def __init__(
        self,
        mongo_db: AsyncIOMotorDatabase,
        sql_connector: "SQLServerConnector",
        check_interval: int = 60,  # Check every 60 seconds
        mongo_uri: Optional[str] = None,
        db_name: Optional[str] = None,
        mongo_client_options: dict[str, Optional[Any]] = None,
    ):
        self.mongo_db = mongo_db
        self.sql_connector = sql_connector
        self.check_interval = check_interval
        self._health_status = {
            "mongo": {
                "status": "unknown",
                "last_check": None,
                "response_time": None,
                "error": None,
            },
            "sql_server": {
                "status": "unknown",
                "last_check": None,
                "response_time": None,
                "error": None,
            },
            "overall": "unknown",
            "uptime_start": datetime.now(timezone.utc),
        }
        self._running = False
        self._task: Optional[asyncio.Task[None]] = None
        self._mongo_uri = mongo_uri
        self._db_name = db_name or getattr(mongo_db, "name", None)
        self._mongo_client_options = mongo_client_options or {}
        self._dedicated_client: Optional[AsyncIOMotorClient] = None

        if self.mongo_db is None and not self._switch_to_dedicated_client():
            raise RuntimeError("Failed to initialize MongoDB connection for health monitoring")

    def _switch_to_dedicated_client(self) -> bool:
        """Initialize a dedicated Mongo client if the shared one is unavailable."""
        if not self._mongo_uri or not self._db_name:
            return False

        try:
            if self._dedicated_client:
                self._dedicated_client.close()
            self._dedicated_client = AsyncIOMotorClient(
                self._mongo_uri,
                **self._mongo_client_options,
            )
            self.mongo_db = self._dedicated_client[self._db_name]
            logger.info("Database health service switched to dedicated MongoDB client")
            return True
        except Exception as e:
            logger.error(f"Failed to create dedicated MongoDB client: {e}")
            return False

    async def check_mongo_health(self, retry: bool = False) -> dict[str, Any]:
        """Check MongoDB connection health"""
        start_time = datetime.now(timezone.utc)
        try:
            # Simple ping operation
            await self.mongo_db.command("ping")
            response_time = (datetime.now(timezone.utc) - start_time).total_seconds()

            self._health_status["mongo"] = {
                "status": "healthy",
                "last_check": datetime.now(timezone.utc).isoformat(),
                "response_time": response_time,
                "error": None,
            }

            logger.debug(f"MongoDB health check: OK ({response_time:.3f}s)")
            return {"status": "healthy", "response_time": response_time}

        except InvalidOperation as e:
            logger.warning(f"MongoDB health check detected closed client: {e}")
            if not retry and self._switch_to_dedicated_client():
                return await self.check_mongo_health(retry=True)

            error_msg = str(e)
            self._health_status["mongo"] = {
                "status": "unhealthy",
                "last_check": datetime.now(timezone.utc).isoformat(),
                "response_time": None,
                "error": error_msg,
            }
            return {"status": "unhealthy", "error": error_msg}

        except Exception as e:
            error_msg = str(e)
            self._health_status["mongo"] = {
                "status": "unhealthy",
                "last_check": datetime.now(timezone.utc).isoformat(),
                "response_time": None,
                "error": error_msg,
            }

            logger.error(f"MongoDB health check failed: {error_msg}")
            return {"status": "unhealthy", "error": error_msg}

    async def check_sql_server_health(self) -> dict[str, Any]:
        """Check SQL Server connection health with MongoDB fallback"""
        start_time = datetime.now(timezone.utc)
        try:
            # Try direct connection first
            is_available = False
            error_detail = None
            if self.sql_connector is not None:
                # Check for credentials before attempting connection
                sql_password = None
                try:
                    from backend.config import settings

                    sql_password = getattr(settings, "SQL_SERVER_PASSWORD", None)
                except Exception:
                    pass

                is_placeholder = isinstance(sql_password, str) and sql_password.strip().lower() in {
                    "",
                    "your-sql-password",
                    "change-me",
                    "password",
                    "changeme",
                    "dev_sql_password_placeholder",
                }

                if is_placeholder:
                    error_detail = "SQL Server password is using a placeholder value"
                    is_available = False
                elif getattr(self.sql_connector, "config", None) is not None:
                    try:
                        is_available = await asyncio.wait_for(
                            asyncio.to_thread(self.sql_connector.test_connection),
                            timeout=3,
                        )
                    except Exception as e:
                        is_available = False
                        error_detail = f"Connection attempt failed: {str(e)}"
                else:
                    error_detail = "SQL Server configuration is missing"
                    is_available = False

            if is_available:
                response_time = (datetime.now(timezone.utc) - start_time).total_seconds()
                status_data = {
                    "status": "healthy",
                    "last_check": datetime.now(timezone.utc).isoformat(),
                    "response_time": response_time,
                    "error": None,
                    "source": "sql_server",
                }
                self._health_status["sql_server"] = status_data
                logger.debug(f"SQL Server health check: OK ({response_time:.3f}s)")
                return status_data

            # Fallback: Check if we have items in MongoDB
            try:
                item_count = await self.mongo_db.erp_items.count_documents({})
                if item_count > 0:
                    response_time = (datetime.now(timezone.utc) - start_time).total_seconds()
                    status_data = {
                        "status": "healthy",
                        "last_check": datetime.now(timezone.utc).isoformat(),
                        "response_time": response_time,
                        "error": error_detail,
                        "note": f"SQL Server offline, using {item_count} cached items",
                        "source": "mongodb_cache",
                    }
                    self._health_status["sql_server"] = status_data
                    logger.info(
                        f"SQL Server health check: OK (Fallback to MongoDB cache with {item_count} items)"
                    )
                    return status_data
            except Exception as e:
                logger.error(f"Fallback health check failed: {e}")

            # If both failed
            error_msg = error_detail or "SQL Server connection failed and no cached items found"
            status_data = {
                "status": "unhealthy",
                "last_check": datetime.now(timezone.utc).isoformat(),
                "response_time": None,
                "error": error_msg,
            }
            self._health_status["sql_server"] = status_data
            return status_data

        except Exception as e:
            error_msg = str(e)
            self._health_status["sql_server"] = {
                "status": "unhealthy",
                "last_check": datetime.now(timezone.utc).isoformat(),
                "response_time": None,
                "error": error_msg,
            }
            logger.error(f"SQL Server health check failed: {error_msg}")
            return {"status": "unhealthy", "error": error_msg}

    async def check_all(self) -> dict[str, Any]:
        """Check health of all databases"""
        mongo_result = await self.check_mongo_health()
        sql_result = await self.check_sql_server_health()

        # Determine overall status
        if mongo_result["status"] == "healthy" and sql_result["status"] == "healthy":
            overall_status = "healthy"
        elif mongo_result["status"] == "unhealthy" and sql_result["status"] == "unhealthy":
            overall_status = "unhealthy"
        else:
            overall_status = "degraded"

        self._health_status["overall"] = overall_status

        return {
            "overall": overall_status,
            "mongo": mongo_result,
            "sql_server": sql_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def _health_check_loop(self):
        """Background health check loop"""
        while self._running:
            try:
                await self.check_all()
            except Exception as e:
                logger.error(f"Health check loop error: {str(e)}")

            await asyncio.sleep(self.check_interval)

    def start(self):
        """Start background health monitoring"""
        if self._running:
            logger.warning("Database health service already running")
            return

        self._running = True
        self._task = asyncio.create_task(self._health_check_loop())
        logger.info(f"Database health monitoring started (interval: {self.check_interval}s)")

    async def stop(self):
        """Stop background health monitoring"""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._dedicated_client:
            try:
                self._dedicated_client.close()
            except Exception:
                pass
        logger.info("Database health monitoring stopped")

    def get_status(self) -> dict[str, Any]:
        """Get current health status"""
        uptime_start = self._health_status["uptime_start"]
        if not isinstance(uptime_start, datetime):
            uptime_start = datetime.now(timezone.utc)
        uptime = (datetime.now(timezone.utc) - uptime_start).total_seconds()

        return {
            **self._health_status,
            "uptime_seconds": uptime,
            "uptime_human": str(timedelta(seconds=int(uptime))),
            "check_interval": self.check_interval,
            "running": self._running,
        }

    async def get_detailed_health(self) -> dict[str, Any]:
        """Get detailed health check with current status"""
        # Perform fresh health checks
        health_check = await self.check_all()

        # Get status
        status = self.get_status()

        # Get database statistics
        mongo_stats = {}
        sql_stats = {}

        try:
            # MongoDB stats
            db_stats = await self.mongo_db.command("dbStats")
            mongo_stats = {
                "collections": db_stats.get("collections", 0),
                "data_size": db_stats.get("dataSize", 0),
                "storage_size": db_stats.get("storageSize", 0),
            }
        except InvalidOperation as e:
            if self._switch_to_dedicated_client():
                try:
                    db_stats = await self.mongo_db.command("dbStats")
                    mongo_stats = {
                        "collections": db_stats.get("collections", 0),
                        "data_size": db_stats.get("dataSize", 0),
                        "storage_size": db_stats.get("storageSize", 0),
                    }
                except Exception as inner:
                    mongo_stats = {"error": str(inner)}
            else:
                mongo_stats = {"error": str(e)}
        except Exception as e:
            mongo_stats = {"error": str(e)}

        try:
            # SQL Server stats (if connected)
            sql_connected = await asyncio.wait_for(
                asyncio.to_thread(self.sql_connector.test_connection),
                timeout=3,
            )
            if sql_connected:
                sql_stats = {
                    "connected": True,
                    "config": self.sql_connector.config,
                }
            else:
                sql_stats = {"connected": False}
        except asyncio.TimeoutError:
            sql_stats = {"connected": False, "error": "Timeout checking SQL Server connection"}
        except Exception as e:
            sql_stats = {"error": str(e)}

        return {
            **health_check,
            "status": status,
            "database_stats": {
                "mongo": mongo_stats,
                "sql_server": sql_stats,
            },
        }
