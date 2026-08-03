"""
Shim for backward compatibility.
See backend/services/cache/redis_connection.py
"""

from backend.services.cache.redis_connection import (
    RedisService,
    close_redis,
    get_redis,
    init_redis,
    redis_service,
)

__all__ = ["RedisService", "close_redis", "get_redis", "init_redis", "redis_service"]
