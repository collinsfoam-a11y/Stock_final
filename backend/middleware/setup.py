"""Compatibility wrapper for legacy middleware setup imports."""

import logging
from typing import Any

from fastapi import FastAPI

from backend.app.middleware import register_middleware
from backend.config import settings

logger = logging.getLogger(__name__)

try:
    from backend.middleware.security_headers import SecurityHeadersMiddleware as _SecurityHeaders

    security_headers_middleware: Any = _SecurityHeaders
except ImportError:  # pragma: no cover - optional middleware
    security_headers_middleware = None


def setup_middleware(app: FastAPI) -> None:
    """Delegate to the canonical middleware registration path."""
    register_middleware(
        app,
        settings=settings,
        logger=logger,
        security_headers_middleware=security_headers_middleware,
    )
