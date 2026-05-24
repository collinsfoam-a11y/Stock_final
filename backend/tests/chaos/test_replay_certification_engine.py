from __future__ import annotations

from datetime import timedelta

import pytest

from backend.services.projection_service import ProjectionService
from backend.services.event_service import EventService
from backend.services.replay_certification_service import ReplayCertificationService
from backend.tests.chaos.replay_chaos_helpers import scan_event, utc_now
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_rc_01_deterministic_replay_certification_records_evidence():
    db = InMemoryDatabase()
    projection_service = ProjectionService(db)
    certification_service = ReplayCertificationService(db)
    events = [
        scan_event(
            event_id="rc-01-event-1",
            global_sequence=1,
            aggregate_sequence=1,
            counted_qty=2,
            line_id="line-rc-01-1",
        ),
        scan_event(
            event_id="rc-01-event-2",
            global_sequence=2,
            aggregate_sequence=2,
            counted_qty=3,
            line_id="line-rc-01-2",
        ),
    ]
    for event in events:
        await db.event_log.insert_one(event)

    rebuild = await projection_service.rebuild_from_event_log(
        clear_existing=True,
        checkpoint_interval=1,
        rebuild_owner="rc-01-worker",
    )
    report = await certification_service.certify(certification_id="rc-01-cert")
    persisted = await db.replay_certification_reports.find_one({"_id": "rc-01-cert"})

    assert report["status"] == "certified"
    assert report["event_count"] == 2
    assert report["first_global_sequence"] == 1
    assert report["last_global_sequence"] == 2
    assert report["projection_hash"] == rebuild["projection_hash"]
    assert report["semantic_state_hash"] == report["deterministic_repeat_hash"]
    assert report["semantic_validation"]["passed"] is True
    assert report["continuity"]["passed"] is True
    assert persisted["status"] == "certified"


@pytest.mark.asyncio
async def test_rc_02_replay_continuity_proof_rejects_sequence_gap():
    db = InMemoryDatabase()
    projection_service = ProjectionService(db)
    certification_service = ReplayCertificationService(db)
    events = [
        scan_event(
            event_id="rc-02-event-1",
            global_sequence=1,
            aggregate_sequence=1,
            counted_qty=2,
            line_id="line-rc-02-1",
        ),
        scan_event(
            event_id="rc-02-event-3",
            global_sequence=3,
            aggregate_sequence=3,
            counted_qty=3,
            line_id="line-rc-02-3",
        ),
    ]
    for event in events:
        await db.event_log.insert_one(event)

    with pytest.raises(ValueError, match="Projection semantic validation failed"):
        await projection_service.rebuild_from_event_log(
            clear_existing=True,
            checkpoint_interval=1,
            rebuild_owner="rc-02-worker",
        )

    report = await certification_service.certify(certification_id="rc-02-cert")

    assert report["status"] == "failed"
    assert report["continuity"]["passed"] is False
    assert report["continuity"]["missing_global_sequences"] == [2]
    assert report["continuity"]["aggregate_gaps"] == [
        {"aggregate_id": "ITEM-CHAOS", "missing_versions": [2]}
    ]
    assert "global_sequence_gap" in report["continuity"]["violations"]
    assert "aggregate_version_gap" in report["continuity"]["violations"]


@pytest.mark.asyncio
async def test_rc_03_replay_audit_report_detects_duplicate_authoritative_lineage():
    db = InMemoryDatabase()
    certification_service = ReplayCertificationService(db)
    events = [
        scan_event(
            event_id="rc-03-event-1",
            global_sequence=1,
            aggregate_sequence=1,
            counted_qty=2,
            line_id="line-rc-03-1",
        ),
        scan_event(
            event_id="rc-03-event-2",
            global_sequence=1,
            aggregate_sequence=1,
            counted_qty=3,
            line_id="line-rc-03-2",
        ),
    ]
    for event in events:
        await db.event_log.insert_one(event)

    report = await certification_service.certify(certification_id="rc-03-cert")

    assert report["status"] == "failed"
    assert "duplicate_global_sequence" in report["continuity"]["violations"]
    assert "duplicate_aggregate_version" in report["continuity"]["violations"]
    assert report["continuity"]["duplicate_global_sequences"] == [1]


