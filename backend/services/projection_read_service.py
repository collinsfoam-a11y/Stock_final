"""
Shim for backward compatibility.
See backend/services/projections/reader.py
"""
from backend.services.projections.reader import (
    ProjectionReadService, 
    ProjectionReadFlags, 
    ProjectionReadError,
    FLAG_PROJECTION_DASHBOARD_READS,
    FLAG_PROJECTION_REPORT_READS,
    PROJECTION_GAP_COUNTER,
    PROJECTION_DRIFT_COUNTER,
    PROJECTION_HIT_COUNTER
)

__all__ = [
    "ProjectionReadService", "ProjectionReadFlags", "ProjectionReadError",
    "FLAG_PROJECTION_DASHBOARD_READS", "FLAG_PROJECTION_REPORT_READS",
    "PROJECTION_GAP_COUNTER", "PROJECTION_DRIFT_COUNTER", "PROJECTION_HIT_COUNTER"
]
