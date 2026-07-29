"""
Projections Domain Facade
Provides unified read and write services for MongoDB projections.
"""

from .core import ProjectionService, PROJECTION_VERSION, PROJECTION_COLLECTIONS
from .reader import (
    ProjectionReadService, ProjectionReadFlags, ProjectionReadError,
    FLAG_PROJECTION_DASHBOARD_READS, FLAG_PROJECTION_REPORT_READS,
    PROJECTION_GAP_COUNTER, PROJECTION_DRIFT_COUNTER, PROJECTION_HIT_COUNTER
)
from .writer import (
    ProjectionWriteService,
    APPROVED_COUNT_LINE_STATUSES,
    BLOCKING_APPROVAL_STATUSES,
    BLOCKING_COUNT_LINE_STATUSES,
    SUPERSEDED_COUNT_LINE_STATUSES,
    is_count_line_effectively_reviewed,
    get_effective_count_line_status,
    get_effective_approval_status,
    is_superseded_count_line
)

__all__ = [
    "ProjectionService", "PROJECTION_VERSION", "PROJECTION_COLLECTIONS",
    "ProjectionReadService", "ProjectionReadFlags", "ProjectionReadError",
    "FLAG_PROJECTION_DASHBOARD_READS", "FLAG_PROJECTION_REPORT_READS",
    "PROJECTION_GAP_COUNTER", "PROJECTION_DRIFT_COUNTER", "PROJECTION_HIT_COUNTER",
    "ProjectionWriteService",
    "APPROVED_COUNT_LINE_STATUSES",
    "BLOCKING_APPROVAL_STATUSES",
    "BLOCKING_COUNT_LINE_STATUSES",
    "SUPERSEDED_COUNT_LINE_STATUSES",
    "is_count_line_effectively_reviewed",
    "get_effective_count_line_status",
    "get_effective_approval_status",
    "is_superseded_count_line"
]
