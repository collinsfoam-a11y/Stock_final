"""
Request ID / Correlation ID Middleware (2024/2025 Best Practice)
Adds unique request ID for distributed tracing and debugging.

Follows ASGI Correlation ID pattern from awesome-fastapi best practices:
- Generates/propagates X-Request-ID and X-Correlation-ID headers
- Stores IDs in contextvars for async access anywhere in request
- Integrates with logging for automatic correlation in log messages
"""

import contextvars
import logging
import uuid
from typing import Optional

from starlette.requests import Request

# Context variables for correlation IDs (async-safe, accessible anywhere)
request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "request_id", default=None
)
correlation_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "correlation_id", default=None
)


def get_request_id() -> Optional[str]:
    """Get current request ID from context (accessible from any async code)"""
    return request_id_ctx.get()


def get_correlation_id() -> Optional[str]:
    """Get current correlation ID from context (accessible from any async code)"""
    return correlation_id_ctx.get()


class CorrelationIDFilter(logging.Filter):
    """
    Logging filter that adds request_id and correlation_id to log records.
    Usage: Add to logger handlers for automatic correlation in logs.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get() or "-"
        record.correlation_id = correlation_id_ctx.get() or "-"
        return True


logger = logging.getLogger(__name__)


class RequestIDMiddleware:
    """
    Request ID / Correlation ID Middleware (ASGI Pattern)
    Features:
    - X-Request-ID: Unique per-request identifier (generated if not provided)
    - X-Correlation-ID: Traces requests across services (propagated from upstream)
    - Context variables for async access throughout the request lifecycle
    - Response headers for client-side correlation
    Uses pure ASGI pattern to avoid TaskGroup crashes in BaseHTTPMiddleware.
    """

    def __init__(
        self,
        app,
        request_id_header: str = "X-Request-ID",
        correlation_id_header: str = "X-Correlation-ID",
    ):
        self.app = app
        self.request_id_header = request_id_header
        self.correlation_id_header = correlation_id_header

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        request = Request(scope, receive=receive)

        # Get or generate request ID
        request_id = request.headers.get(self.request_id_header.lower())
        if not request_id:
            request_id = str(uuid.uuid4())

        # Get correlation ID from header (for distributed tracing) or use request ID
        correlation_id = request.headers.get(self.correlation_id_header.lower())
        if not correlation_id:
            correlation_id = request_id

        # Store in context variables (async-safe, accessible from anywhere)
        request_id_token = request_id_ctx.set(request_id)
        correlation_id_token = correlation_id_ctx.set(correlation_id)

        try:
            # Store in request state for backward compatibility
            # This is slightly tricky in pure ASGI as request.state is not automatically available
            # We can use scope['state'] which is where Starlette stores it
            if "state" not in scope:
                scope["state"] = {}
            scope["state"]["request_id"] = request_id
            scope["state"]["correlation_id"] = correlation_id

            # Log request with IDs (only for non-health endpoints)
            if not scope["path"].startswith("/health"):
                logger.debug(
                    f"Request: {scope['method']} {scope['path']} "
                    f"[request_id={request_id}, correlation_id={correlation_id}]"
                )

            async def send_wrapper(message):
                if message["type"] == "http.response.start":
                    from starlette.datastructures import MutableHeaders

                    headers = MutableHeaders(scope=message)
                    headers[self.request_id_header] = request_id
                    headers[self.correlation_id_header] = correlation_id
                await send(message)

            await self.app(scope, receive, send_wrapper)
        finally:
            # Reset context variables
            request_id_ctx.reset(request_id_token)
            correlation_id_ctx.reset(correlation_id_token)
