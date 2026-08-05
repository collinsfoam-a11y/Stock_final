"""Compatibility wrapper for auth routes.

Route implementation lives in ``backend.api.auth_routes``.
"""

from backend.api.auth_routes import *  # noqa: F403 - back-compat shim: re-exports the moved module's public API
