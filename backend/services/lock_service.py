"""
Shim for backward compatibility.
See backend/services/locking/mongo_service.py
"""

from backend.services.locking.mongo_service import (
    DEFAULT_LOCK_TTL,
    LockError,
    LockService,
    ResourceLockedError,
)

__all__ = ["DEFAULT_LOCK_TTL", "LockError", "LockService", "ResourceLockedError"]
