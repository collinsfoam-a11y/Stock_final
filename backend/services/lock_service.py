"""
Lock Service for handling atomic operations and preventing race conditions.
Uses MongoDB 'locks' collection with TTL indexes.
"""

import logging
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError
from motor.motor_asyncio import AsyncIOMotorDatabase

# Default lock TTL in seconds
DEFAULT_LOCK_TTL = 30

logger = logging.getLogger(__name__)


class LockError(Exception):
    """Base exception for lock related errors."""

    pass


class ResourceLockedError(LockError):
    """Raised when attempting to acquire a lock that is already held."""

    pass


class LockService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.locks

    async def initialize(self):
        """
        Initialize indexes for the locks collection.
        Should be called on startup.
        """
        # TTL index to automatically expire locks
        await self.collection.create_index("expires_at", expireAfterSeconds=0)
        logger.info("LockService initialized.")

    async def acquire_lock(self, key: str, owner: str, ttl_seconds: int = DEFAULT_LOCK_TTL) -> bool:
        """
        Acquire a lock for a given key.
        Raises ResourceLockedError if lock is already held by another owner.
        """
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            seconds=ttl_seconds
        )

        try:
            # Try to insert lock
            # We use _id=key to ensure uniqueness at the database level
            await self.collection.insert_one(
                {
                    "_id": key,
                    "owner": owner,
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                    "expires_at": expires_at,
                }
            )
            logger.debug(f"Lock acquired: {key} by {owner}")
            return True

        except DuplicateKeyError as exc:
            # Lock exists. Check if it's expired (in case TTL monitor hasn't run yet)
            # or if we own it (re-entrant? No, we enforce simple locking for now)

            existing_lock = await self.collection.find_one({"_id": key})

            if existing_lock:
                if existing_lock.get("owner") == owner:
                    # We already own it, extend lease?
                    # For this use case, we treat it as valid.
                    return True

                # Check for explicit expiration logic just in case
                if existing_lock["expires_at"] < datetime.now(timezone.utc).replace(tzinfo=None):
                    # It's stale, delete it and retry the insert once. A caller
                    # that correctly detected and cleared a stale lock should
                    # not be rejected for a lock that no longer exists.
                    await self.collection.delete_one(
                        {"_id": key, "expires_at": existing_lock["expires_at"]}
                    )
                    try:
                        await self.collection.insert_one(
                            {
                                "_id": key,
                                "owner": owner,
                                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                                "expires_at": expires_at,
                            }
                        )
                        logger.debug(f"Lock acquired: {key} by {owner} (after clearing stale lock)")
                        return True
                    except DuplicateKeyError:
                        # Someone else raced in immediately after we cleared it.
                        existing_lock = await self.collection.find_one({"_id": key})

            logger.warning(
                f"Failed to acquire lock: {key} is held by {existing_lock.get('owner') if existing_lock else 'unknown'}"
            )
            raise ResourceLockedError(f"Resource {key} is currently locked.") from exc

    async def release_lock(self, key: str, owner: str):
        """
        Release a lock. safely ensuring we only release our own locks.
        """
        result = await self.collection.delete_one({"_id": key, "owner": owner})

        if result.deleted_count > 0:
            logger.debug(f"Lock released: {key} by {owner}")
        else:
            logger.warning(
                f"Attempted to release lock {key} owned by {owner}, but it was not found or owned by someone else."
            )
