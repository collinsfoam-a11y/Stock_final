"""
Lock Manager - Redis-based distributed locking
Implements rack locking, session management, and concurrency control
"""

import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from backend.services.redis_service import RedisService

logger = logging.getLogger(__name__)


class LockManager:
    """
    Distributed lock manager using Redis
    Supports rack locks, session locks, and user presence tracking
    """

    def __init__(self, redis_service: RedisService):
        self.redis = redis_service

    # Rack Locking

    async def acquire_rack_lock(self, rack_id: str, user_id: str, ttl: int = 60) -> bool:
        """
        Acquire exclusive lock on a rack

        Args:
            rack_id: Rack identifier
            user_id: User claiming the rack
            ttl: Lock time-to-live in seconds (default: 60)

        Returns:
            True if lock acquired, False if already locked
        """
        lock_key = f"rack:lock:{rack_id}"

        try:
            # SETNX with expiration
            acquired = await self.redis.set(lock_key, user_id, ex=ttl, nx=True)

            if acquired:
                logger.info(f"✓ Rack lock acquired: {rack_id} by {user_id} (TTL: {ttl}s)")
                return True
            else:
                current_owner = await self.redis.get(lock_key)
                logger.warning(f"✗ Rack lock failed: {rack_id} already locked by {current_owner}")
                return False

        except Exception as e:
            logger.error(f"Error acquiring rack lock {rack_id}: {str(e)}")
            return False

    # Lua script for atomic compare-and-delete (C4 fix)
    _RELEASE_SCRIPT = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
    """

    # Lua script for atomic compare-and-expire (C5 fix)
    _RENEW_SCRIPT = """
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], tonumber(ARGV[2]))
    else
        return 0
    end
    """

    async def release_rack_lock(self, rack_id: str, user_id: str) -> bool:
        """
        Release rack lock atomically (only if owned by user).
        Uses Lua script to prevent TOCTOU race condition.

        Args:
            rack_id: Rack identifier
            user_id: User releasing the rack

        Returns:
            True if lock released, False if not owned or error
        """
        lock_key = f"rack:lock:{rack_id}"

        try:
            # C4 fix: Atomic compare-and-delete via Lua script
            result = await self.redis.eval(self._RELEASE_SCRIPT, 1, lock_key, user_id)

            if result:
                logger.info(f"Rack lock released: {rack_id} by {user_id}")
                return True
            else:
                current_owner = await self.redis.get(lock_key)
                logger.warning(
                    f"Cannot release rack {rack_id}: owned by {current_owner}, not {user_id}"
                )
                return False

        except Exception as e:
            logger.error(f"Error releasing rack lock {rack_id}: {str(e)}")
            return False

    async def renew_rack_lock(self, rack_id: str, user_id: str, ttl: int = 60) -> bool:
        """
        Renew/extend rack lock atomically (heartbeat).
        Uses Lua script to prevent TOCTOU race condition.

        Args:
            rack_id: Rack identifier
            user_id: User renewing the lock
            ttl: New TTL in seconds

        Returns:
            True if renewed, False if not owned or error
        """
        lock_key = f"rack:lock:{rack_id}"

        try:
            # C5 fix: Atomic compare-and-expire via Lua script
            result = await self.redis.eval(self._RENEW_SCRIPT, 1, lock_key, user_id, str(ttl))

            if result:
                logger.debug(f"Rack lock renewed: {rack_id} by {user_id} (TTL: {ttl}s)")
                return True
            else:
                current_owner = await self.redis.get(lock_key)
                logger.warning(
                    f"Cannot renew rack {rack_id}: owned by {current_owner}, not {user_id}"
                )
                return False

        except Exception as e:
            logger.error(f"Error renewing rack lock {rack_id}: {str(e)}")
            return False

    async def get_rack_lock_owner(self, rack_id: str) -> Optional[str]:
        """Get current owner of rack lock"""
        lock_key = f"rack:lock:{rack_id}"
        return await self.redis.get(lock_key)

    async def get_rack_lock_ttl(self, rack_id: str) -> int:
        """Get remaining TTL of rack lock (-1 if no expiry, -2 if doesn't exist)"""
        lock_key = f"rack:lock:{rack_id}"
        return await self.redis.ttl(lock_key)

    async def is_rack_lock_owned_by(self, rack_id: str, user_id: str) -> bool:
        lock_key = f"rack:lock:{rack_id}"
        owner = await self.redis.get(lock_key)
        return bool(owner) and owner == user_id

    async def is_rack_locked(self, rack_id: str) -> bool:
        """Check if rack is currently locked"""
        lock_key = f"rack:lock:{rack_id}"
        return await self.redis.exists(lock_key) > 0

    # User Presence / Heartbeat

    async def update_user_heartbeat(self, user_id: str, ttl: int = 90) -> None:
        """
        Update user heartbeat timestamp

        Args:
            user_id: User identifier
            ttl: Heartbeat TTL in seconds (default: 90)
        """
        heartbeat_key = f"user:heartbeat:{user_id}"
        timestamp = int(time.time())

        await self.redis.set(heartbeat_key, timestamp, ex=ttl)
        logger.debug(f"Heartbeat updated: {user_id}")

    async def get_user_heartbeat(self, user_id: str) -> Optional[int]:
        """Get user's last heartbeat timestamp"""
        heartbeat_key = f"user:heartbeat:{user_id}"
        value = await self.redis.get(heartbeat_key)
        return int(value) if value else None

    async def is_user_active(self, user_id: str) -> bool:
        """Check if user is currently active (heartbeat exists)"""
        heartbeat_key = f"user:heartbeat:{user_id}"
        return await self.redis.exists(heartbeat_key) > 0

    async def get_active_users(self) -> list[str]:
        """Get list of all active users"""
        pattern = "user:heartbeat:*"
        keys = []

        # Scan for heartbeat keys
        cursor = 0
        while True:
            cursor, batch = await self.redis.client.scan(cursor, match=pattern, count=100)
            keys.extend(batch)
            if cursor == 0:
                break

        # Extract user IDs
        user_ids = [key.replace("user:heartbeat:", "") for key in keys]
        return user_ids

    # Session Management

    async def create_session_lock(
        self, session_id: str, user_id: str, rack_id: str, ttl: int = 3600
    ) -> bool:
        """
        Create session lock with metadata

        Args:
            session_id: Session identifier
            user_id: User ID
            rack_id: Rack ID
            ttl: Session TTL (default: 1 hour)
        """
        session_key = f"session:lock:{session_id}"

        session_data = {
            "user_id": user_id,
            "rack_id": rack_id,
            "created_at": int(time.time()),
        }

        try:
            # H10+MM8 fix: Use Lua script for atomic HSET + EXPIRE with NX guard.
            # TTL is passed via KEYS[2] (a dedicated slot) to avoid mixing with field args.
            lua_script = """
            if redis.call("exists", KEYS[1]) == 1 then
                return 0
            end
            for i = 1, #ARGV, 2 do
                redis.call("hset", KEYS[1], ARGV[i], ARGV[i+1])
            end
            redis.call("expire", KEYS[1], tonumber(KEYS[2]))
            return 1
            """
            args = []
            for field, value in session_data.items():
                args.extend([field, str(value)])
            result = await self.redis.eval(lua_script, 2, session_key, str(ttl), *args)

            if result:
                logger.info(f"Session lock created: {session_id} for {user_id} on {rack_id}")
            else:
                logger.warning(f"Session lock already exists for {session_id}")
            return bool(result)

        except Exception as e:
            logger.error(f"Error creating session {session_id}: {str(e)}")
            return False

    async def get_session_data(self, session_id: str) -> Optional[dict]:
        """Get session metadata"""
        session_key = f"session:lock:{session_id}"
        data = await self.redis.hgetall(session_key)
        return data if data else None

    async def delete_session(self, session_id: str) -> bool:
        """Delete session lock"""
        session_key = f"session:lock:{session_id}"
        deleted = await self.redis.delete(session_key)
        return deleted > 0

    # Context Manager for Automatic Lock Management

    @asynccontextmanager
    async def rack_lock(self, rack_id: str, user_id: str, ttl: int = 60):
        """
        Context manager for automatic rack lock acquisition and release

        Usage:
            async with lock_manager.rack_lock("R1", "user123"):
                # Do work with rack
                pass
        """
        acquired = await self.acquire_rack_lock(rack_id, user_id, ttl)

        if not acquired:
            raise RuntimeError(f"Failed to acquire lock on rack {rack_id}")

        try:
            yield
        finally:
            await self.release_rack_lock(rack_id, user_id)

    # Cleanup utilities

    async def cleanup_expired_locks(self) -> int:
        """
        Cleanup expired locks (Redis handles this automatically via TTL)
        This is mainly for logging/monitoring
        """
        # Get all lock keys
        lock_pattern = "rack:lock:*"
        keys = []

        cursor = 0
        while True:
            cursor, batch = await self.redis.client.scan(cursor, match=lock_pattern, count=100)
            keys.extend(batch)
            if cursor == 0:
                break

        logger.info(f"Active rack locks: {len(keys)}")
        return len(keys)

    async def force_release_all_user_locks(self, user_id: str) -> int:
        """
        Force release all locks owned by a user
        Use with caution - for admin/cleanup purposes only
        """
        released = 0
        lock_pattern = "rack:lock:*"

        cursor = 0
        while True:
            cursor, batch = await self.redis.client.scan(cursor, match=lock_pattern, count=100)

            for lock_key in batch:
                result = await self.redis.eval(self._RELEASE_SCRIPT, 1, lock_key, user_id)
                if result:
                    released += 1
                    logger.warning(f"Force released lock: {lock_key} owned by {user_id}")

            if cursor == 0:
                break

        return released


# Global instance (initialized with redis_service)
_lock_manager: Optional[LockManager] = None


def get_lock_manager(redis_service):
    """Get or create lock manager instance"""
    global _lock_manager
    if _lock_manager is None:
        _lock_manager = LockManager(redis_service)
    return _lock_manager
