"""Compatibility shim for legacy backend.app_factory imports.

This file ensures that older scripts and tests that import from `backend.app_factory`
continue to work without modification.
"""

from backend.app.factory import create_app
from backend.app.root_router import unverify_stock, verify_stock  # noqa: F401

# Some tests might still expect `app` and `api_router` here
app = create_app()

async def get_session_by_id(session_id: str, current_user: dict):
    from backend.services.canonical_inventory import build_session_lookup
    from backend.app import root_router
    database = getattr(root_router, "db", None)
    if database is None:
        from backend.db.runtime import get_db
        database = get_db()

    session = await database.sessions.find_one(build_session_lookup(session_id))
    if not session:
        return None
    from backend.api.schemas import Session
    if "_id" in session and "id" not in session:
        session["id"] = str(session["_id"])
    return Session(**session)
