from unittest.mock import MagicMock

import pytest

from backend.services.projection_write_service import ProjectionWriteService


def test_compute_aggregates_matches_session_totals():
    """PERF-05 / DATA-01: after a batch sync, session dashboard projection totals
    must be recomputed from the source ``count_lines`` collection, not from a
    stale in-memory counter."""
    service = ProjectionWriteService(MagicMock())

    active_lines = [
        {"session_id": "sess-1", "variance": 2, "damaged_qty": 1, "status": "approved", "approved_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z", "counted_at": "2026-01-01T00:00:00Z"},
        {"session_id": "sess-1", "variance": -1, "damaged_qty": 0, "status": "pending", "approved_at": None, "updated_at": "2026-01-01T00:00:00Z", "counted_at": "2026-01-01T00:00:00Z"},
    ]

    totals = service._compute_aggregates(active_lines)

    assert totals["total_items"] == 2
    assert totals["total_variance"] == 1.0
    assert totals["damage_items"] == 1
    assert totals["verified_items"] == 1
    assert totals["pending_items"] == 1
