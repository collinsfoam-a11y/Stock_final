"""
User Settings Migration Script

Ensures each user has a normalized user settings document.
"""

import asyncio
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.api.user_settings_api import _build_user_settings
from backend.core.schemas.user_settings import UserSettings
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)

DEFAULT_USER_SETTINGS = UserSettings().model_dump()


async def migrate_user_settings(db: AsyncIOMotorDatabase) -> dict:
    """
    Migrate user settings to ensure all users have default settings.

    This migration:
    1. Creates user_settings collection if not exists
    2. For each user without settings, creates default settings document
    3. Logs migration statistics

    Args:
        db: MongoDB database instance

    Returns:
        Migration statistics dict
    """
    stats = {
        "total_users": 0,
        "users_with_settings": 0,
        "users_normalized": 0,
        "users_migrated": 0,
        "errors": 0,
    }

    try:
        # Get all users
        users_collection = db["users"]
        settings_collection = db["user_settings"]

        # Count total users
        stats["total_users"] = await users_collection.count_documents({})

        # Get all user IDs
        users_cursor = users_collection.find({}, {"_id": 1, "username": 1})
        users = await users_cursor.to_list(length=None)

        for user in users:
            user_id = str(user["_id"])
            username = user.get("username", "unknown")

            try:
                # Check if user already has settings
                existing_settings = await settings_collection.find_one({"user_id": user_id})

                if existing_settings:
                    stats["users_with_settings"] += 1
                    normalized_settings = _build_user_settings(existing_settings).model_dump()
                    created_at = existing_settings.get("created_at") or datetime.now(
                        timezone.utc
                    ).replace(tzinfo=None)
                    normalized_doc = {
                        "user_id": user_id,
                        **normalized_settings,
                        "created_at": created_at,
                        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    }

                    await settings_collection.replace_one(
                        {"user_id": user_id},
                        normalized_doc,
                        upsert=True,
                    )
                    stats["users_normalized"] += 1
                    logger.info(f"Normalized settings for user {username}")
                else:
                    # Create default settings for user
                    settings_doc = {
                        "user_id": user_id,
                        **DEFAULT_USER_SETTINGS,
                        "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    }

                    await settings_collection.insert_one(settings_doc)
                    stats["users_migrated"] += 1
                    logger.info(f"Created default settings for user {username}")

            except Exception as e:
                stats["errors"] += 1
                logger.error(f"Failed to migrate settings for user {username}: {e}")

        logger.info(
            f"Migration complete: {stats['users_migrated']} users migrated, "
            f"{stats['users_normalized']} normalized, "
            f"{stats['users_with_settings']} already had settings, "
            f"{stats['errors']} errors"
        )

        return stats

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


async def run_migration():
    """Run the migration as a standalone script."""
    from backend.config import settings
    from backend.db.runtime import lifespan_db

    logging.basicConfig(level=logging.INFO)

    try:
        # Connect to MongoDB
        async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
            db = get_db()

            if db is None:
                logger.error("Failed to get database connection")
                return

            # Run migration
            stats = await migrate_user_settings(db)

            print("\n=== Migration Results ===")
            print(f"Total users: {stats['total_users']}")
            print(f"Already had settings: {stats['users_with_settings']}")
            print(f"Normalized: {stats['users_normalized']}")
            print(f"Migrated: {stats['users_migrated']}")
            print(f"Errors: {stats['errors']}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(run_migration())
