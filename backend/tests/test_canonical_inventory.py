from datetime import datetime, timezone

from backend.services.canonical_inventory import (
    is_blocking_finalization,
    is_count_line_effectively_reviewed,
)


def test_non_variance_line_flagged_for_review_is_not_effectively_reviewed():
    assert (
        is_count_line_effectively_reviewed(
            {
                "status": "pending",
                "approval_status": "NEEDS_REVIEW",
                "variance": 0,
                "verified": False,
            }
        )
        is False
    )


def test_recount_assignment_blocks_finalization_even_without_variance():
    assert (
        is_blocking_finalization(
            {
                "status": "pending",
                "approval_status": "PENDING",
                "variance": 0,
                "verified": False,
                "assigned_to": "supervisor1",
                "recount_requested_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )
        is True
    )

