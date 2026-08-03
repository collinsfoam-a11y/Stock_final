"""
Locking Domain Facade
Provides distributed locking mechanisms using Redis and MongoDB.
"""

from .mongo_service import LockError, LockService, ResourceLockedError
from .redis_manager import LockManager, get_lock_manager

__all__ = ["LockError", "LockManager", "LockService", "ResourceLockedError", "get_lock_manager"]
