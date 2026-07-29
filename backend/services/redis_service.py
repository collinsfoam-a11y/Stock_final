"""
Shim for backward compatibility.
See backend/services/cache/redis_connection.py
"""
from backend.services.cache.redis_connection import RedisService, get_redis, init_redis, close_redis, redis_service

__all__ = ["RedisService", "get_redis", "init_redis", "close_redis", "redis_service"]
