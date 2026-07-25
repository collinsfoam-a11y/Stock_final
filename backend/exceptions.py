"""
Custom Exception Classes for STOCK_VERIFY_2
Provides structured error handling with context
"""

from typing import Any, Optional


class StockVerifyException(Exception):
    """Base exception for all Stock Verify errors"""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: dict[str, Optional[Any]] = None,
        status_code: int = 500,
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}
        self.status_code = status_code

    def to_dict(self) -> dict[str, Any]:
        """Convert exception to dictionary for API responses"""
        return {
            "error": self.error_code,
            "message": self.message,
            "details": self.details,
        }


class DatabaseConnectionError(StockVerifyException):
    """Database connection errors"""

    def __init__(
        self,
        message: str,
        database: str = "unknown",
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="DATABASE_CONNECTION_ERROR",
            details={"database": database, **(details or {})},
            status_code=503,
        )
        self.database = database


class SQLServerConnectionError(DatabaseConnectionError):
    """SQL Server specific connection errors"""

    def __init__(self, message: str, details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            database="sql_server",
            details=details,
        )
        self.error_code = "SQL_SERVER_CONNECTION_ERROR"


class MongoDBConnectionError(DatabaseConnectionError):
    """MongoDB specific connection errors"""

    def __init__(self, message: str, details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            database="mongodb",
            details=details,
        )
        self.error_code = "MONGODB_CONNECTION_ERROR"


class SyncError(StockVerifyException):
    """Sync operation errors"""

    def __init__(
        self,
        message: str,
        sync_type: str = "unknown",
        item_code: Optional[str] = None,
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="SYNC_ERROR",
            details={
                "sync_type": sync_type,
                "item_code": item_code,
                **(details or {}),
            },
            status_code=500,
        )
        self.sync_type = sync_type
        self.item_code = item_code


class ItemNotFoundError(StockVerifyException):
    """Item not found errors"""

    def __init__(self, item_code: str, details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=f"Item not found: {item_code}",
            error_code="ITEM_NOT_FOUND",
            details={"item_code": item_code, **(details or {})},
            status_code=404,
        )
        self.item_code = item_code


class NotFoundError(StockVerifyException):
    """Generic not found error"""

    def __init__(
        self,
        message: str,
        resource: str = "unknown",
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            details={"resource": resource, **(details or {})},
            status_code=404,
        )
        self.resource = resource


class ValidationError(StockVerifyException):
    """Data validation errors"""

    def __init__(
        self,
        message: str,
        field: Optional[str] = None,
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            details={"field": field, **(details or {})},
            status_code=422,
        )
        self.field = field


class AuthenticationError(StockVerifyException):
    """Authentication errors"""

    def __init__(
        self,
        message: str = "Authentication failed",
        details: dict[str, Optional[Any]] = None,
        status_code: int = 401,
    ):
        super().__init__(
            message=message,
            error_code="AUTHENTICATION_ERROR",
            details=details or {},
            status_code=status_code,
        )


class SessionConflictError(AuthenticationError):
    """Session conflict errors (Phase 1)"""

    def __init__(
        self,
        message: str = "This account is already active on another device.",
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            details=details or {},
            status_code=409,
        )
        self.error_code = "AUTH_SESSION_CONFLICT"


class AuthorizationError(StockVerifyException):
    """Authorization errors"""

    def __init__(
        self,
        message: str = "Insufficient permissions",
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="AUTHORIZATION_ERROR",
            details=details or {},
            status_code=403,
        )


class RateLimitError(StockVerifyException):
    """Rate limiting errors"""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: Optional[int] = None):
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_ERROR",
            details={"retry_after": retry_after} if retry_after else {},
            status_code=429,
        )
        self.retry_after = retry_after

class ERPItemNotFoundError(StockVerifyException):
    """ERP Item not found error"""

    def __init__(self, item_code: str, details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=f"ERP Item not found: {item_code}",
            error_code="ERP_ITEM_NOT_FOUND",
            details={"item_code": item_code, **(details or {})},
            status_code=404,
        )
        self.item_code = item_code

class SQLUnavailableError(SQLServerConnectionError):
    """SQL Server Unavailable"""

    def __init__(self, message: str = "SQL Server unavailable", details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "SQL_SERVER_UNAVAILABLE"
        self.status_code = 503

class SQLConnectionTimeoutError(SQLServerConnectionError):
    """SQL Connection Timeout Error"""

    def __init__(self, message: str = "SQL Server query timed out", details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "SQL_SERVER_TIMEOUT"
        self.status_code = 504

class SQLQueryError(SQLServerConnectionError):
    """SQL Query Error"""

    def __init__(self, message: str = "SQL Server query failed", details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            details=details,
        )
        self.error_code = "SQL_QUERY_ERROR"
        self.status_code = 502

class ERPCacheUpdateError(DatabaseConnectionError):
    """ERP Cache Update Error"""

    def __init__(self, message: str = "ERP cache update failed", details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            database="mongodb",
            details=details,
        )
        self.error_code = "ERP_CACHE_UPDATE_ERROR"
        self.status_code = 503

class ERPRefreshInProgressError(StockVerifyException):
    """ERP Refresh In Progress Error"""

    def __init__(
        self,
        message: str = "A refresh is already running for this item.",
        retry_after: int = 2,
        details: dict[str, Optional[Any]] = None,
    ):
        super().__init__(
            message=message,
            error_code="ERP_REFRESH_IN_PROGRESS",
            details={"retry_after_seconds": retry_after, **(details or {})},
            status_code=409,
        )
        self.retry_after = retry_after

class ERPInvalidResponseError(SyncError):
    """ERP Invalid Response Error"""

    def __init__(self, message: str = "Invalid response from ERP", item_code: Optional[str] = None, details: dict[str, Optional[Any]] = None):
        super().__init__(
            message=message,
            sync_type="sql_refresh",
            item_code=item_code,
            details=details,
        )
        self.error_code = "ERP_INVALID_RESPONSE"
        self.status_code = 502
