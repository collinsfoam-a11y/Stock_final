import ipaddress
import logging
from collections.abc import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)


def resolve_lan_client_ip(request: Request) -> str | None:
    """Resolve the effective client IP for LAN enforcement.

    Behind a reverse proxy (nginx), ``request.client.host`` is the proxy's
    address, not the real client. Naively allowing that address would make LAN
    enforcement a no-op for any traffic proxied in from the public internet.

    We therefore trust ``X-Forwarded-For`` ONLY when the direct connection
    originates from our own infrastructure — i.e. the immediate peer is a
    private (RFC 1918) or loopback address (the reverse proxy / something on the
    LAN). In that case the left-most XFF entry is the originating client.

    A client connecting *directly* from a public address cannot spoof its way
    past the check: its direct peer IP is public, so XFF is ignored and the
    public address itself is evaluated (and rejected).
    """
    direct_ip = request.client.host if request.client else None
    if not direct_ip:
        return None

    try:
        direct_obj = ipaddress.ip_address(direct_ip)
    except ValueError:
        # Unparseable direct address — return as-is so the caller rejects it.
        return direct_ip

    if direct_obj.is_private or direct_obj.is_loopback:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            candidate = forwarded.split(",")[0].strip()
            if candidate:
                return candidate

    return direct_ip


class LANEnforcementMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce LAN-only access.
    Allows access if the resolved client IP is private (RFC 1918) or loopback.
    """

    def __init__(self, app):
        super().__init__(app)
        # Paths that are always allowed (e.g., health checks, docs)
        self.allowed_paths = {
            "/health",
            "/api/health",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/metrics",
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip check for allowed paths
        if request.url.path in self.allowed_paths:
            return await call_next(request)

        client_ip = resolve_lan_client_ip(request)

        if not client_ip:
            logger.warning("Request rejected: No client IP found")
            return JSONResponse(
                status_code=403,
                content={"code": "NETWORK_NOT_ALLOWED", "message": "Network access denied"},
            )

        try:
            ip_obj = ipaddress.ip_address(client_ip)

            # Allow if IP is private (LAN) or loopback (Localhost).
            # This ensures Client and Server are on the same local network
            # (or VPN/Tunnel terminating on the LAN).
            is_allowed = ip_obj.is_private or ip_obj.is_loopback

            if not is_allowed:
                logger.warning(f"Request rejected: IP {client_ip} is not a local network address")
                return JSONResponse(
                    status_code=403,
                    content={
                        "code": "NETWORK_NOT_ALLOWED",
                        "message": "Access restricted to local network",
                    },
                )

        except ValueError:
            logger.warning(f"Request rejected: Invalid IP format {client_ip}")
            return JSONResponse(
                status_code=403,
                content={"code": "NETWORK_NOT_ALLOWED", "message": "Invalid network address"},
            )

        return await call_next(request)
