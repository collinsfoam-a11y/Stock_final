"""
Shim for backward compatibility.
See backend/services/projections/core.py
"""

from backend.services.projections.core import (
    PROJECTION_COLLECTIONS,
    PROJECTION_VERSION,
    ProjectionService,
)

__all__ = ["PROJECTION_COLLECTIONS", "PROJECTION_VERSION", "ProjectionService"]
