"""Compatibility shim for legacy backend.app_factory imports.

This file ensures that older scripts and tests that import from `backend.app_factory`
continue to work without modification.
"""

from backend.app.factory import create_app
from backend.app.root_router import verify_stock, unverify_stock, get_count_lines, root_router, api_router

# Some tests might still expect `app` and `api_router` here
app = create_app()

# Expose api_router for compatibility with things that imported it directly
# Though technically they should now be going through register_routers,
# we export the one from root_router just in case.

from backend.core.globals import db, cache_service, websocket_manager

from backend.utils.auth_utils import get_password_hash, get_password_hash_metadata

from backend.core.globals import activity_log_service
from backend.services.runtime import get_refresh_token_service
from backend.app.root_router import get_session_by_id
