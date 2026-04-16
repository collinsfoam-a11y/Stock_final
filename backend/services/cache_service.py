"""
Cache Service - Redis-based caching for performance
Falls back to in-memory cache if Redis unavailable
"""

import asyncio
import json
import logging
import time
from collections.abc import Awaitable
from collections.abc import Callable
from datetime import datetime
from typing import Any, Optional, cast

from bson import ObjectId

logger = logging.getLogger(__name__)


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


# Try to import Redis with async support, fallback to in-memory if not available
try:
    import redis.asyncio as redis

    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class CacheService:
    """
    Cache service with Redis backend and in-memory fallback
    Thread-safe and async-safe for concurrent access
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_ttl: int = 3600,  # 1 hour default
        max_memory_size: int = 100,  # Max items in memory cache
        socket_timeout: float = 5.0,
    ):
        self.redis_url = redis_url
        self.default_ttl = default_ttl
        self.max_memory_size = max_memory_size
        self.socket_timeout = socket_timeout
        self._memory_cache: dict[str, tuple] = {}
        self._lock = asyncio.Lock()  # Use asyncio.Lock for async safety

        # Try Redis connection
        if REDIS_AVAILABLE and redis_url:
            try:
                self.redis_client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_timeout=socket_timeout,
                    socket_connect_timeout=socket_timeout,
                )
                self.use_redis = True
                logger.info("Redis client created (pending connection verification)")
            except Exception as e:
                logger.warning(f"Redis client creation failed, using in-memory cache: {str(e)}")
                self.use_redis = False
        else:
            self.use_redis = False
            logger.debug("Using in-memory cache")

    async def initialize(self):
        """Initialize Redis connection"""
        if self.use_redis and self.redis_client:
            try:
                await asyncio.wait_for(self.redis_client.ping(), timeout=self.socket_timeout)
                logger.info("Redis connection verified")
            except asyncio.TimeoutError:
                logger.warning("Redis connection timed out, using in-memory cache")
                self.use_redis = False
            except Exception as e:
                logger.warning(f"Redis connection failed: {str(e)}")
                self.use_redis = False

    def _get_key(self, prefix: str, key: str) -> str:
        """Generate cache key"""
        return f"{prefix}:{key}"

    async def get(self, prefix: str, key: str) -> Optional[Any]:
        """Get value from cache"""
        cache_key = self._get_key(prefix, key)

        if self.use_redis:
            try:
                value = await self.redis_client.get(cache_key)
                if value:
                    return json.loads(value)
            except Exception as e:
                logger.error(f"Redis get error: {str(e)}")
                return None
        else:
            # In-memory cache
            # No lock needed for simple dict access in async (single threaded event loop)
            # But we check expiry
            if cache_key in self._memory_cache:
                value, expiry = self._memory_cache[cache_key]
                if expiry > time.time():
                    return json.loads(value)
                else:
                    # Expired, remove it
                    del self._memory_cache[cache_key]

        return None

    async def set(self, prefix: str, key: str, value: Any, ttl: Optional[int] = None) -> bool:
        """Set value in cache"""
        cache_key = self._get_key(prefix, key)
        ttl = ttl or self.default_ttl

        try:
            serialized = json.dumps(value, cls=CustomJSONEncoder)
        except (TypeError, ValueError) as e:
            logger.error(f"Failed to serialize value: {str(e)}")
            return False

        if self.use_redis:
            try:
                await self.redis_client.setex(cache_key, ttl, serialized)
                return True
            except Exception as e:
                logger.error(f"Redis set error: {str(e)}")
                return False
        else:
            # In-memory cache
            # Evict if cache too large
            if len(self._memory_cache) >= self.max_memory_size:
                # Remove oldest entries
                sorted_items = sorted(
                    self._memory_cache.items(),
                    key=lambda x: x[1][1],  # Sort by expiry
                )
                # Remove 20% of oldest items
                remove_count = max(1, len(sorted_items) // 5)
                for k, _ in sorted_items[:remove_count]:
                    del self._memory_cache[k]

            expiry = time.time() + ttl
            self._memory_cache[cache_key] = (serialized, expiry)
            return True

    async def delete(self, prefix: str, key: str) -> bool:
        """Delete value from cache"""
        cache_key = self._get_key(prefix, key)

        if self.use_redis:
            try:
                count = await self.redis_client.delete(cache_key)
                return count > 0
            except Exception as e:
                logger.error(f"Redis delete error: {str(e)}")
                return False
        else:
            if cache_key in self._memory_cache:
                del self._memory_cache[cache_key]
                return True

        return False

    async def clear_prefix(self, prefix: str) -> int:
        """Clear all keys with prefix"""
        if self.use_redis:
            try:
                pattern = f"{prefix}:*"
                keys = []
                async for key in self.redis_client.scan_iter(match=pattern):
                    keys.append(key)

                if keys:
                    count = await self.redis_client.delete(*keys)
                    return int(count)
            except Exception as e:
                logger.error(f"Redis clear error: {str(e)}")
        else:
            # In-memory clear
            keys_to_delete = [k for k in self._memory_cache.keys() if k.startswith(f"{prefix}:")]
            for k in keys_to_delete:
                del self._memory_cache[k]
            return len(keys_to_delete)
        return 0

    async def get_status(self) -> dict[str, Any]:
        """Get cache status for health check"""
        status: dict[str, Any] = {
            "type": "redis" if self.use_redis else "memory",
            "status": "healthy",
            "details": {},
        }

        if self.use_redis:
            try:
                # Basic ping check
                start_time = time.time()
                await asyncio.wait_for(cast(Awaitable[bool], self.redis_client.ping()), timeout=2.0)
                latency = (time.time() - start_time) * 1000

                info = await self.redis_client.info()
                status["details"] = {
                    "latency_ms": round(latency, 2),
                    "used_memory": info.get("used_memory_human"),
                    "connected_clients": info.get("connected_clients"),
                    "uptime_days": info.get("uptime_in_days"),
                }
            except Exception as e:
                status["status"] = "unhealthy"
                status["details"]["error"] = str(e)
        else:
            status["details"] = {
                "items_count": len(self._memory_cache),
                "max_size": self.max_memory_size,
            }

        return status

    async def clear_pattern(self, pattern: str) -> int:
        """Clear keys matching a glob pattern (Redis SCAN match or in-memory fnmatch)."""
        if self.use_redis:
            try:
                keys: list[str] = []
                async for key in self.redis_client.scan_iter(match=pattern):
                    keys.append(key)

                if keys:
                    count = await self.redis_client.delete(*keys)
                    return int(count)
            except Exception as e:
                logger.error(f"Redis clear_pattern error: {str(e)}")
                return 0

            return 0

        import fnmatch

        keys_to_remove = [k for k in self._memory_cache.keys() if fnmatch.fnmatch(k, pattern)]
        for k in keys_to_remove:
            del self._memory_cache[k]
        return len(keys_to_remove)

    async def get_or_set(
        self,
        prefix: str,
        key: str,
        factory: Callable[[], Any],
        ttl: Optional[int] = None,
    ) -> Any:
        """
        Get from cache or set using factory function
        """
        value = await self.get(prefix, key)
        if value is not None:
            return value

        # Not in cache, compute value
        try:
            if asyncio.iscoroutinefunction(factory):
                value = await factory()
            else:
                value = factory()
            await self.set(prefix, key, value, ttl)
            return value
        except Exception as e:
            logger.error(f"Factory error: {str(e)}")
            raise

    async def get_stats(self) -> dict[str, Any]:
        """Get cache status for health check (alias for backward compatibility)"""
        status = await self.get_status()
        return {"backend": status["type"], "status": status["status"], "details": status["details"]}

    # Aliases for compatibility if needed, but better to update callers
    get_async = get
    set_async = set
