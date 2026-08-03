from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from backend.services.system_report_service import SystemReportService


@pytest.mark.asyncio
async def test_system_health_report_falls_back_to_live_snapshot(
    test_db, monkeypatch: pytest.MonkeyPatch
):
    service = SystemReportService(test_db)

    monkeypatch.setattr(
        "backend.services.system_report_service.psutil.cpu_percent", lambda interval=None: 12.5
    )
    monkeypatch.setattr(
        "backend.services.system_report_service.psutil.virtual_memory",
        lambda: SimpleNamespace(percent=48.2),
    )
    monkeypatch.setattr(
        "backend.services.system_report_service.psutil.disk_usage",
        lambda _path: SimpleNamespace(percent=71.4),
    )

    rows = await service.generate_report("system_health", format="json")

    assert len(rows) == 1
    assert rows[0]["data_source"] == "live_snapshot"
    assert rows[0]["cpu_usage"] == 12.5
    assert rows[0]["memory_usage"] == 48.2
    assert rows[0]["disk_usage"] == 71.4
    assert rows[0]["mongodb_status"] == "connected"


@pytest.mark.asyncio
async def test_user_activity_report_combines_sources(test_db):
    service = SystemReportService(test_db)
    now = datetime(2026, 3, 15, 12, 0, 0)

    await test_db.activity_logs.insert_one(
        {
            "timestamp": now,
            "user": "staff1",
            "action": "scan_item",
            "status": "success",
            "ip_address": "10.0.0.1",
        }
    )
    await test_db["login_history"].insert_one(
        {
            "timestamp": now - timedelta(minutes=1),
            "username": "staff1",
            "status": "success",
            "ip_address": "10.0.0.2",
        }
    )
    await test_db.audit_logs.insert_one(
        {
            "timestamp": now - timedelta(minutes=2),
            "actor_username": "supervisor1",
            "event_type": "session_created",
            "status": "success",
            "ip_address": "10.0.0.3",
        }
    )

    rows = await service.generate_report(
        "user_activity",
        start_date="2026-03-15",
        end_date="2026-03-15",
        format="json",
    )

    assert [row["source"] for row in rows[:3]] == [
        "activity_log",
        "login_history",
        "audit_log",
    ]
    assert rows[0]["action"] == "scan_item"
    assert rows[1]["action"] == "login"
    assert rows[2]["action"] == "session_created"


@pytest.mark.asyncio
async def test_sync_history_report_uses_metadata_fallbacks(test_db):
    service = SystemReportService(test_db)
    timestamp = datetime(2026, 3, 15, 9, 30, 0)

    await test_db["sync_metadata"].insert_one(
        {
            "_id": "sql_qty_sync",
            "last_sync": timestamp,
            "last_sync_status": "success",
            "updated_count": 18,
            "duration_ms": 4200,
        }
    )
    await test_db.erp_sync_metadata.insert_one(
        {
            "_id": "erp_bootstrap_sync",
            "last_synced": timestamp - timedelta(minutes=5),
            "status": "completed",
            "items_processed": 125,
        }
    )

    rows = await service.generate_report(
        "sync_history",
        start_date="2026-03-15",
        end_date="2026-03-15",
        format="json",
    )

    assert len(rows) == 2
    assert rows[0]["sync_type"] == "sql_qty_sync"
    assert rows[0]["items_processed"] == 18
    assert rows[1]["sync_type"] == "erp_bootstrap_sync"
    assert rows[1]["status"] == "completed"


@pytest.mark.asyncio
async def test_error_logs_report_uses_real_error_log_fields(test_db):
    service = SystemReportService(test_db)
    in_range = datetime(2026, 3, 15, 8, 0, 0)
    out_of_range = datetime(2026, 3, 14, 23, 59, 0)

    await test_db.error_logs.insert_one(
        {
            "timestamp": in_range,
            "severity": "critical",
            "error_type": "HTTP500",
            "error_message": "boom",
            "endpoint": "/api/test",
            "user": "admin1",
            "resolved": False,
        }
    )
    await test_db.error_logs.insert_one(
        {
            "timestamp": out_of_range,
            "severity": "error",
            "error_type": "HTTP404",
            "error_message": "not found",
            "endpoint": "/api/other",
            "user": "staff1",
            "resolved": True,
        }
    )

    rows = await service.generate_report(
        "error_logs",
        start_date="2026-03-15",
        end_date="2026-03-15",
        format="json",
    )

    assert len(rows) == 1
    assert rows[0]["severity"] == "critical"
    assert rows[0]["error_type"] == "HTTP500"
    assert rows[0]["error_message"] == "boom"
    assert rows[0]["endpoint"] == "/api/test"


@pytest.mark.asyncio
async def test_audit_trail_report_maps_audit_log_schema(test_db):
    service = SystemReportService(test_db)
    timestamp = datetime(2026, 3, 15, 11, 15, 0)

    await test_db.audit_logs.insert_one(
        {
            "timestamp": timestamp,
            "actor_username": "supervisor1",
            "event_type": "count_approved",
            "status": "success",
            "resource_id": "count-line-1",
            "details": {"variance": 0},
        }
    )

    rows = await service.generate_report(
        "audit_trail",
        start_date="2026-03-15",
        end_date="2026-03-15",
        format="json",
    )

    assert len(rows) == 1
    assert rows[0]["action"] == "count_approved"
    assert rows[0]["user"] == "supervisor1"
    assert rows[0]["status"] == "success"
    assert rows[0]["resource_id"] == "count-line-1"
