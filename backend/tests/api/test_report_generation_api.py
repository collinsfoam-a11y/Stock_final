from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

import backend.services.report_generation_service as report_generation_service
from backend.api.report_generation_api import (
    ReportFilter,
    generate_session_history_report,
    generate_stock_summary,
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


class _FailingProjectionReadService:
    def __init__(self, _db, *, enforce_readiness: bool) -> None:
        assert enforce_readiness is True

    async def generate_stock_summary(self, _filters):
        raise HTTPException(
            status_code=503,
            detail={"code": "PROJECTION_INCONSISTENT"},
        )


class _ProjectionReadServiceWithSessionHistory:
    def __init__(self, _db, *, enforce_readiness: bool) -> None:
        assert enforce_readiness is True

    async def generate_session_history(self, _filters):
        return [{"session_id": "projected-session"}]


@pytest.mark.asyncio
async def test_generate_stock_summary_short_circuits_when_item_filters_match_nothing(
    monkeypatch,
):
    monkeypatch.setattr(
        report_generation_service.settings, "V3_PROJECTION_REPORT_READS", False
    )
    db = MagicMock()
    db.erp_items.find.return_value = _AsyncCursor([])

    def _unexpected_count_line_scan(_query):
        raise AssertionError(
            "count_lines.find should not be called when filtered ERP item lookup is empty"
        )

    db.count_lines.find.side_effect = _unexpected_count_line_scan

    result = await generate_stock_summary(
        db,
        ReportFilter(warehouse="Main Warehouse"),
    )

    assert result == []


@pytest.mark.asyncio
async def test_projection_report_failure_fails_closed_without_legacy_db_reads(monkeypatch):
    monkeypatch.setattr(
        report_generation_service.settings, "V3_PROJECTION_REPORT_READS", True
    )
    monkeypatch.setattr(
        report_generation_service,
        "ProjectionReadService",
        _FailingProjectionReadService,
    )
    db = MagicMock()
    db.erp_items.find.side_effect = AssertionError("legacy collection must not be read")
    db.count_lines.find.side_effect = AssertionError("legacy collection must not be read")

    with pytest.raises(HTTPException) as exc:
        await generate_stock_summary(db, ReportFilter())

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "PROJECTION_INCONSISTENT"
    db.erp_items.find.assert_not_called()
    db.count_lines.find.assert_not_called()


@pytest.mark.asyncio
async def test_generate_variance_report_short_circuits_when_item_filters_match_nothing(
    monkeypatch,
):
    monkeypatch.setattr(
        report_generation_service.settings, "V3_PROJECTION_REPORT_READS", False
    )
    db = MagicMock()
    db.erp_items.find.return_value = _AsyncCursor([])

    def _unexpected_count_line_scan(_query):
        raise AssertionError(
            "count_lines.find should not be called when filtered ERP item lookup is empty"
        )

    db.count_lines.find.side_effect = _unexpected_count_line_scan

    result = await generate_variance_report(
        db,
        ReportFilter(warehouse="Main Warehouse"),
    )

    assert result == []


@pytest.mark.asyncio
async def test_generate_session_history_report_fetches_count_lines_in_one_query(
    monkeypatch,
):
    monkeypatch.setattr(
        report_generation_service.settings, "V3_PROJECTION_REPORT_READS", False
    )
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

    def _find_count_lines(query, projection=None):
        assert query == {"session_id": {"$in": ["sess-1", "sess-2"]}}
        assert projection == {"_id": 0, "session_id": 1, "verified": 1, "status": 1}
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


@pytest.mark.asyncio
async def test_projection_session_history_uses_service_layer_only(monkeypatch):
    monkeypatch.setattr(
        report_generation_service.settings, "V3_PROJECTION_REPORT_READS", True
    )
    monkeypatch.setattr(
        report_generation_service,
        "ProjectionReadService",
        _ProjectionReadServiceWithSessionHistory,
    )
    db = MagicMock()
    db.sessions.find.side_effect = AssertionError("legacy collection must not be read")
    db.count_lines.find.side_effect = AssertionError("legacy collection must not be read")

    result = await generate_session_history_report(db, ReportFilter())

    assert result == [{"session_id": "projected-session"}]
    db.sessions.find.assert_not_called()
    db.count_lines.find.assert_not_called()