@pytest.mark.asyncio
async def test_or_01_recovery_plan_and_stale_ownership_cleanup_are_dry_run_first():
    db = InMemoryDatabase()
    service = ReplayCertificationService(db)
    expired_at = utc_now() - timedelta(minutes=5)
    await db.websocket_socket_ownership.insert_one(
        {
            "_id": "stale-socket-owner",
            "worker_id": "dead-worker",
            "connection_id": "dead-connection",
            "status": "active",
            "expires_at": expired_at,
        }
    )
    await db.websocket_replay_worker_leases.insert_one(
        {
            "_id": "stale-worker-lease",
            "owner": "dead-worker",
            "worker_id": "dead-worker",
            "fencing_token": 1,
            "lease_version": 1,
            "expires_at": expired_at,
        }
    )
    await db.projection_replay_checkpoints.insert_one(
        {
            "_id": "failed-rebuild:global",
            "rebuild_id": "failed-rebuild",
            "status": "failed",
        }
    )

    plan = await service.recovery_plan()
    dry_run = await service.cleanup_stale_ownership(dry_run=True)
    assert await db.websocket_socket_ownership.count_documents({}) == 1
    executed = await service.cleanup_stale_ownership(dry_run=False)

    assert plan["action_count"] == 3
    assert "stale-socket-owner" in plan["stale_socket_ownership_ids"]
    assert "stale-worker-lease" in plan["stale_replay_worker_lease_ids"]
    assert "failed-rebuild" in plan["interrupted_rebuild_ids"]
    assert dry_run["deleted_socket_ownership_count"] == 0
    assert executed["deleted_socket_ownership_count"] == 1
    assert executed["deleted_replay_worker_lease_count"] == 1
    assert await db.websocket_socket_ownership.count_documents({}) == 0
    assert await db.websocket_replay_worker_leases.count_documents({}) == 0


@pytest.mark.asyncio
async def test_op_01_dashboard_summary_reports_replay_health_and_alerts():
    db = InMemoryDatabase()
    service = ReplayCertificationService(db)
    await db.replay_certification_reports.insert_one(
        {
            "_id": "failed-cert",
            "status": "failed",
            "created_at": utc_now(),
        }
    )
    await db.websocket_replay_log.insert_one({"_id": "ws-1", "ws_sequence": 1})
    await db.websocket_replay_log.insert_one({"_id": "ws-2", "ws_sequence": 2})
    await db.websocket_replay_cursors.insert_one(
        {
            "_id": "cursor-1",
            "client_id": "device-1",
            "aggregate_id": "ws:user:sess:staff",
            "last_ack_sequence": 1,
        }
    )

    summary = await service.dashboard_summary()

    assert summary["status"] == "degraded"
    assert summary["replay_log_count"] == 2
    assert summary["replay_cursor_count"] == 1
    assert summary["max_replay_sequence"] == 2
    assert summary["minimum_cursor_sequence"] == 1
    assert summary["replay_lag"] == 1
    assert summary["latest_certification_status"] == "failed"
    assert {alert["code"] for alert in summary["alerts"]} == {"REPLAY_CERTIFICATION_FAILED"}


@pytest.mark.asyncio
async def test_ea_01_erp_snapshot_history_is_replay_derived_and_immutable():
    db = InMemoryDatabase()
    event_service = EventService(db)
    projection_service = ProjectionService(db)
    payload = {
        "session_id": "sess-erp-history",
        "item_id": "ITEM-ERP-HISTORY",
        "batch_id": "BATCH-ERP-HISTORY",
        "count_line": {
            "id": "line-erp-history",
            "session_id": "sess-erp-history",
            "item_code": "ITEM-ERP-HISTORY",
            "item_name": "ERP History Widget",
            "batch_id": "BATCH-ERP-HISTORY",
            "counted_qty": 5,
            "erp_qty": 4,
            "current_sql_qty": 4,
            "snapshot_version": "snap-v1",
            "snapshot_timestamp": utc_now(),
            "source_sync_id": "sync-v1",
            "baseline_hash": "baseline-v1",
        },
        "after": {
            "id": "line-erp-history",
            "session_id": "sess-erp-history",
            "item_code": "ITEM-ERP-HISTORY",
            "item_name": "ERP History Widget",
            "batch_id": "BATCH-ERP-HISTORY",
            "counted_qty": 5,
            "erp_qty": 4,
            "current_sql_qty": 4,
            "snapshot_version": "snap-v1",
            "snapshot_timestamp": utc_now(),
            "source_sync_id": "sync-v1",
            "baseline_hash": "baseline-v1",
        },
        "delta": {"counted_qty": 5, "damaged_qty": 0, "serial_count": 0},
    }

    await event_service.append_event(
        aggregate_id="ITEM-ERP-HISTORY",
        event_type="SCAN_ADDED",
        payload=payload,
        metadata={"event_idempotency_key": "erp-history-1"},
        expected_version=0,
    )

    initial_history = await db.erp_snapshot_history.find({}).to_list(length=10)
    assert len(initial_history) == 1
    assert initial_history[0]["snapshot_version"] == "snap-v1"
    assert initial_history[0]["source_sync_id"] == "sync-v1"
    assert initial_history[0]["stale_snapshot"] is False

    result = await projection_service.rebuild_from_event_log(
        clear_existing=True,
        checkpoint_interval=1,
        rebuild_owner="erp-history-rebuild",
    )
    rebuilt_history = await db.erp_snapshot_history.find({}).to_list(length=10)

    assert result["semantic_validation"]["passed"] is True
    assert len(rebuilt_history) == 1
    assert rebuilt_history[0]["_id"] == initial_history[0]["_id"]
    assert rebuilt_history[0]["source_event_id"] == initial_history[0]["source_event_id"]
