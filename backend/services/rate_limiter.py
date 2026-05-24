"""
Rate Limiter Service - Prevent API abuse and handle concurrent requests

Two modes of operation
----------------------
In-process (default)
    Token-bucket algorithm backed by an in-process dict.  Effective for
    single-worker deployments.  Resets on worker restart.

Redis-backed (H-07)
    Sliding fixed-window counter stored atomically in Redis.  Call
    ``rate_limiter.attach_redis(redis_service)`` at startup to enable.
    Limits are enforced cluster-wide across all workers and survive
    individual worker restarts.  Falls back to the in-process bucket
    automatically if Redis is unavailable or returns an error.
"""

import asyncio
import logging
import time
from collections import defaultdict
from typing import Any, Optional

logger = logging.getLogger(__name__)


class RateLimiter:
    """
    Async-safe rate limiter using token bucket algorithm
    Supports per-user and per-endpoint rate limiting
    """

    # Lua script for atomic fixed-window rate limiting in Redis.
    # Increments the counter for the current window bucket and sets its
    # expiry on first write.  Returns the post-increment request count.
    #
    # KEYS[1] = rate limit key  (e.g. "rl:user:alice:28521960")
    # ARGV[1] = window_seconds  (TTL for the key, e.g. "60")
    _LUA_RATE_LIMIT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""

    def __init__(
        self,
        default_rate: int = 100,  # requests per minute
        default_burst: int = 20,  # burst allowance
        per_user: bool = True,
        per_endpoint: bool = False,
    ):
        self.default_rate = default_rate
        self.default_burst = default_burst
        self.per_user = per_user
        self.per_endpoint = per_endpoint

        # Token buckets: key -> (tokens, last_refill)
        self._buckets: dict[str, tuple] = {}
        # LU-05: asyncio.Lock replaces threading.Lock so that acquiring the
        # lock from an async handler never blocks the event loop.
        self._lock = asyncio.Lock()

        # Request tracking for analytics
        self._request_counts: dict[str, int] = defaultdict(int)
        self._window_start = time.time()
        self._window_size = 60  # 1 minute window

        # Redis backend (None = in-process only)
        self._redis: Optional[Any] = None
        self._redis_script_sha: Optional[str] = None
        self._redis_window_seconds: int = 60

    def _get_bucket_key(self, user_id: Optional[str], endpoint: Optional[str]) -> str:
        """Generate bucket key based on configuration"""
        parts = []

        if self.per_user and user_id:
            parts.append(f"user:{user_id}")

        if self.per_endpoint and endpoint:
            parts.append(f"endpoint:{endpoint}")

        if not parts:
            return "default"

        return "|".join(parts)

    def _refill_tokens(self, bucket_key: str, rate: int, burst: int) -> float:
        """Refill tokens in bucket"""
        now = time.time()

        if bucket_key not in self._buckets:
            # Initialize bucket
            self._buckets[bucket_key] = (burst, now)
            return burst

        tokens, last_refill = self._buckets[bucket_key]

        # Calculate time elapsed
        elapsed = now - last_refill

        # Refill tokens (rate per minute = rate/60 per second)
        tokens_to_add = (rate / 60.0) * elapsed
        new_tokens = min(burst, tokens + tokens_to_add)

        # Update bucket
        self._buckets[bucket_key] = (new_tokens, now)

        return new_tokens

    def _cleanup_old_buckets(self):
        """Remove buckets not used in last hour"""
        now = time.time()
        cutoff = now - 3600  # 1 hour

        to_remove = []
        for key, (_, last_refill) in self._buckets.items():
            if last_refill < cutoff:
                to_remove.append(key)

        for key in to_remove:
            del self._buckets[key]

    async def is_allowed(
        self,
        user_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        rate: Optional[int] = None,
        burst: Optional[int] = None,
    ) -> tuple[bool, dict[str, Any]]:
        """Check if request is allowed (async, uses asyncio.Lock).

        Returns: (is_allowed, info_dict)
        info_dict includes: allowed, remaining, limit, reset_in, retry_after (if denied)

        LU-05: Previously used threading.Lock which blocked the event loop on
        every rate-limit check.  Now uses asyncio.Lock — callers must await.
        """
        async with self._lock:
            bucket_key = self._get_bucket_key(user_id, endpoint)

            # Use custom rate/burst or defaults
            rate_limit = rate or self.default_rate
            burst_limit = burst or self.default_burst

            # Refill tokens
            tokens = self._refill_tokens(bucket_key, rate_limit, burst_limit)

            # Check if request is allowed
            if tokens >= 1.0:
                # Consume one token
                new_tokens = tokens - 1.0
                self._buckets[bucket_key] = (new_tokens, time.time())

                # Track request
                self._request_counts[bucket_key] += 1

                # Periodic cleanup
                if time.time() - self._window_start > self._window_size:
                    self._cleanup_old_buckets()
                    self._request_counts.clear()
                    self._window_start = time.time()

                return True, {
                    "allowed": True,
                    "remaining": int(new_tokens),
                    "limit": rate_limit,
                    "reset_in": int((60.0 / rate_limit) * (burst_limit - new_tokens)),
                }
            else:
                # Request denied - calculate retry_after
                retry_after_seconds = int(max(1, (1.0 - tokens) * (60.0 / rate_limit)))

                return False, {
                    "allowed": False,
                    "remaining": 0,
                    "limit": rate_limit,
                    "reset_in": int((60.0 / rate_limit) * (burst_limit - tokens)),
                    "retry_after": retry_after_seconds,
                }

    # ------------------------------------------------------------------ #
    # Redis backend wiring (H-07)                                         #
    # ------------------------------------------------------------------ #

    def attach_redis(self, redis_service: Any) -> None:
        """Enable Redis-backed rate limiting for cross-worker enforcement.

        Call this once during application startup after Redis is confirmed
        available.  Subsequent calls to ``is_allowed_async()`` will use the
        cluster-wide counter.  The synchronous ``is_allowed()`` always uses
        the in-process bucket (backward compatibility for sync call-sites).
        """
        self._redis = redis_service
        self._redis_script_sha = None   # will be loaded lazily on first use
        logger.info("Rate limiter: Redis backend attached (window=%ds)", self._redis_window_seconds)

    def detach_redis(self) -> None:
        """Revert to in-process token-bucket mode."""
        self._redis = None
        self._redis_script_sha = None
        logger.info("Rate limiter: Redis backend detached")

    async def _load_redis_script(self) -> Optional[str]:
        """Load the Lua rate-limit script into Redis and cache its SHA."""
        if self._redis_script_sha:
            return self._redis_script_sha
        try:
            sha = await self._redis.client.script_load(self._LUA_RATE_LIMIT)
            self._redis_script_sha = sha
            return sha
        except Exception as exc:
            logger.warning("Rate limiter: failed to load Lua script (%s)", exc)
            return None

    async def _redis_check(
        self,
        bucket_key: str,
        rate_limit: int,
    ) -> tuple[bool, dict[str, Any]]:
        """Atomically increment the Redis window counter and return allow/deny."""
        now = int(time.time())
        window_bucket = now // self._redis_window_seconds
        redis_key = f"rl:{bucket_key}:{window_bucket}"
        reset_in = self._redis_window_seconds - (now % self._redis_window_seconds)

        sha = await self._load_redis_script()
        try:
            if sha:
                try:
                    count = await self._redis.client.evalsha(
                        sha, 1, redis_key, str(self._redis_window_seconds)
                    )
                except Exception:
                    # Script evicted from Redis (e.g. after SCRIPT FLUSH or restart)
                    self._redis_script_sha = None
                    count = await self._redis.client.eval(
                        self._LUA_RATE_LIMIT, 1, redis_key, str(self._redis_window_seconds)
                    )
            else:
                count = await self._redis.client.eval(
                    self._LUA_RATE_LIMIT, 1, redis_key, str(self._redis_window_seconds)
                )
        except Exception as exc:
            raise RuntimeError(f"Redis eval failed: {exc}") from exc

        count = int(count)
        if count <= rate_limit:
            return True, {
                "allowed": True,
                "remaining": rate_limit - count,
                "limit": rate_limit,
                "reset_in": reset_in,
                "backend": "redis",
            }
        return False, {
            "allowed": False,
            "remaining": 0,
            "limit": rate_limit,
            "reset_in": reset_in,
            "retry_after": reset_in,
            "backend": "redis",
        }

    async def is_allowed_async(
        self,
        user_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        rate: Optional[int] = None,
        burst: Optional[int] = None,
    ) -> tuple[bool, dict[str, Any]]:
        """Async rate-limit check.

        Uses the Redis fixed-window counter when Redis is attached (cluster-
        wide enforcement).  Falls back to the in-process token bucket on any
        Redis error or when Redis is not configured.

        The synchronous ``is_allowed()`` is kept for backward compatibility;
        new async call-sites should prefer this method.
        """
        rate_limit = rate or self.default_rate

        if self._redis is not None and self._redis.is_connected:
            bucket_key = self._get_bucket_key(user_id, endpoint)
            try:
                return await self._redis_check(bucket_key, rate_limit)
            except Exception as exc:
                logger.warning(
                    "Rate limiter Redis check failed (%s) — falling back to in-process", exc
                )

        # In-process fallback — is_allowed() is now async (LU-05)
        return await self.is_allowed(user_id=user_id, endpoint=endpoint, rate=rate, burst=burst)

    async def get_stats(self) -> dict[str, Any]:
        """Get rate limiter statistics"""
        async with self._lock:
            return {
                "active_buckets": len(self._buckets),
                "total_requests": sum(self._request_counts.values()),
                "request_counts": dict(self._request_counts),
                "window_start": self._window_start,
                "backend": "redis" if self._redis is not None else "in-process",
            }


class ConcurrentRequestHandler:
    """
    Handle concurrent requests with queue management
    Prevents overload during high traffic
    """

    def __init__(self, max_concurrent: int = 50, queue_size: int = 100):
        self.max_concurrent = max_concurrent
        self.queue_size = queue_size
        self._semaphore = asyncio.Semaphore(max_concurrent)  # Use asyncio.Semaphore
        self._queue: list = []
        self._active = 0
        self._lock = asyncio.Lock()  # Use asyncio.Lock

    async def acquire(self, timeout: float = 5.0) -> bool:
        """Acquire slot for request"""
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=timeout)
            async with self._lock:
                self._active += 1
            return True
        except asyncio.TimeoutError:
            return False

    async def release(self):
        """Release slot after request"""
        async with self._lock:
            self._active = max(0, self._active - 1)
        self._semaphore.release()

    async def get_stats(self) -> dict[str, Any]:
        """Get handler statistics"""
        async with self._lock:
            return {
                "max_concurrent": self.max_concurrent,
                "active": self._active,
                "available": self.max_concurrent - self._active,
                "utilization": (
                    (self._active / self.max_concurrent) * 100 if self.max_concurrent > 0 else 0
                ),
            }
