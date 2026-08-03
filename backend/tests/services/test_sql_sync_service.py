from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from db.indexes import INDEXES
from services.sql_sync_service import SQLSyncService


class _AsyncRows:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = list(rows)

    def __aiter__(self):
        self._iterator = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


def _make_service(
    *, sql_connector: Mock | None = None, mongo_db: object | None = None
) -> SQLSyncService:
    if sql_connector is None:
        sql_connector = Mock()
        sql_connector.test_connection.return_value = True

    if mongo_db is None:
        erp_items = SimpleNamespace(
            find_one=AsyncMock(),
            insert_one=AsyncMock(),
            update_one=AsyncMock(),
        )
        mongo_db = SimpleNamespace(erp_items=erp_items)

    return SQLSyncService(sql_connector=sql_connector, mongo_db=mongo_db)


def _sync_stats() -> dict[str, int | float]:
    return {
        "items_checked": 0,
        "qty_updated": 0,
        "items_created": 0,
        "qty_changes_detected": 0,
        "errors": 0,
        "duration": 0,
    }


@pytest.mark.asyncio
async def test_should_check_new_items_true_when_never_checked() -> None:
    service = _make_service()
    service._last_new_item_check = None
    assert service.should_check_new_items() is True


@pytest.mark.asyncio
async def test_should_check_new_items_respects_interval() -> None:
    service = _make_service()
    service._new_item_check_interval = 1800

    service._last_new_item_check = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        seconds=60
    )
    assert service.should_check_new_items() is False

    service._last_new_item_check = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        seconds=1800
    )
    assert service.should_check_new_items() is True


@pytest.mark.asyncio
async def test_should_run_nightly_sync_hour_and_once_per_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fixed_now = datetime(2025, 1, 2, 2, 5, 0)

    class FixedDateTime(datetime):
        @classmethod
        def utcnow(cls):  # type: ignore[override]
            return fixed_now

        @classmethod
        def now(cls, tz=None):  # type: ignore[override]
            if tz is not None:
                return fixed_now.replace(tzinfo=tz)
            return fixed_now

    # should_run_nightly_sync lives in SQLSyncNightlyMixin, so patch the module
    # that actually owns it. sql_sync_service only composes the mixins and does
    # not reference datetime.
    import backend.services.sync.nightly as sync_nightly

    monkeypatch.setattr(sync_nightly, "datetime", FixedDateTime)

    service = _make_service()
    service.nightly_sync_hour = 2
    service._last_nightly_sync = None
    assert service.should_run_nightly_sync() is True

    service._last_nightly_sync = fixed_now
    assert service.should_run_nightly_sync() is False


