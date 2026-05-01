"""SQL health checks kept behind the service boundary."""

from __future__ import annotations

import asyncio
import logging

from backend.services.dependency_manager import DependencyManager, DependencyUnavailable
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)


async def check_sql_server_connection_status() -> str:
    if not DependencyManager.has_sql():
        return "unavailable"

    try:
        from backend.sql_server_connector import SQLServerConnector

        connector = SQLServerConnector()
        connected = await asyncio.to_thread(connector.test_connection)
        return "connected" if connected else "disconnected"
    except (DependencyUnavailable, RuntimeError, OSError, TypeError, ValueError) as exc:
        logger.error("SQL Server connection error: %s", sanitize_for_logging(str(exc)))
        return "disconnected"
