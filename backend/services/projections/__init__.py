"""
Projections Domain Facade
Provides unified read and write services for MongoDB projections.
"""

from .core import PROJECTION_COLLECTIONS, PROJECTION_VERSION, ProjectionService
from .reader import (
    FLAG_PROJECTION_DASHBOARD_READS,
    FLAG_PROJECTION_REPORT_READS,
    PROJECTION_DRIFT_COUNTER,
    PROJECTION_GAP_COUNTER,
    PROJECTION_HIT_COUNTER,
    ProjectionReadError,
    ProjectionReadFlags,
    ProjectionReadService,
)
from .writer import (
    APPROVED_COUNT_LINE_STATUSES,
    BLOCKING_APPROVAL_STATUSES,
    BLOCKING_COUNT_LINE_STATUSES,
    SUPERSEDED_COUNT_LINE_STATUSES,
    ProjectionWriteService,
    get_effective_approval_status,
    get_effective_count_line_status,
    is_count_line_effectively_reviewed,
    is_superseded_count_line,
)

__all__ = [
    "APPROVED_COUNT_LINE_STATUSES",
    "BLOCKING_APPROVAL_STATUSES",
    "BLOCKING_COUNT_LINE_STATUSES",
    "FLAG_PROJECTION_DASHBOARD_READS",
    "FLAG_PROJECTION_REPORT_READS",
    "PROJECTION_COLLECTIONS",
    "PROJECTION_DRIFT_COUNTER",
    "PROJECTION_GAP_COUNTER",
    "PROJECTION_HIT_COUNTER",
    "PROJECTION_VERSION",
    "SUPERSEDED_COUNT_LINE_STATUSES",
    "ProjectionReadError",
    "ProjectionReadFlags",
    "ProjectionReadService",
    "ProjectionService",
    "ProjectionWriteService",
    "get_effective_approval_status",
    "get_effective_count_line_status",
    "is_count_line_effectively_reviewed",
    "is_superseded_count_line",
]
