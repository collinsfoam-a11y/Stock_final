"""
FIX GROUP 8 — Regression tests: Batch-controlled items must not collapse into NO_BATCH.
"""

import pytest
from backend.services.sync_conflicts_service import SyncConflictsService


def test_missing_batch_id_raises():
    """Batches without batch_id must raise, not silently collapse to NO_BATCH."""
    data = {"batches": [{"qty": 5}]}  # no batch_id

    with pytest.raises(ValueError, match="BATCH_ID_REQUIRED"):
        SyncConflictsService._normalize_batches(data)


def test_valid_batch_ids_are_preserved():
    data = {
        "batches": [
            {"batch_id": "B-001", "qty": 5},
            {"batch_id": "B-002", "qty": 3},
        ]
    }
    result = SyncConflictsService._normalize_batches(data)
    assert len(result) == 2
    assert result[0]["batch_id"] == "B-001"
    assert result[1]["batch_id"] == "B-002"


def test_batch_no_field_is_accepted():
    """batch_no is a legacy alias for batch_id."""
    data = {"batches": [{"batch_no": "BN-999", "qty": 10}]}
    result = SyncConflictsService._normalize_batches(data)
    assert result[0]["batch_id"] == "BN-999"


def test_duplicate_batch_ids_are_deduplicated():
    data = {
        "batches": [
            {"batch_id": "B-DUP", "qty": 5},
            {"batch_id": "B-DUP", "qty": 3},  # duplicate
        ]
    }
    result = SyncConflictsService._normalize_batches(data)
    assert len(result) == 1


def test_multiple_batches_same_item_remain_separated():
    """Each batch must be a distinct entry in the result (no merging)."""
    data = {
        "batches": [
            {"batch_id": "BATCH-A", "qty": 10},
            {"batch_id": "BATCH-B", "qty": 20},
            {"batch_id": "BATCH-C", "qty": 30},
        ]
    }
    result = SyncConflictsService._normalize_batches(data)
    batch_ids = {b["batch_id"] for b in result}
    assert batch_ids == {"BATCH-A", "BATCH-B", "BATCH-C"}


def test_empty_batches_returns_empty():
    data = {"batches": []}
    result = SyncConflictsService._normalize_batches(data)
    assert result == []


def test_non_dict_entries_are_skipped():
    data = {"batches": ["not-a-dict", {"batch_id": "OK-1"}]}
    result = SyncConflictsService._normalize_batches(data)
    assert len(result) == 1
    assert result[0]["batch_id"] == "OK-1"
