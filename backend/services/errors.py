"""Error types for the sync services."""

from typing import Any, Optional


class SyncError(Exception):
    """Base error class for sync operations."""

    def __init__(self, message: str, details: dict[str, Optional[Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

    def __str__(self) -> str:
        details = ", ".join(f"{k}={v}" for k, v in self.details.items())
        return f"{self.__class__.__name__}({self.message}, {details})"


class DatabaseError(SyncError):
    """Error related to database operations."""

    pass


class ConnectionError(SyncError):
    """Error related to connection issues."""

    pass


class SyncConfigError(SyncError):
    """Error related to sync configuration."""

    pass
