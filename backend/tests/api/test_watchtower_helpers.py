from datetime import datetime

from backend.api.v2.sessions import (
    _watchtower_add_fields_stage,
    _watchtower_recent_activity_payload,
)


def test_watchtower_add_fields_stage_uses_real_count_line_fields():
    stage = _watchtower_add_fields_stage()

    assert stage["$addFields"]["counted_qty_normalized"] == {
        "$ifNull": ["$counted_qty", "$quantity"]
    }
    assert "counted_at_normalized" in stage["$addFields"]


def test_watchtower_recent_activity_payload_uses_counted_qty_and_datetime():
    payload = _watchtower_recent_activity_payload(
        [
            {
                "item_code": "ITEM-1",
                "counted_qty_normalized": 7,
                "counted_by": "staff1",
                "counted_at_normalized": datetime(2026, 3, 15, 10, 30, 0),
            }
        ]
    )

    assert payload == [
        {
            "item_code": "ITEM-1",
            "qty": 7,
            "user": "staff1",
            "time": "2026-03-15T10:30:00",
        }
    ]
