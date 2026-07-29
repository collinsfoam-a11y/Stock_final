"""
Shim for backward compatibility.
See backend/services/projections/core.py
"""
from backend.services.projections.core import (
    ProjectionService, PROJECTION_VERSION, PROJECTION_COLLECTIONS
)

__all__ = ["ProjectionService", "PROJECTION_VERSION", "PROJECTION_COLLECTIONS"]
