"""
Cache Domain Facade
Provides caching services and Redis connection management.
"""

from .manager import CacheService, CustomJSONEncoder, cache_on_demand
from .redis_connection import RedisService, close_redis, get_redis, init_redis

__all__ = [
    "CacheService",
    "CustomJSONEncoder",
    "RedisService",
    "cache_on_demand",
    "close_redis",
    "get_redis",
    "init_redis",
]
