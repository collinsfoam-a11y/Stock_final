from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services.count_line_write_service import CountLineWriteService


@pytest.mark.asyncio
async def test_single_count_write_does_not_trigger_projection_rebuild():
    """PERF-12: a single count write on the hot path must not trigger the expensive
    ``delete_many`` + ``insert_many`` projection rebuild. Rebuilds are reserved
    for session lifecycle transitions only."""
    db = MagicMock()
    db.count_lines = MagicMock()
    db.count_lines.insert_one = AsyncMock(return_value=MagicMock())

    lifecycle_service = MagicMock()
    lifecycle_service.update_session_totals = AsyncMock()

    write_service = CountLineWriteService(db, lifecycle_service=lifecycle_service)

    with patch.object(write_service, "_process_write_core", AsyncMock(return_value=None)):
        await write_service.process_write(
            {
                "session_id": "session-a",
                "location_id": "loc-1",
                "floor_id": "1",
                "rack_id": "A1",
                "item_code": "ITEM-1",
                "counted_qty": 3,
                "idempotency_key": "line-1",
                "client_record_id": "line-1",
                "status": "pending",
            }
        )

    assert lifecycle_service.update_session_totals.call_count == 0
