"""
Config Version Service - Handles versioning and history for configurations
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class ConfigVersionService:
    """
    Service to manage version history for system configurations (Rule G-06).
    Ensures every change to critical configs is tracked and reversible.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.history_collection = db.config_version_history

    async def create_version(
        self,
        config_type: str,
        config_id: str,
        data: Dict[str, Any],
        changed_by: str,
        change_type: str = "UPDATE",
        notes: Optional[str] = None,
    ) -> str:
        """
        Create a new history version of a configuration.
        """
        try:
            # Find current version number
            latest_version = await self.history_collection.find_one(
                {"config_type": config_type, "config_id": config_id}, sort=[("version", -1)]
            )

            next_version = (latest_version["version"] + 1) if latest_version else 1

            history_entry = {
                "config_type": config_type,
                "config_id": config_id,
                "version": next_version,
                "data": data,
                "changed_by": changed_by,
                "changed_at": datetime.now(timezone.utc),
                "change_type": change_type,
                "notes": notes,
            }

            result = await self.history_collection.insert_one(history_entry)
            logger.info(f"Created version {next_version} for {config_type}:{config_id}")
            return str(result.inserted_id)

        except Exception as e:
            logger.error(f"Failed to create config version: {e}")
            return ""

    async def get_history(self, config_type: str, config_id: str) -> list[Dict[str, Any]]:
        """Get full history for a configuration"""
        cursor = self.history_collection.find(
            {"config_type": config_type, "config_id": config_id}
        ).sort("version", -1)

        history = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])
            history.append(doc)
        return history
