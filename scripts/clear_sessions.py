import asyncio
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.runtime import lifespan_db
from backend.config import settings


async def clear_sessions():
    """Clear all active sessions/refresh tokens for admin user."""
    print("Connecting to database...")
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME) as (client, db):
        print("Connected.")

        # Check count first
        count = await db.refresh_tokens.count_documents({"username": "admin"})
        print(f"Found {count} refresh tokens for user 'admin' before clearing.")

        # Clear refresh tokens for 'admin'
        result = await db.refresh_tokens.delete_many({"username": "admin"})
        print(f"Cleared {result.deleted_count} refresh tokens for user 'admin'.")

        # Clear specific session flags if any (legacy check)
        # Auth check relies on refresh_tokens collection.


if __name__ == "__main__":
    asyncio.run(clear_sessions())
