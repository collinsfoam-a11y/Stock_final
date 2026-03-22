from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from backend.api.report_generation_api import (
    ReportFilter,
    generate_session_history_report,
    generate_variance_report,
)


class _AsyncCursor:
    def __init__(self, rows):
        self._rows = list(rows)

    def sort(self, *_args, **_kwargs):
        return self

    def limit(self, _value):
        return self

    def __aiter__(self):
        self._iter = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


@pytest.mark.asyncio
async def test_generate_variance_report_short_circuits_when_item_filters_match_nothing():
    db = MagicMock()
    db.erp_items.find.return_value = _AsyncCursor([])

    def _unexpected_count_line_scan(_query):
        raise AssertionError("count_lines.find should not be called when filtered ERP item lookup is empty")

    db.count_lines.find.side_effect = _unexpected_count_line_scan

    result = await generate_variance_report(
        db,
        ReportFilter(warehouse="Main Warehouse"),
    )

    assert result == []


@pytest.mark.asyncio
async def test_generate_session_history_report_fetches_count_lines_in_one_query():
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db = MagicMock()
    db.sessions.find.return_value = _AsyncCursor(
        [
            {
                "id": "sess-1",
                "staff_user": "staff1",
                "staff_name": "Staff One",
                "warehouse": "WH-1",
                "status": "CLOSED",
                "started_at": started_at,
                "completed_at": started_at,
            },
            {
                "id": "sess-2",
                "staff_user": "staff2",
                "staff_name": "Staff Two",
                "warehouse": "WH-1",
                "status": "CLOSED",
                "started_at": started_at,
                "completed_at": started_at,
            },
        ]
    )

    def _find_count_lines(query):
        assert query == {"session_id": {"$in": ["sess-1", "sess-2"]}}
        return _AsyncCursor(
            [
                {"session_id": "sess-1", "verified": True},
                {"session_id": "sess-1", "status": "locked"},
                {"session_id": "sess-2", "verified": False},
            ]
        )

    db.count_lines.find.side_effect = _find_count_lines

    result = await generate_session_history_report(db, ReportFilter())

    assert len(result) == 2
    assert result[0]["session_id"] == "sess-1"
    assert result[0]["items_scanned"] == 2
    assert result[0]["items_verified"] == 2
    assert result[1]["session_id"] == "sess-2"
    assert result[1]["items_scanned"] == 1
    assert result[1]["items_verified"] == 0
