"""
Cache Domain Facade
Provides caching services and Redis connection management.
"""

from .redis_connection import RedisService, get_redis, init_redis, close_redis
from .manager import CacheService, CustomJSONEncoder, cache_on_demand

__all__ = [
    "RedisService", "get_redis", "init_redis", "close_redis",
    "CacheService", "CustomJSONEncoder", "cache_on_demand"
]
