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
        self.fencing_collection = db["lock_fencing_tokens"]

    async def initialize(self):
        """
        Initialize indexes for the locks collection.
        Should be called on startup.
        """
        # TTL index to automatically expire locks
        await self.collection.create_index("expires_at", expireAfterSeconds=0)
        await self.collection.create_index("fencing_token", unique=True, sparse=True)
        await self.collection.create_index([("_id", 1), ("owner", 1), ("lease_version", 1)])
        await self.fencing_collection.create_index("value")
        logger.info("LockService initialized.")

    async def _next_fencing_token(self, key: str) -> int:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.fencing_collection.update_one(
            {"_id": "global"},
            {
                "$inc": {"value": 1},
                "$setOnInsert": {"created_at": now},
                "$set": {"updated_at": now, "last_lock_key": key},
            },
            upsert=True,
        )
        doc = await self.fencing_collection.find_one({"_id": "global"})
        if not isinstance(doc, dict) or not isinstance(doc.get("value"), int):
            raise LockError("Failed to allocate lock fencing token")
        return int(doc["value"])

    async def acquire_lock(self, key: str, owner: str, ttl_seconds: int = DEFAULT_LOCK_TTL) -> bool:
        """
        Acquire a lock for a given key.
        Raises ResourceLockedError if lock is already held by another owner.
        """
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            seconds=ttl_seconds
        )
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        fencing_token = await self._next_fencing_token(key)

        try:
            # Try to insert lock
            # We use _id=key to ensure uniqueness at the database level
            await self.collection.insert_one(
                {
                    "_id": key,
                    "owner": owner,
                    "created_at": now,
                    "expires_at": expires_at,
                    "fencing_token": fencing_token,
                    "lease_version": 1,
                    "renewed_at": now,
                }
            )
            logger.debug(f"Lock acquired: {key} by {owner}")
            return True

        except DuplicateKeyError:
            # Lock exists. Check if it's expired (in case TTL monitor hasn't run yet)
            # or if we own it (re-entrant? No, we enforce simple locking for now)

            existing_lock = await self.collection.find_one({"_id": key})

            if existing_lock:
                # Check for explicit expiration logic just in case
                if existing_lock["expires_at"] < now:
                    # Atomically claim the expired lock. This avoids the
                    # delete-then-insert race where two workers can both see an
                    # expired lock and both believe they acquired it.
                    result = await self.collection.update_one(
                        {
                            "_id": key,
                            "expires_at": existing_lock["expires_at"],
                            "fencing_token": existing_lock.get("fencing_token"),
                        },
                        {
                            "$set": {
                                "owner": owner,
                                "expires_at": expires_at,
                                "renewed_at": now,
                                "fencing_token": fencing_token,
                            },
                            "$inc": {"lease_version": 1},
                        },
                    )
                    if getattr(result, "matched_count", 0) > 0:
                        logger.debug(f"Expired lock reacquired: {key} by {owner}")
                        return True

                if existing_lock.get("owner") == owner:
                    # Same owner renews the lease to protect long-running workflows.
                    await self.collection.update_one(
                        {"_id": key, "owner": owner},
                        {
                            "$set": {
                                "expires_at": expires_at,
                                "renewed_at": now,
                            },
                            "$inc": {"lease_version": 1},
                        },
                    )
                    return True

            logger.warning(
                f"Failed to acquire lock: {key} is held by {existing_lock.get('owner') if existing_lock else 'unknown'}"
            )
            raise ResourceLockedError(f"Resource {key} is currently locked.")

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

    async def get_lock_state(self, key: str) -> dict | None:
        return await self.collection.find_one({"_id": key})

    async def validate_lock_owner(
        self,
        key: str,
        owner: str,
        *,
        fencing_token: int | None = None,
        lease_version: int | None = None,
    ) -> bool:
        query: dict = {
            "_id": key,
            "owner": owner,
            "expires_at": {"$gt": datetime.now(timezone.utc).replace(tzinfo=None)},
        }
        if fencing_token is not None:
            query["fencing_token"] = int(fencing_token)
        if lease_version is not None:
            query["lease_version"] = int(lease_version)
        return await self.collection.find_one(query) is not None

    # ------------------------------------------------------------------
    # Item-level and approval-level convenience helpers
    # ------------------------------------------------------------------

    def _item_lock_key(self, session_id: str, item_code: str) -> str:
        return f"item:{session_id}:{item_code}"

    def _approval_lock_key(self, count_line_id: str) -> str:
        return f"approval:{count_line_id}"

    async def lock_item(
        self,
        session_id: str,
        item_code: str,
        owner: str,
        ttl_seconds: int = DEFAULT_LOCK_TTL,
    ) -> bool:
        """Prevent two staff members from counting the same item simultaneously."""
        return await self.acquire_lock(
            self._item_lock_key(session_id, item_code), owner, ttl_seconds
        )

    async def unlock_item(self, session_id: str, item_code: str, owner: str) -> None:
        await self.release_lock(self._item_lock_key(session_id, item_code), owner)

    async def lock_count_line_approval(
        self,
        count_line_id: str,
        approver: str,
        ttl_seconds: int = 120,
    ) -> bool:
        """Prevent concurrent approval/rejection of the same count line."""
        return await self.acquire_lock(
            self._approval_lock_key(count_line_id), approver, ttl_seconds
        )

    async def unlock_count_line_approval(self, count_line_id: str, approver: str) -> None:
        await self.release_lock(self._approval_lock_key(count_line_id), approver)
