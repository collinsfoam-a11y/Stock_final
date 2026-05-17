"""
Performance Middleware - Track request performance and add caching headers
"""

import logging
import time

from starlette.types import ASGIApp

try:
    from services.monitoring_service import MonitoringService
except ImportError:
    # Fallback if services not in path
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).parent.parent))
    from services.monitoring_service import MonitoringService

logger = logging.getLogger(__name__)


class PerformanceMiddleware:
    """Middleware to track request performance (ASGI Pattern)"""

    def __init__(self, app: ASGIApp, monitoring: MonitoringService):
        self.app = app
        self.monitoring = monitoring

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        start_time = time.time()
        endpoint = scope["path"]
        method = scope["method"]

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                duration = time.time() - start_time
                status_code = message["status"]

                # Track request
                await self.monitoring.track_request(
                    endpoint=endpoint,
                    method=method,
                    status_code=status_code,
                    duration=duration,
                )

                # Add performance headers
                from starlette.datastructures import MutableHeaders

                headers = MutableHeaders(scope=message)
                headers["X-Response-Time"] = f"{duration:.3f}s"

                # Try to get X-Request-ID from request headers which is in scope
                # But headers in scope are bytes
                req_headers = dict(scope.get("headers", []))
                request_id = req_headers.get(b"x-request-id", b"unknown").decode()
                headers["X-Request-ID"] = request_id

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            duration = time.time() - start_time
            await self.monitoring.track_error(
                endpoint=endpoint,
                error=e,
                context={
                    "method": method,
                    "duration": duration,
                },
            )
            raise e


class CacheMiddleware:
    """Middleware to add cache headers for GET requests (ASGI Pattern)"""

    def __init__(
        self,
        app: ASGIApp,
        default_cache_max_age: int = 300,  # 5 minutes
    ):
        self.app = app
        self.default_cache_max_age = default_cache_max_age

        # Endpoints that should not be cached
        self.no_cache_paths = {
            "/api/auth/me",
            "/api/sessions",
            "/api/count-lines",
        }

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        method = scope["method"]
        path = scope["path"]

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code = message["status"]

                # Only cache successful GET requests
                if method == "GET" and status_code == 200 and path not in self.no_cache_paths:
                    from starlette.datastructures import MutableHeaders

                    headers = MutableHeaders(scope=message)
                    headers["Cache-Control"] = f"public, max-age={self.default_cache_max_age}"
                    headers["ETag"] = f'"{hash(path)}"'

            await send(message)

        await self.app(scope, receive, send_wrapper)
