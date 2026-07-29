"""
Shim for backward compatibility.
See backend/services/projections/writer.py
"""
from backend.services.projections.writer import (
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
