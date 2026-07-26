"""
Optimize Session Indexes Script
Adds specific indexes to resolve "First Session Creation" delay
"""

import asyncio
import logging
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Specific indexes for session creation optimization
_OPTIMAL_INDEXES = {
    "sessions": [
        # Optimized for open_sessions_count query
        [("staff_user", 1), ("status", 1)],
        # Optimized for general session listing
        [("started_at", -1)],
    ],
    "verification_sessions": [
        # Optimized for session details
        [("session_id", 1)],
        # Optimized for active sessions list
        [("status", 1)],
        [("user_id", 1)],
    ],
    "users": [
        [("username", 1)],
    ],
}


async def optimize_indexes():
    """Add session optimization indexes"""
    MONGO_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DB_NAME = os.getenv("MONGODB_DB_NAME", "stock_verify")

    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    try:
        await db.command("ping")
        logger.info("✓ Database connection successful")
        logger.info("Starting Session Index Optimization...")

        for collection_name, indexes in _OPTIMAL_INDEXES.items():
            collection = db[collection_name]
            logger.info(f"Indexing {collection_name}...")

            for index_spec in indexes:
                try:
                    # Create index
                    await collection.create_index(index_spec)
                    logger.info(f"  ✓ Created index: {index_spec}")
                except Exception as e:
                    logger.warning(f"  Warning: {e}")

        logger.info("\n✅ Session Indexes Optimized!")

    except Exception as e:
        logger.error(f"Error: {str(e)}")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(optimize_indexes())
