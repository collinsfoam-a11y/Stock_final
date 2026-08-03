"""
Shim for backward compatibility.
See backend/services/projections/reader.py
"""

from backend.services.projections.reader import (
    FLAG_PROJECTION_DASHBOARD_READS,
    FLAG_PROJECTION_REPORT_READS,
    PROJECTION_DRIFT_COUNTER,
    PROJECTION_GAP_COUNTER,
    PROJECTION_HIT_COUNTER,
    ProjectionReadError,
    ProjectionReadFlags,
    ProjectionReadService,
)

__all__ = [
    "FLAG_PROJECTION_DASHBOARD_READS",
    "FLAG_PROJECTION_REPORT_READS",
    "PROJECTION_DRIFT_COUNTER",
    "PROJECTION_GAP_COUNTER",
    "PROJECTION_HIT_COUNTER",
    "ProjectionReadError",
    "ProjectionReadFlags",
    "ProjectionReadService",
]
