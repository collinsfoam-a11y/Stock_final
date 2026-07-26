import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from backend.config import settings  # noqa: E402
from backend.services.sql_sync_service import SQLSyncService  # noqa: E402
from backend.sql_server_connector import SQLServerConnector  # noqa: E402

# Setup logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("sync_script")


async def main():
    logger.info("Initializing Sync Script...")

    # Connect to MongoDB
    logger.info(f"Connecting to MongoDB at {settings.MONGO_URL}...")
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]
    try:
        await db.command("ping")
        logger.info("MongoDB Connection Successful.")
    except Exception as e:
        logger.error(f"MongoDB Connection Failed: {e}")
        return

    # Connect to SQL Server
    sql_host = getattr(settings, "SQL_SERVER_HOST", None)
    sql_database = getattr(settings, "SQL_SERVER_DATABASE", None)

    if not sql_host or not sql_database:
        logger.error("SQL Server not configured in settings/env.")
        return

    logger.info(f"Connecting to SQL Server at {sql_host}...")
    sql_connector = SQLServerConnector()
    try:
        sql_connector.connect(
            host=sql_host,
            port=getattr(settings, "SQL_SERVER_PORT", 1433),
            database=sql_database,
            user=getattr(settings, "SQL_SERVER_USER", ""),
            password=getattr(settings, "SQL_SERVER_PASSWORD", ""),
        )
        logger.info("SQL Server Connection Successful.")
    except Exception as e:
        logger.error(f"SQL Server Connection Failed: {e}")
        return

    # Initialize Sync Service
    service = SQLSyncService(sql_connector, db)

    # Run Full Sync
    logger.info("Starting Full Nightly Sync (Fetch all items)...")
    try:
        stats = await service.nightly_full_sync()
        logger.info("Sync Completed!")
        logger.info(f"Stats: {stats}")
    except Exception as e:
        logger.error(f"Sync Failed: {e}")


if __name__ == "__main__":
    asyncio.run(main())
