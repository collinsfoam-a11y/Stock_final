"""
Shim for backward compatibility.
See backend/services/locking/redis_manager.py
"""
from backend.services.locking.redis_manager import LockManager, get_lock_manager

__all__ = ["LockManager", "get_lock_manager"]
