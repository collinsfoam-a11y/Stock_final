"""
Shim for backward compatibility.
See backend/services/locking/mongo_service.py
"""
from backend.services.locking.mongo_service import LockService, LockError, ResourceLockedError, DEFAULT_LOCK_TTL

__all__ = ["LockService", "LockError", "ResourceLockedError", "DEFAULT_LOCK_TTL"]
