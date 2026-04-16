"""
Security Headers Middleware (2024/2025 Best Practice)
Implements OWASP security headers recommendations
"""

import logging

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware:
    """
    Security Headers Middleware
    Implements OWASP recommended security headers.
    Uses pure ASGI pattern to avoid TaskGroup crashes in BaseHTTPMiddleware.
    """

    def __init__(self, app, **options):
        self.app = app
        self.options = options

        # Security headers configuration
        self.headers = {
            # Prevent clickjacking
            "X-Frame-Options": options.get("X_FRAME_OPTIONS", "DENY"),
            # Prevent MIME type sniffing
            "X-Content-Type-Options": options.get("X_CONTENT_TYPE_OPTIONS", "nosniff"),
            # XSS Protection (legacy but still useful)
            "X-XSS-Protection": options.get("X_XSS_PROTECTION", "1; mode=block"),
            # Content Security Policy
            "Content-Security-Policy": options.get(
                "CSP",
                # Development: relaxed CSP for local testing
                # Production: set STRICT_CSP=true and remove 'unsafe-inline'/'unsafe-eval'
                (
                    (
                        "default-src 'self'; "
                        "script-src 'self'; "
                        "style-src 'self'; "
                        "img-src 'self' data: https:; "
                        "font-src 'self' data:; "
                        "connect-src 'self';"
                    )
                    if options.get("STRICT_CSP", False)
                    else (
                        "default-src 'self'; "
                        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                        "style-src 'self' 'unsafe-inline'; "
                        "img-src 'self' data: https:; "
                        "font-src 'self' data:; "
                        "connect-src 'self';"
                    )
                ),
            ),
            # Referrer Policy
            "Referrer-Policy": options.get("REFERRER_POLICY", "strict-origin-when-cross-origin"),
            # Permissions Policy (formerly Feature Policy)
            "Permissions-Policy": options.get(
                "PERMISSIONS_POLICY", "geolocation=(), microphone=(), camera=()"
            ),
            # HSTS (HTTP Strict Transport Security) - Only for HTTPS
            "Strict-Transport-Security": (
                options.get("HSTS", "max-age=31536000; includeSubDomains; preload")
                if options.get("force_https", False)
                else None
            ),
            # Remove server information
            "X-Powered-By": None,  # Remove default X-Powered-By
            # Additional security headers
            # L-fix: Restrict cross-domain policies per OWASP recommendation
            "X-Permitted-Cross-Domain-Policies": "none",
            "Cross-Origin-Embedder-Policy": options.get("COEP", "unsafe-none"),  # Relaxed for dev
            "Cross-Origin-Opener-Policy": options.get(
                "COOP", "same-origin-allow-popups"
            ),  # Allow popups
            "Cross-Origin-Resource-Policy": options.get(
                "CORP", "cross-origin"
            ),  # Allow cross-origin (frontend <-> backend)
        }

        # Remove None values
        self.headers = {k: v for k, v in self.headers.items() if v is not None}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                # Convert list of tuples to MultiDict or just edit in place
                # ASGI headers are list of (name, value) bytes
                from starlette.datastructures import MutableHeaders

                headers = MutableHeaders(scope=message)

                # Add security headers
                for header_name, header_value in self.headers.items():
                    if header_name == "Strict-Transport-Security":
                        if scope.get("scheme") != "https":
                            continue
                    headers[header_name] = header_value

                # Remove potentially dangerous headers
                dangerous_headers = [
                    "Server",
                    "X-Powered-By",
                    "X-AspNet-Version",
                    "X-AspNetMvc-Version",
                ]
                for header in dangerous_headers:
                    if header in headers:
                        del headers[header]

            await send(message)

        await self.app(scope, receive, send_wrapper)
