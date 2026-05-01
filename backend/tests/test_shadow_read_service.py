import asyncio

import pytest

from backend.services import shadow_read_service
from backend.services.shadow_read_service import (
    compare_shadow_reads,
    schedule_shadow_compare,
)


def test_compare_shadow_reads_matches_counts_and_variance():
    primary = {
        "items": [
            {"item_code": "A", "counted_qty": 3, "variance": 1},
            {"item_code": "B", "counted_qty": 2, "variance": -1},
        ],
        "stats": {"total_items": 2, "total_variance": 0},
    }
    baseline = {
        "items": [
            {"item_code": "A", "counted_qty": 3, "variance": 1},
            {"item_code": "B", "counted_qty": 2, "variance": -1},
        ],
        "stats": {"total_items": 2, "total_variance": 0},
    }

    result = compare_shadow_reads(primary, baseline)

    assert result["totals_equal"] is True
    assert result["count_equal"] is True
    assert result["variance_diff"] == 0
    assert result["item_mismatch_count"] == 0


def test_compare_shadow_reads_reports_item_mismatch():
    result = compare_shadow_reads(
        {"items": [{"item_code": "A", "counted_qty": 3, "variance": 1}]},
        {"items": [{"item_code": "A", "counted_qty": 2, "variance": 0}]},
    )

    assert result["item_mismatch_count"] == 1
    assert result["items_diff"][0]["key"] == "item_code:A"


def test_compare_shadow_reads_normalizes_order_nulls_and_precision():
    result = compare_shadow_reads(
        {
            "items": [
                {"item_code": "B", "counted_qty": None, "variance": 1.00004},
                {"item_code": "A", "counted_qty": 2.00004, "variance": 0},
            ]
        },
        {
            "items": [
                {"item_code": "A", "counted_qty": 2, "variance": 0},
                {"item_code": "B", "counted_qty": 0, "variance": 1},
            ]
        },
    )

    assert result["count_equal"] is True
    assert result["variance_diff"] == 0
    assert result["item_mismatch_count"] == 0


def test_shadow_params_hash_is_stable_for_equivalent_params():
    assert shadow_read_service._params_hash({"b": 2, "a": 1}) == (
        shadow_read_service._params_hash({"a": 1, "b": 2})
    )


def test_shadow_sampling_is_stable_for_same_request(monkeypatch):
    monkeypatch.setattr(shadow_read_service.settings, "SHADOW_READ_ENABLED", True)
    monkeypatch.setattr(shadow_read_service.settings, "SHADOW_READ_SAMPLE_RATE", 0.25)
    params_hash = shadow_read_service._params_hash({"session_id": "S1"})

    first = shadow_read_service._should_sample(
        endpoint="dashboard.stats",
        staff_user="admin",
        params_hash=params_hash,
    )

    for _ in range(10):
        assert (
            shadow_read_service._should_sample(
                endpoint="dashboard.stats",
                staff_user="admin",
                params_hash=params_hash,
            )
            is first
        )


@pytest.mark.asyncio
async def test_schedule_shadow_compare_disabled_does_not_call_baseline(monkeypatch):
    monkeypatch.setattr(shadow_read_service.settings, "SHADOW_READ_ENABLED", False)
    called = False

    async def baseline():
        nonlocal called
        called = True
        return {}

    schedule_shadow_compare(
        endpoint="test.disabled",
        primary={},
        baseline_factory=baseline,
    )
    await asyncio.sleep(0)

    assert called is False
