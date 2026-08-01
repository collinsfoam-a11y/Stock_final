"""
Request Size Limit Middleware
Prevents DOS attacks via large request payloads
"""

import logging

logger = logging.getLogger(__name__)


class RequestSizeLimitMiddleware:
    """
    Middleware to limit request payload size (ASGI Pattern)
    Prevents denial-of-service attacks via large requests.
    Uses pure ASGI pattern to avoid TaskGroup crashes in BaseHTTPMiddleware.
    """

    def __init__(
        self,
        app,
        max_size: int = 10 * 1024 * 1024,  # 10 MB default
        exempt_paths: list = None,
    ):
        self.app = app
        self.max_size = max_size
        self.exempt_paths = exempt_paths or ["/health"]
        logger.info(f"Request size limit: {max_size / (1024 * 1024):.1f} MB")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        path = scope["path"]

        # Skip size check for exempt paths
        if any(path.startswith(p) for p in self.exempt_paths):
            return await self.app(scope, receive, send)

        # Check Content-Length header
        headers = dict(scope.get("headers", []))
        content_length_bytes = headers.get(b"content-length")

        if content_length_bytes:
            try:
                content_length = int(content_length_bytes.decode())
            except ValueError:
                import json

                await send(
                    {
                        "type": "http.response.start",
                        "status": 400,
                        "headers": [(b"content-type", b"application/json")],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": json.dumps(
                            {
                                "detail": "Invalid Content-Length header",
                                "error": "INVALID_CONTENT_LENGTH",
                            }
                        ).encode("utf-8"),
                    }
                )
                return

            if content_length > self.max_size:
                client_host = scope.get("client", ["unknown"])[0]
                logger.warning(
                    f"Request too large: {content_length} bytes (max: {self.max_size}) "
                    f"from {client_host}"
                )
                import json

                await send(
                    {
                        "type": "http.response.start",
                        "status": 413,
                        "headers": [(b"content-type", b"application/json")],
                    }
                )
                await send(
                    {
                        "type": "http.response.body",
                        "body": json.dumps(
                            {
                                "detail": f"Request payload too large. Maximum size: {self.max_size} bytes",
                                "max_size_mb": round(self.max_size / (1024 * 1024), 2),
                                "received_size_mb": round(content_length / (1024 * 1024), 2),
                                "error": "REQUEST_TOO_LARGE",
                            }
                        ).encode("utf-8"),
                    }
                )
                return

        await self.app(scope, receive, send)
