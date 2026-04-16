"""
Rate Limit Middleware - Enforce rate limiting on API endpoints
"""

import logging
import os
from typing import Optional

from fastapi import Request
from jwt import decode as jwt_decode
from starlette.types import ASGIApp

from backend.services.rate_limiter import RateLimiter

logger = logging.getLogger(__name__)


class RateLimitMiddleware:
    """Middleware to enforce rate limiting (ASGI Pattern)"""

    def __init__(
        self,
        app: ASGIApp,
        rate_limiter: RateLimiter,
        enabled: bool = True,
        jwt_secret: Optional[str] = None,
    ):
        self.app = app
        self.rate_limiter = rate_limiter
        self.enabled = enabled
        # SECURITY: Require JWT_SECRET from environment, no insecure fallback
        self.jwt_secret = jwt_secret or os.environ.get("JWT_SECRET")
        if not self.jwt_secret:
            logger.warning(
                "JWT_SECRET not configured for rate limit middleware. "
                "User-based rate limiting will fall back to IP-based limiting."
            )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not self.enabled:
            return await self.app(scope, receive, send)

        request = Request(scope, receive=receive)
        path = scope["path"]

        # Skip rate limiting for public endpoints (health, login, register)
        public_paths = ["/api/health", "/api/auth/login", "/api/auth/register"]
        if path in public_paths:
            return await self.app(scope, receive, send)

        # Extract user ID from token if available, fallback to IP-based limiting
        user_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer ") and self.jwt_secret:
            try:
                token = auth_header.split(" ")[1]
                # Decode JWT to get user ID
                payload = jwt_decode(token, self.jwt_secret, algorithms=["HS256"])
                user_id = payload.get("sub")
            except Exception:
                pass  # Invalid token, use IP-based rate limit

        # Fallback to IP-based limiting if no user ID
        if not user_id:
            forwarded_for = request.headers.get("X-Forwarded-For")
            client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else None
            user_id = client_ip or (request.client.host if request.client else "anonymous")

        # Check rate limit
        allowed, info = self.rate_limiter.is_allowed(user_id=user_id, endpoint=path)

        limit = info.get("limit", self.rate_limiter.default_rate)
        remaining = info.get("remaining", 0)
        reset_in = info.get("reset_in", 60)

        if not allowed:
            retry_after = info.get("retry_after", 60)

            # Send 429 Too Many Requests response directly
            import json

            response_body = {
                "success": False,
                "error": {
                    "message": "Rate limit exceeded. Please try again later.",
                    "code": "RATE_LIMIT_EXCEEDED",
                    "category": "rate_limit",
                    "details": {
                        "limit": limit,
                        "remaining": 0,
                        "reset_in": reset_in,
                        "retry_after": retry_after,
                    },
                },
            }

            await send(
                {
                    "type": "http.response.start",
                    "status": 429,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"retry-after", str(retry_after).encode()),
                        (b"x-ratelimit-limit", str(limit).encode()),
                        (b"x-ratelimit-remaining", b"0"),
                        (b"x-ratelimit-reset", str(reset_in).encode()),
                    ],
                }
            )
            await send(
                {
                    "type": "http.response.body",
                    "body": json.dumps(response_body).encode("utf-8"),
                }
            )
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                from starlette.datastructures import MutableHeaders

                headers = MutableHeaders(scope=message)
                headers["X-RateLimit-Limit"] = str(limit)
                headers["X-RateLimit-Remaining"] = str(remaining)
                headers["X-RateLimit-Reset"] = str(reset_in)
            await send(message)

        await self.app(scope, receive, send_wrapper)
