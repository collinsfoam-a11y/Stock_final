"""Count-lines API package.

This package exposes the FastAPI router for count-line operations.
The implementation currently lives in count_lines_routes.py (the monolith)
and is re-exported here for forward compatibility.

Planned split (requires test-backed PRs):
  _schemas.py       — Pydantic models (done)
  _helpers.py       — shared internal helpers
  _routes_write.py  — POST / PUT / PATCH / DELETE handlers
  _routes_read.py   — GET handlers
  _routes_bulk.py   — bulk / batch / merge handlers
"""

from backend.api.count_lines._schemas import (
    AddQuantityRequest,
    CountLineApprovalRequest,
    CountLineBatchCreate,
    CountLineMergeRequest,
    CountLineRejectRequest,
    CountLineUpdateRequest,
)

# Re-export the router from the monolith until the split is completed.
from backend.api.count_lines_routes import init_count_lines_api, router

__all__ = [
    "router",
    "init_count_lines_api",
    "CountLineApprovalRequest",
    "CountLineRejectRequest",
    "AddQuantityRequest",
    "CountLineUpdateRequest",
    "CountLineBatchCreate",
    "CountLineMergeRequest",
]
