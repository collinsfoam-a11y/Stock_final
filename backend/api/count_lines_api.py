"""Compatibility wrapper for count-lines routes.

Route implementation lives in ``backend.api.count_lines_routes``.
"""

from backend.api.count_lines_routes import *  # noqa: F403 - back-compat shim: re-exports the moved module's public API
