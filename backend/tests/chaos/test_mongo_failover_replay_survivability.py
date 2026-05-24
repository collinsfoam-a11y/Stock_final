from __future__ import annotations

import pytest

from backend.core.websocket_manager import WebSocketManager
from backend.services.event_service import EventService
from backend.services.projection_service import ProjectionService, PROJECTION_VERSION
from backend.tests.chaos.replay_chaos_helpers import (
    ReplayContinuityValidator,
    scan_event,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_mf_01_mongo_failover_during_replay_continuation_resumes_checkpoint():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    validator = ReplayContinuityValidator(db)
    resume_token = "mf-01-resume"
    event_one = scan_event(
        event_id="mf-01-event-1",
        global_sequence=1,
        aggregate_sequence=1,
        counted_qty=2,
        line_id="line-mf-01-1",
    )
    event_two = scan_event(
        event_id="mf-01-event-2",
        global_sequence=2,
        aggregate_sequence=2,
        counted_qty=3,
        line_id="line-mf-01-2",
    )
    await db.event_log.insert_one(event_one)
    await db.event_log.insert_one(event_two)
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-chaos",
            "item_code": "ITEM-CHAOS",
            "counted_qty": 99,
            "projection_version": "stale-live",
        }
    )

    shadow_map = service._shadow_collection_map(resume_token)
    await db[shadow_map["items_snapshot"]].insert_one(
        {
            "session_id": "sess-chaos",
            "item_id": "ITEM-CHAOS",
            "item_code": "ITEM-CHAOS",
            "counted_qty": 2,
            "damaged_qty": 0,
            "serial_count": 0,
            "projection_version": PROJECTION_VERSION,
        }
    )
    await db[shadow_map["batch_records"]].insert_one(
        {
            "session_id": "sess-chaos",
            "item_id": "ITEM-CHAOS",
            "item_code": "ITEM-CHAOS",
            "batch_id": "BATCH-CHAOS",
            "batch_no": "BATCH-CHAOS",
            "counted_qty": 2,
            "damaged_qty": 0,
            "projection_version": PROJECTION_VERSION,
        }
    )
    await db[shadow_map["event_applied"]].insert_one(
        {
            "event_id": "mf-01-event-1",
            "event_type": "SCAN_ADDED",
            "aggregate_id": "ITEM-CHAOS",
            "session_id": "sess-chaos",
            "status": "applied",
            "projection_version": PROJECTION_VERSION,
        }
    )
    await db.projection_replay_checkpoints.insert_one(
        {
            "_id": f"{resume_token}:global",
            "rebuild_id": resume_token,
            "resume_token": resume_token,
            "session_id": None,
            "status": "interrupted",
            "shadow_map": shadow_map,
            "event_window_hash": service._event_window_hash([event_one, event_two]),
            "processed_events": 1,
            "applied_events": 1,
            "total_events": 2,
            "last_event_id": "mf-01-event-1",
            "last_global_sequence": 1,
            "projection_version": PROJECTION_VERSION,
        }
    )

    result = await service.rebuild_from_event_log(
        clear_existing=True,
        resume_token=resume_token,
        checkpoint_interval=1,
        rebuild_owner="mf-01-resume-worker",
    )

    snapshot = await db.items_snapshot.find_one(
        {"session_id": "sess-chaos", "item_code": "ITEM-CHAOS"}
    )
    checkpoint = await db.projection_replay_checkpoints.find_one({"resume_token": resume_token})
    applied = await db.event_applied.find({}).to_list(length=10)
    validation = await validator.assert_projection_semantics_pass(service, [event_one, event_two])

    assert result["resumed"] is True
    assert result["checkpoint_processed_events"] == 2
    assert result["last_global_sequence"] == 2
    assert checkpoint["status"] == "completed"
    assert checkpoint["processed_events"] == 2
    assert snapshot["counted_qty"] == pytest.approx(5)
    assert sorted(doc["event_id"] for doc in applied) == ["mf-01-event-1", "mf-01-event-2"]
    assert validation["passed"] is True


