"""
Shim for backward compatibility.
See backend/services/cache/manager.py
"""
from backend.services.cache.manager import CacheService, CustomJSONEncoder, cache_on_demand

__all__ = ["CacheService", "CustomJSONEncoder", "cache_on_demand"]
