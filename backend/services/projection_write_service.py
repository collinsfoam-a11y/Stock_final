"""
Shim for backward compatibility.
See backend/services/projections/writer.py
"""

from backend.services.projections.writer import (
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
    "SUPERSEDED_COUNT_LINE_STATUSES",
    "ProjectionWriteService",
    "get_effective_approval_status",
    "get_effective_count_line_status",
    "is_count_line_effectively_reviewed",
    "is_superseded_count_line",
]