@pytest.mark.asyncio
async def test_mf_02_mongo_failover_during_ack_persistence_reconnects_without_regression(
    monkeypatch,
):
    db = InMemoryDatabase()
    manager = WebSocketManager()
    manager.attach_replay_store(db)
    validator = ReplayContinuityValidator(db)
    await manager.broadcast_to_session({"type": "scan_created"}, "sess-chaos")
    await manager.broadcast_to_session({"type": "scan_verified"}, "sess-chaos")

    original_insert = db.websocket_replay_cursors.insert_one
    state = {"fail": True}

    async def fail_once_insert(document, *args, **kwargs):
        if state["fail"]:
            state["fail"] = False
            raise RuntimeError("mongo failover during ack persistence")
        return await original_insert(document, *args, **kwargs)

    monkeypatch.setattr(db.websocket_replay_cursors, "insert_one", fail_once_insert)

    with pytest.raises(RuntimeError, match="mongo failover during ack persistence"):
        await manager.acknowledge_replay(
            client_id="device-mf-02",
            user_id="user-mf-02",
            session_id="sess-chaos",
            role="staff",
            ws_sequence=2,
        )

    assert await db.websocket_replay_cursors.count_documents({}) == 0

    from unittest.mock import AsyncMock
    from fastapi import WebSocket

    reconnect = AsyncMock(spec=WebSocket)
    await manager.connect(
        reconnect,
        "user-mf-02",
        "sess-chaos",
        role="staff",
        replay_after=0,
        client_id="device-mf-02",
    )
    ack = await manager.acknowledge_replay(
        client_id="device-mf-02",
        user_id="user-mf-02",
        session_id="sess-chaos",
        role="staff",
        ws_sequence=2,
    )
    stale_ack = await manager.acknowledge_replay(
        client_id="device-mf-02",
        user_id="user-mf-02",
        session_id="sess-chaos",
        role="staff",
        ws_sequence=1,
    )

    await validator.assert_websocket_log_contiguous()
    await validator.assert_cursor(
        manager,
        client_id="device-mf-02",
        user_id="user-mf-02",
        session_id="sess-chaos",
        role="staff",
        expected_sequence=2,
    )
    assert [call.args[0]["ws_sequence"] for call in reconnect.send_json.await_args_list] == [1, 2]
    assert ack["last_ack_sequence"] == 2
    assert stale_ack["idempotent"] is True


@pytest.mark.asyncio
async def test_mf_03_mongo_failover_during_projection_swap_preserves_live_projection(
    monkeypatch,
):
    db = InMemoryDatabase()
    service = ProjectionService(db)
    event = scan_event(
        event_id="mf-03-event-1",
        global_sequence=1,
        aggregate_sequence=1,
        counted_qty=3,
        line_id="line-mf-03-1",
    )
    await db.event_log.insert_one(event)
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-chaos",
            "item_code": "ITEM-CHAOS",
            "counted_qty": 99,
            "projection_version": "live-before-swap",
        }
    )

    original_copy = ProjectionService._copy_shadow_collection_to_live
    state = {"failed": False}

    async def fail_during_items_copy(self, *args, **kwargs):
        copied = await original_copy(self, *args, **kwargs)
        if kwargs.get("collection_name") == "items_snapshot" and not state["failed"]:
            state["failed"] = True
            raise RuntimeError("mongo failover during projection swap")
        return copied

    monkeypatch.setattr(
        ProjectionService,
        "_copy_shadow_collection_to_live",
        fail_during_items_copy,
    )

    with pytest.raises(RuntimeError, match="mongo failover during projection swap"):
        await service.rebuild_from_event_log(
            clear_existing=True,
            checkpoint_interval=1,
            rebuild_owner="mf-03-swap-worker",
        )

    live_after_failure = await db.items_snapshot.find_one(
        {"session_id": "sess-chaos", "item_code": "ITEM-CHAOS"}
    )
    failed_checkpoint = await db.projection_replay_checkpoints.find_one({})

    assert live_after_failure["counted_qty"] == pytest.approx(99)
    assert failed_checkpoint["status"] == "failed"

    result = await service.rebuild_from_event_log(
        clear_existing=True,
        checkpoint_interval=1,
        rebuild_owner="mf-03-retry-worker",
    )
    live_after_retry = await db.items_snapshot.find_one(
        {"session_id": "sess-chaos", "item_code": "ITEM-CHAOS"}
    )

    assert result["swap_validated"] is True
    assert live_after_retry["counted_qty"] == pytest.approx(3)


@pytest.mark.asyncio
async def test_mf_04_mongo_failover_during_sequence_allocation_rolls_back_sequences(
    monkeypatch,
):
    db = InMemoryDatabase()
    service = EventService(db)
    validator = ReplayContinuityValidator(db)
    original_insert = db.event_log.insert_one
    state = {"fail": True}

    async def fail_event_insert_once(document, *args, **kwargs):
        if state["fail"]:
            state["fail"] = False
            raise RuntimeError("mongo failover after sequence allocation")
        return await original_insert(document, *args, **kwargs)

    monkeypatch.setattr(db.event_log, "insert_one", fail_event_insert_once)
    payload = scan_event(
        event_id="mf-04-event-1",
        global_sequence=1,
        aggregate_sequence=1,
        counted_qty=4,
        line_id="line-mf-04-1",
    )["payload"]

    with pytest.raises(RuntimeError, match="mongo failover after sequence allocation"):
        await service.append_event(
            aggregate_id="ITEM-CHAOS",
            event_type="SCAN_ADDED",
            payload=payload,
            metadata={"event_idempotency_key": "mf-04-idempotency"},
            expected_version=0,
        )

    assert await db.event_log.count_documents({}) == 0
    assert await db.event_sequences.count_documents({}) == 0

    event = await service.append_event(
        aggregate_id="ITEM-CHAOS",
        event_type="SCAN_ADDED",
        payload=payload,
        metadata={"event_idempotency_key": "mf-04-idempotency"},
        expected_version=0,
    )

    assert event["global_sequence"] == 1
    assert event["aggregate_sequence"] == 1
    await validator.assert_event_sequence_state(
        expected_global=1,
        aggregate_id="ITEM-CHAOS",
        expected_aggregate=1,
    )