@pytest.mark.asyncio
async def test_sync_single_item_creates_new_item_when_missing() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = True

    erp_items = SimpleNamespace(
        find_one=AsyncMock(return_value=None),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    mongo_db = SimpleNamespace(erp_items=erp_items)

    service = _make_service(sql_connector=sql_connector, mongo_db=mongo_db)

    stats = {
        "items_checked": 0,
        "qty_updated": 0,
        "items_created": 0,
        "qty_changes_detected": 0,
        "errors": 0,
        "duration": 0,
    }

    sql_item = {"item_code": "ABC", "item_name": "Item ABC", "stock_qty": 5, "category": "Cat"}

    await service._sync_single_item(sql_item, stats)

    assert stats["items_created"] == 1
    assert stats["items_checked"] == 1
    assert erp_items.insert_one.await_count == 1

    inserted_doc = erp_items.insert_one.await_args.args[0]
    assert inserted_doc["item_code"] == "ABC"
    assert inserted_doc["stock_qty"] == 5.0
    assert inserted_doc["synced_from_sql"] is True


@pytest.mark.asyncio
async def test_update_existing_item_updates_qty_and_metadata() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = True

    erp_items = SimpleNamespace(
        find_one=AsyncMock(),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    mongo_db = SimpleNamespace(erp_items=erp_items)
    service = _make_service(sql_connector=sql_connector, mongo_db=mongo_db)

    stats = {
        "items_checked": 0,
        "qty_updated": 0,
        "items_created": 0,
        "qty_changes_detected": 0,
        "errors": 0,
        "duration": 0,
    }

    mongo_item = {
        "item_code": "ABC",
        "stock_qty": 10,
        # Metadata present or missing
        "location": "L1",
        "gst_percent": None,
        "hsn_code": "",
    }
    sql_item = {
        "item_code": "ABC",
        "stock_qty": 12,
        "location": "L2",  # should always sync if changed
        "gst_percent": 18,  # numeric: should update because existing is None
        "hsn_code": "1234",  # should update because existing is empty string
    }

    await service._update_existing_item("ABC", sql_item, 12.0, mongo_item, stats)

    assert stats["qty_changes_detected"] == 1
    assert stats["qty_updated"] == 1

    assert erp_items.update_one.await_count == 1
    _filter, update_doc = erp_items.update_one.await_args.args
    assert _filter == {"item_code": "ABC"}
    assert "$set" in update_doc

    set_fields = update_doc["$set"]
    assert set_fields["stock_qty"] == 12.0
    assert set_fields["sql_server_qty"] == 12.0
    assert set_fields["location"] == "L2"
    assert set_fields["gst_percent"] == 18.0
    assert set_fields["hsn_code"] == "1234"


@pytest.mark.asyncio
async def test_update_existing_item_skips_fully_aligned_document() -> None:
    erp_items = SimpleNamespace(
        find_one=AsyncMock(),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    service = _make_service(mongo_db=SimpleNamespace(erp_items=erp_items))
    stats = _sync_stats()
    mongo_item = {
        "item_code": "ABC",
        "item_name": "Item ABC",
        "stock_qty": 12.0,
        "sql_server_qty": 12.0,
        "sql_sync_status": "MATCH",
        "barcode": "000123",
        "location": "L1",
    }
    sql_item = {
        "item_code": "ABC",
        "item_name": "Item ABC",
        "stock_qty": 12.0,
        "barcode": "000123",
        "location": "L1",
    }

    changed = await service._update_existing_item("ABC", sql_item, 12.0, mongo_item, stats)

    assert changed is False
    erp_items.update_one.assert_not_awaited()


def test_consolidate_sql_rows_sums_duplicate_item_quantities_deterministically() -> None:
    service = _make_service()
    rows = [
        {
            "item_code": "ABC",
            "item_name": "Item ABC",
            "stock_qty": 7,
            "batch_id": "B2",
            "barcode": "000002",
        },
        {
            "item_code": "ABC",
            "item_name": "Item ABC",
            "stock_qty": 35,
            "batch_id": "B1",
            "barcode": "000001",
        },
        {"item_code": "XYZ", "item_name": "Item XYZ", "stock_qty": 4},
    ]

    consolidated, duplicate_rows = service._consolidate_sql_items(rows)

    assert duplicate_rows == 1
    assert len(consolidated) == 2
    abc = next(item for item in consolidated if item["item_code"] == "ABC")
    assert abc["stock_qty"] == 42.0
    assert abc["source_row_count"] == 2
    assert abc["batch_id"] == "B1"
    assert abc["barcode"] == "000001"


def test_sync_audit_indexes_cover_run_and_event_timelines() -> None:
    index_names = {options["name"] for _fields, options in INDEXES["sync_audit"]}
    assert index_names == {
        "idx_sync_audit_run_timeline",
        "idx_sync_audit_event_time",
        "idx_sync_audit_mode_time",
        "idx_sync_audit_correlation",
        "idx_sync_audit_worker_time",
        "idx_sync_audit_ttl",
    }


def test_sync_audit_has_bounded_retention() -> None:
    """sync_audit gets run + per-batch events every cycle; without a TTL it
    grows without bound."""
    ttl = [
        options
        for _fields, options in INDEXES["sync_audit"]
        if options.get("name") == "idx_sync_audit_ttl"
    ]
    assert ttl, "sync_audit must declare a TTL index"
    assert ttl[0]["expireAfterSeconds"] == 7776000  # 90 days


def test_sync_conflicts_indexes_declared_with_retention() -> None:
    names = {options["name"] for _fields, options in INDEXES["sync_conflicts"]}
    assert {
        "idx_sync_conflicts_run",
        "idx_sync_conflicts_type_time",
        "idx_sync_conflicts_barcode",
        "idx_sync_conflicts_ttl",
    } == names


def test_locks_collection_declares_ttl_index() -> None:
    """The bulk-sync run lock relies on this TTL to reap a dead worker's lock."""
    specs = INDEXES["locks"]
    assert any(
        fields == [("expires_at", 1)] and options.get("expireAfterSeconds") == 0
        for fields, options in specs
    )


@pytest.mark.asyncio
async def test_sync_audit_event_has_run_identity_counts_and_timing() -> None:
    sync_audit = SimpleNamespace(insert_one=AsyncMock())
    service = _make_service(
        mongo_db=SimpleNamespace(
            erp_items=SimpleNamespace(
                find_one=AsyncMock(), insert_one=AsyncMock(), update_one=AsyncMock()
            ),
            sync_audit=sync_audit,
        )
    )

    emitted = await service._emit_sync_audit_event(
        event_type="RUN_COMPLETED",
        sync_run_id="run-123",
        sync_mode="full",
        counts={"items_checked": 2, "items_updated": 1, "items_unchanged": 1},
        duration_seconds=0.25,
    )

    assert emitted is True
    event = sync_audit.insert_one.await_args.args[0]
    assert event["event_type"] == "RUN_COMPLETED"
    assert event["sync_run_id"] == "run-123"
    assert event["sync_mode"] == "full"
    assert event["counts"]["items_unchanged"] == 1
    assert event["duration_seconds"] == 0.25
    assert event["occurred_at"].tzinfo is None


@pytest.mark.asyncio
async def test_full_sync_is_noop_after_duplicate_batch_rows_are_consolidated() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_all_items.return_value = [
        {"item_code": "ABC", "item_name": "Item ABC", "stock_qty": 7, "batch_id": "B2"},
        {"item_code": "ABC", "item_name": "Item ABC", "stock_qty": 35, "batch_id": "B1"},
    ]
    erp_items = SimpleNamespace(
        find=Mock(
            return_value=_AsyncRows(
                [
                    {
                        "item_code": "ABC",
                        "item_name": "Item ABC",
                        "stock_qty": 42.0,
                        "sql_server_qty": 42.0,
                        "sql_sync_status": "MATCH",
                        "batch_id": "B1",
                    }
                ]
            )
        ),
        find_one=AsyncMock(),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    sync_audit = SimpleNamespace(insert_one=AsyncMock())
    sync_metadata = SimpleNamespace(update_one=AsyncMock())
    service = _make_service(
        sql_connector=sql_connector,
        mongo_db=SimpleNamespace(
            erp_items=erp_items,
            sync_audit=sync_audit,
            sync_metadata=sync_metadata,
        ),
    )

    stats = await service.sync_quantities_only()

    assert stats["source_rows"] == 2
    assert stats["duplicate_source_rows"] == 1
    assert stats["items_checked"] == 1
    assert stats["items_unchanged"] == 1
    erp_items.update_one.assert_not_awaited()
    assert [call.args[0]["event_type"] for call in sync_audit.insert_one.await_args_list] == [
        "RUN_STARTED",
        "BATCH_COMPLETED",
        "RUN_COMPLETED",
    ]


@pytest.mark.asyncio
async def test_check_item_qty_realtime_sql_unavailable_uses_cache() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = False

    erp_items = SimpleNamespace(
        find_one=AsyncMock(return_value={"item_code": "ABC", "stock_qty": 7}),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    mongo_db = SimpleNamespace(erp_items=erp_items)

    service = _make_service(sql_connector=sql_connector, mongo_db=mongo_db)

    result = await service.check_item_qty_realtime("ABC")

    assert result["item_code"] == "ABC"
    assert result["updated"] is False
    assert result["source"] == "mongodb_cache"


@pytest.mark.asyncio
async def test_check_item_qty_realtime_updates_when_qty_changed() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_item_by_code.return_value = {"item_code": "ABC", "stock_qty": 9}

    erp_items = SimpleNamespace(
        find_one=AsyncMock(return_value={"item_code": "ABC", "stock_qty": 7}),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    mongo_db = SimpleNamespace(erp_items=erp_items)

    service = _make_service(sql_connector=sql_connector, mongo_db=mongo_db)

    result = await service.check_item_qty_realtime("ABC")

    assert result["updated"] is True
    assert result["previous_qty"] == 7.0
    assert result["sql_qty"] == 9.0
    assert result["delta"] == 2.0

    assert erp_items.update_one.await_count == 1
    _filter, update_doc = erp_items.update_one.await_args.args
    assert _filter == {"item_code": "ABC"}
    assert update_doc["$set"]["stock_qty"] == 9.0


@pytest.mark.asyncio
async def test_check_item_qty_realtime_treats_missing_sql_qty_as_zero() -> None:
    sql_connector = Mock()
    sql_connector.test_connection.return_value = True
    sql_connector.get_item_by_code.return_value = {"item_code": "ABC", "stock_qty": None}

    erp_items = SimpleNamespace(
        find_one=AsyncMock(return_value={"item_code": "ABC", "stock_qty": 2}),
        insert_one=AsyncMock(),
        update_one=AsyncMock(),
    )
    mongo_db = SimpleNamespace(erp_items=erp_items)

    service = _make_service(sql_connector=sql_connector, mongo_db=mongo_db)

    result = await service.check_item_qty_realtime("ABC")

    assert result["updated"] is True
    assert result["sql_qty"] == 0.0
    assert result["previous_qty"] == 2.0
    assert result["delta"] == -2.0


# ---------------------------------------------------------------------------
# Conflict detection (duplicate barcode / blank item_code)
# ---------------------------------------------------------------------------


def test_detect_sync_conflicts_flags_duplicate_barcode_across_item_codes() -> None:
    """One barcode resolving to two items makes scanner lookup order-dependent."""
    source = [
        {"item_code": "A", "barcode": "600001", "stock_qty": 1},
        {"item_code": "B", "barcode": "600001", "stock_qty": 2},
    ]
    consolidated, _ = SQLSyncService._consolidate_sql_items(source)
    conflicts = SQLSyncService._detect_sync_conflicts(source, consolidated)

    dup = [c for c in conflicts if c["conflict_type"] == "DUPLICATE_BARCODE"]
    assert len(dup) == 1
    assert dup[0]["barcode"] == "600001"
    assert dup[0]["item_codes"] == ["A", "B"]
    # Both items still reach the mirror - the ERP is the system of record.
    assert len(consolidated) == 2


def test_detect_sync_conflicts_flags_rows_dropped_for_blank_item_code() -> None:
    source = [
        {"item_code": "A", "barcode": "1", "stock_qty": 1},
        {"item_code": None, "barcode": "2", "stock_qty": 1},
        {"item_code": "   ", "barcode": "3", "stock_qty": 1},
    ]
    consolidated, _ = SQLSyncService._consolidate_sql_items(source)
    conflicts = SQLSyncService._detect_sync_conflicts(source, consolidated)

    blank = [c for c in conflicts if c["conflict_type"] == "BLANK_ITEM_CODE"]
    assert len(blank) == 1
    assert blank[0]["row_count"] == 2
    assert len(consolidated) == 1


def test_detect_sync_conflicts_silent_on_clean_input() -> None:
    source = [
        {"item_code": "A", "barcode": "1", "stock_qty": 1},
        {"item_code": "A", "barcode": "1", "stock_qty": 2},  # same item, 2 batches
        {"item_code": "B", "barcode": "2", "stock_qty": 3},
    ]
    consolidated, duplicate_rows = SQLSyncService._consolidate_sql_items(source)
    assert duplicate_rows == 1
    assert SQLSyncService._detect_sync_conflicts(source, consolidated) == []


@pytest.mark.asyncio
async def test_record_sync_conflicts_persists_and_audits_each_finding() -> None:
    sync_conflicts = SimpleNamespace(insert_one=AsyncMock())
    sync_audit = SimpleNamespace(insert_one=AsyncMock())
    service = _make_service(
        mongo_db=SimpleNamespace(
            erp_items=SimpleNamespace(
                find_one=AsyncMock(), insert_one=AsyncMock(), update_one=AsyncMock()
            ),
            sync_conflicts=sync_conflicts,
            sync_audit=sync_audit,
        )
    )
    stats: dict[str, object] = {}
    conflicts = [
        {"conflict_type": "DUPLICATE_BARCODE", "barcode": "1", "item_codes": ["A", "B"]},
        {"conflict_type": "BLANK_ITEM_CODE", "row_count": 2},
    ]

    await service._record_sync_conflicts(
        conflicts, sync_run_id="run-1", sync_mode="full", stats=stats
    )

    assert stats["conflicts_detected"] == 2
    assert sync_conflicts.insert_one.await_count == 2
    persisted = sync_conflicts.insert_one.await_args_list[0].args[0]
    assert persisted["sync_run_id"] == "run-1"
    assert persisted["worker"]
    assert persisted["source"] == "erp_item_sync"

    audited = [c.args[0] for c in sync_audit.insert_one.await_args_list]
    assert [e["event_type"] for e in audited] == ["CONFLICT", "CONFLICT"]
    assert all(e["sync_run_id"] == "run-1" for e in audited)


@pytest.mark.asyncio
async def test_record_sync_conflicts_writes_nothing_when_clean() -> None:
    sync_conflicts = SimpleNamespace(insert_one=AsyncMock())
    service = _make_service(
        mongo_db=SimpleNamespace(
            erp_items=SimpleNamespace(
                find_one=AsyncMock(), insert_one=AsyncMock(), update_one=AsyncMock()
            ),
            sync_conflicts=sync_conflicts,
        )
    )
    stats: dict[str, object] = {}
    await service._record_sync_conflicts([], sync_run_id="r", sync_mode="full", stats=stats)

    assert stats["conflicts_detected"] == 0
    sync_conflicts.insert_one.assert_not_awaited()


# ---------------------------------------------------------------------------
# Audit event identity
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sync_audit_event_carries_correlation_and_worker() -> None:
    sync_audit = SimpleNamespace(insert_one=AsyncMock())
    service = _make_service(
        mongo_db=SimpleNamespace(
            erp_items=SimpleNamespace(
                find_one=AsyncMock(), insert_one=AsyncMock(), update_one=AsyncMock()
            ),
            sync_audit=sync_audit,
        )
    )

    assert await service._emit_sync_audit_event(
        event_type="RUN_STARTED", sync_run_id="run-9", sync_mode="variance"
    )
    event = sync_audit.insert_one.await_args.args[0]
    assert event["sync_run_id"] == "run-9"
    # Defaults to the run id so the field is never absent.
    assert event["correlation_id"] == "run-9"
    assert ":" in event["worker"]  # host:pid


@pytest.mark.asyncio
async def test_sync_audit_event_accepts_explicit_correlation_id() -> None:
    sync_audit = SimpleNamespace(insert_one=AsyncMock())
    service = _make_service(
        mongo_db=SimpleNamespace(
            erp_items=SimpleNamespace(
                find_one=AsyncMock(), insert_one=AsyncMock(), update_one=AsyncMock()
            ),
            sync_audit=sync_audit,
        )
    )

    await service._emit_sync_audit_event(
        event_type="CONFLICT",
        sync_run_id="run-9",
        sync_mode="full",
        correlation_id="req-abc",
        detail={"conflict_type": "DUPLICATE_BARCODE"},
    )
    event = sync_audit.insert_one.await_args.args[0]
    assert event["correlation_id"] == "req-abc"
    assert event["detail"] == {"conflict_type": "DUPLICATE_BARCODE"}


# ---------------------------------------------------------------------------
# Partial-run classification
# ---------------------------------------------------------------------------


def test_finalize_sync_stats_marks_run_with_errors_as_failed() -> None:
    """A run that swallowed per-batch errors is not a success - otherwise a
    permanently failing sync reports 100% success on /sync/status."""
    service = _make_service()
    before_ok = service._sync_stats["successful_syncs"]
    before_fail = service._sync_stats["failed_syncs"]

    stats = {"items_checked": 5, "qty_changes_detected": 0, "errors": 1}
    service._finalize_sync_stats(stats)

    assert stats["partial"] is True
    assert service._sync_stats["successful_syncs"] == before_ok
    assert service._sync_stats["failed_syncs"] == before_fail + 1
    assert service._sync_stats["last_run_status"] == "PARTIAL"
    assert service._sync_stats["last_run_errors"] == 1


def test_finalize_sync_stats_marks_clean_run_successful() -> None:
    service = _make_service()
    before_ok = service._sync_stats["successful_syncs"]

    stats = {"items_checked": 5, "qty_changes_detected": 0, "errors": 0}
    service._finalize_sync_stats(stats)

    assert stats["partial"] is False
    assert service._sync_stats["successful_syncs"] == before_ok + 1
    assert service._sync_stats["last_run_status"] == "SUCCESS"
