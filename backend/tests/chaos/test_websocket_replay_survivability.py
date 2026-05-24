from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocket

from backend.core.websocket_manager import WebSocketManager
from backend.tests.chaos.replay_chaos_helpers import (
    ReplayContinuityValidator,
    sent_sequences,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


class FailingRedisFanout:
    async def publish(self, *_args, **_kwargs):
        raise RuntimeError("redis outage during replay fanout")


@pytest.mark.asyncio
async def test_rw_01_redis_outage_during_replay_fanout_preserves_reconnect_replay():
    db = InMemoryDatabase()
    manager = WebSocketManager()
    manager.attach_replay_store(db)
    manager._redis = FailingRedisFanout()
    validator = ReplayContinuityValidator(db)

    live_socket = AsyncMock(spec=WebSocket)
    await manager.connect(
        live_socket,
        "user-rw-01",
        "sess-rw-01",
        role="staff",
        replay_after=0,
        client_id="device-rw-01",
    )

    await manager.broadcast_to_session({"type": "scan_created"}, "sess-rw-01")
    await manager.acknowledge_replay(
        client_id="device-rw-01",
        user_id="user-rw-01",
        session_id="sess-rw-01",
        role="staff",
        ws_sequence=1,
    )
    live_socket.send_json.reset_mock()
    await manager.broadcast_to_session({"type": "scan_verified"}, "sess-rw-01")

    reconnect = AsyncMock(spec=WebSocket)
    await manager.connect(
        reconnect,
        "user-rw-01",
        "sess-rw-01",
        role="staff",
        replay_after=0,
        client_id="device-rw-01",
    )
    ack = await manager.acknowledge_replay(
        client_id="device-rw-01",
        user_id="user-rw-01",
        session_id="sess-rw-01",
        role="staff",
        ws_sequence=2,
    )

    await validator.assert_websocket_log_contiguous()
    await validator.assert_cursor(
        manager,
        client_id="device-rw-01",
        user_id="user-rw-01",
        session_id="sess-rw-01",
        role="staff",
        expected_sequence=2,
    )
    assert sent_sequences(live_socket) == [2]
    assert sent_sequences(reconnect) == [2]
    assert ack["last_ack_sequence"] == 2


@pytest.mark.asyncio
async def test_rw_02_reconnect_storm_isolates_multi_user_session_role_lineage():
    db = InMemoryDatabase()
    manager = WebSocketManager()
    manager.attach_replay_store(db)
    validator = ReplayContinuityValidator(db)

    await manager.broadcast_to_session({"type": "session-a"}, "session-a")
    await manager.broadcast_to_session({"type": "session-b"}, "session-b")
    await manager.broadcast_to_roles({"type": "supervisor-only"}, {"supervisor"})
    await manager.broadcast_to_roles({"type": "staff-only"}, {"staff"})
    await manager.send_personal_message({"type": "user-a-only"}, "user-a")

    user_a = AsyncMock(spec=WebSocket)
    user_b = AsyncMock(spec=WebSocket)
    await manager.connect(
        user_a,
        "user-a",
        "session-a",
        role="staff",
        replay_after=0,
        client_id="device-a",
    )
    await manager.connect(
        user_b,
        "user-b",
        "session-b",
        role="supervisor",
        replay_after=0,
        client_id="device-b",
    )
    await manager.acknowledge_replay(
        client_id="device-a",
        user_id="user-a",
        session_id="session-a",
        role="staff",
        ws_sequence=5,
    )
    await manager.acknowledge_replay(
        client_id="device-b",
        user_id="user-b",
        session_id="session-b",
        role="supervisor",
        ws_sequence=3,
    )
    initial_user_a_sequences = sent_sequences(user_a)
    initial_user_b_sequences = sent_sequences(user_b)
    user_a.send_json.reset_mock()
    user_b.send_json.reset_mock()

    await manager.broadcast_to_session({"type": "session-a-late"}, "session-a")
    await manager.broadcast_to_session({"type": "session-b-late"}, "session-b")
    await manager.broadcast_to_roles({"type": "staff-late"}, {"staff"})

    user_a_reconnect = AsyncMock(spec=WebSocket)
    user_b_reconnect = AsyncMock(spec=WebSocket)
    await manager.connect(
        user_a_reconnect,
        "user-a",
        "session-a",
        role="staff",
        replay_after=0,
        client_id="device-a",
    )
    await manager.connect(
        user_b_reconnect,
        "user-b",
        "session-b",
        role="supervisor",
        replay_after=0,
        client_id="device-b",
    )

    await validator.assert_websocket_log_contiguous()
    await validator.assert_cursor(
        manager,
        client_id="device-a",
        user_id="user-a",
        session_id="session-a",
        role="staff",
        expected_sequence=5,
    )
    await validator.assert_cursor(
        manager,
        client_id="device-b",
        user_id="user-b",
        session_id="session-b",
        role="supervisor",
        expected_sequence=3,
    )
    assert initial_user_a_sequences == [1, 4, 5]
    assert initial_user_b_sequences == [2, 3]
    assert sent_sequences(user_a_reconnect) == [6, 8]
    assert sent_sequences(user_b_reconnect) == [7]
    assert 2 not in initial_user_a_sequences
    assert 1 not in initial_user_b_sequences
    assert 4 not in sent_sequences(user_b_reconnect)


@pytest.mark.asyncio
async def test_rw_03_split_brain_replay_fanout_keeps_ack_cursor_monotonic():
    db = InMemoryDatabase()
    worker_a = WebSocketManager(worker_id="worker-a")
    worker_b = WebSocketManager(worker_id="worker-b")
    worker_a.attach_replay_store(db)
    worker_b.attach_replay_store(db)
    validator = ReplayContinuityValidator(db)

    socket_a = AsyncMock(spec=WebSocket)
    socket_b = AsyncMock(spec=WebSocket)
    await worker_a.connect(
        socket_a,
        "user-rw-03",
        "sess-rw-03",
        role="staff",
        replay_after=0,
        client_id="device-rw-03",
    )
    await worker_b.connect(
        socket_b,
        "user-rw-03",
        "sess-rw-03",
        role="staff",
        replay_after=0,
        client_id="device-rw-03",
    )

    await worker_a.broadcast_to_session({"type": "worker-a-event"}, "sess-rw-03")
    await worker_b.broadcast_to_session({"type": "worker-b-event"}, "sess-rw-03")

    ack_results = []
    for manager, sequence in (
        (worker_a, 1),
        (worker_b, 2),
        (worker_a, 1),
        (worker_b, 2),
        (worker_a, 1),
    ):
        ack_results.append(
            await manager.acknowledge_replay(
                client_id="device-rw-03",
                user_id="user-rw-03",
                session_id="sess-rw-03",
                role="staff",
                ws_sequence=sequence,
            )
        )

    reconnect = AsyncMock(spec=WebSocket)
    await worker_b.connect(
        reconnect,
        "user-rw-03",
        "sess-rw-03",
        role="staff",
        replay_after=0,
        client_id="device-rw-03",
    )

    await validator.assert_websocket_log_contiguous()
    await validator.assert_cursor(
        worker_a,
        client_id="device-rw-03",
        user_id="user-rw-03",
        session_id="sess-rw-03",
        role="staff",
        expected_sequence=2,
    )
    assert sent_sequences(socket_a) == []
    assert sent_sequences(socket_b) == [2]
    assert sent_sequences(reconnect) == []
    assert ack_results[-1]["idempotent"] is True
    assert worker_a.stale_socket_delivery_suppressed == 1


@pytest.mark.asyncio
async def test_mp_01_cross_process_socket_ownership_suppresses_stale_worker_delivery():
    db = InMemoryDatabase()
    stale_worker = WebSocketManager(worker_id="stale-worker")
    current_worker = WebSocketManager(worker_id="current-worker")
    stale_worker.attach_replay_store(db)
    current_worker.attach_replay_store(db)

    stale_socket = AsyncMock(spec=WebSocket)
    current_socket = AsyncMock(spec=WebSocket)
    await stale_worker.connect(
        stale_socket,
        "user-mp-01",
        "sess-mp-01",
        role="staff",
        replay_after=0,
        client_id="device-mp-01",
    )
    await current_worker.connect(
        current_socket,
        "user-mp-01",
        "sess-mp-01",
        role="staff",
        replay_after=0,
        client_id="device-mp-01",
    )

    await stale_worker.broadcast_to_session({"type": "stale-worker-event"}, "sess-mp-01")
    await current_worker.broadcast_to_session({"type": "current-worker-event"}, "sess-mp-01")

    owner = await db.websocket_socket_ownership.find_one(
        {"client_id": "device-mp-01", "aggregate_id": "ws:user-mp-01:sess-mp-01:staff"}
    )

    assert owner["worker_id"] == "current-worker"
    assert owner["previous_worker_id"] == "stale-worker"
    assert current_worker.distributed_socket_evictions == 1
    assert stale_worker.stale_socket_delivery_suppressed == 1
    assert sent_sequences(stale_socket) == []
    assert sent_sequences(current_socket) == [2]


@pytest.mark.asyncio
async def test_mp_02_multi_node_replay_coordination_keeps_cursor_monotonic():
    db = InMemoryDatabase()
    workers = [
        WebSocketManager(worker_id="mp-worker-a"),
        WebSocketManager(worker_id="mp-worker-b"),
        WebSocketManager(worker_id="mp-worker-c"),
    ]
    for worker in workers:
        worker.attach_replay_store(db)

    sockets = [AsyncMock(spec=WebSocket) for _ in workers]
    for worker, socket in zip(workers, sockets, strict=True):
        await worker.connect(
            socket,
            "user-mp-02",
            "sess-mp-02",
            role="staff",
            replay_after=0,
            client_id="device-mp-02",
        )

    await workers[0].broadcast_to_session({"type": "from-a"}, "sess-mp-02")
    await workers[1].broadcast_to_session({"type": "from-b"}, "sess-mp-02")
    await workers[2].broadcast_to_session({"type": "from-c"}, "sess-mp-02")

    ack_results = []
    for worker, sequence in (
        (workers[0], 1),
        (workers[1], 3),
        (workers[2], 2),
        (workers[0], 3),
    ):
        ack_results.append(
            await worker.acknowledge_replay(
                client_id="device-mp-02",
                user_id="user-mp-02",
                session_id="sess-mp-02",
                role="staff",
                ws_sequence=sequence,
            )
        )

    cursor = await workers[2].get_replay_cursor(
        client_id="device-mp-02",
        user_id="user-mp-02",
        session_id="sess-mp-02",
        role="staff",
    )

    assert cursor["last_ack_sequence"] == 3
    assert ack_results[2]["idempotent"] is True
    assert sent_sequences(sockets[0]) == []
    assert sent_sequences(sockets[1]) == []
    assert sent_sequences(sockets[2]) == [3]


@pytest.mark.asyncio
async def test_mp_03_distributed_replay_worker_lease_blocks_stale_owner_and_rebalances():
    db = InMemoryDatabase()
    worker_a = WebSocketManager(worker_id="lease-worker-a")
    worker_b = WebSocketManager(worker_id="lease-worker-b")
    worker_a.attach_replay_store(db)
    worker_b.attach_replay_store(db)

    lease_a = await worker_a.acquire_replay_worker_lease(
        scope_id="session:sess-mp-03",
        owner="replay-owner-a",
        lease_seconds=30,
    )

    with pytest.raises(RuntimeError, match="held by replay-owner-a"):
        await worker_b.acquire_replay_worker_lease(
            scope_id="session:sess-mp-03",
            owner="replay-owner-b",
            lease_seconds=30,
        )

    await db.websocket_replay_worker_leases.update_one(
        {"_id": lease_a["_id"]},
        {"$set": {"expires_at": lease_a["expires_at"].replace(year=2000)}},
    )
    lease_b = await worker_b.acquire_replay_worker_lease(
        scope_id="session:sess-mp-03",
        owner="replay-owner-b",
        lease_seconds=30,
    )

    with pytest.raises(RuntimeError, match="stale or expired"):
        await worker_a.renew_replay_worker_lease(lease_a)

    renewed_b = await worker_b.renew_replay_worker_lease(lease_b)
    await worker_b.release_replay_worker_lease(renewed_b)
    remaining = await db.websocket_replay_worker_leases.find_one({"_id": lease_b["_id"]})

    assert lease_b["owner"] == "replay-owner-b"
    assert int(lease_b["fencing_token"]) > int(lease_a["fencing_token"])
    assert remaining is None


@pytest.mark.asyncio
async def test_replay_cursor_compaction_prunes_only_below_minimum_durable_cursor():
    db = InMemoryDatabase()
    manager = WebSocketManager()
    manager.attach_replay_store(db)
    validator = ReplayContinuityValidator(db)

    for index in range(1, 11):
        await manager.broadcast_to_session({"type": "event", "value": index}, "sess-compact")

    await manager.acknowledge_replay(
        client_id="device-compact-a",
        user_id="user-compact-a",
        session_id="sess-compact",
        role="staff",
        ws_sequence=8,
    )
    await manager.acknowledge_replay(
        client_id="device-compact-b",
        user_id="user-compact-b",
        session_id="sess-compact",
        role="staff",
        ws_sequence=5,
    )

    result = await manager.compact_replay_log(safety_margin_sequences=1, max_delete=100)
    remaining = await validator.websocket_log_sequences()
    reconnect = AsyncMock(spec=WebSocket)
    await manager.connect(
        reconnect,
        "user-compact-b",
        "sess-compact",
        role="staff",
        replay_after=0,
        client_id="device-compact-b",
    )

    assert result["watermark_sequence"] == 4
    assert result["deleted_count"] == 4
    assert remaining == [5, 6, 7, 8, 9, 10]
    assert sent_sequences(reconnect) == [6, 7, 8, 9, 10]


@pytest.mark.asyncio
async def test_replay_cursor_compaction_refuses_prune_without_durable_cursors():
    db = InMemoryDatabase()
    manager = WebSocketManager()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "event", "value": 1}, "sess-compact")

    result = await manager.compact_replay_log(safety_margin_sequences=0, max_delete=100)
    remaining = await db.websocket_replay_log.find({}).to_list(length=10)

    assert result["safe_to_compact"] is False
    assert result["reason"] == "no_durable_cursors"
    assert result["deleted_count"] == 0
    assert len(remaining) == 1


@pytest.mark.asyncio
async def test_es_03_reconnect_storm_load_harness_preserves_ack_monotonicity():
    db = InMemoryDatabase()
    manager = WebSocketManager(worker_id="load-worker")
    manager.attach_replay_store(db)

    for index in range(1, 11):
        await manager.broadcast_to_session({"type": "load-event", "value": index}, "sess-load")

    clients = [
        (f"load-device-{index}", f"load-user-{index}", AsyncMock(spec=WebSocket))
        for index in range(200)
    ]
    for client_id, user_id, socket in clients:
        await manager.connect(
            socket,
            user_id,
            "sess-load",
            role="staff",
            replay_after=0,
            client_id=client_id,
        )

    ack_tasks = []
    for client_id, user_id, _socket in clients:
        ack_tasks.extend(
            [
                manager.acknowledge_replay(
                    client_id=client_id,
                    user_id=user_id,
                    session_id="sess-load",
                    role="staff",
                    ws_sequence=10,
                ),
                manager.acknowledge_replay(
                    client_id=client_id,
                    user_id=user_id,
                    session_id="sess-load",
                    role="staff",
                    ws_sequence=5,
                ),
            ]
        )

    results = await asyncio.gather(*ack_tasks)
    cursor_docs = await db.websocket_replay_cursors.find({}).to_list(length=500)

    assert len(cursor_docs) == 200
    assert all(cursor["last_ack_sequence"] == 10 for cursor in cursor_docs)
    assert all(result["acknowledged"] is True for result in results)
    assert sum(1 for result in results if result.get("idempotent") is True) == 200
    assert manager.replay_acknowledgements == 400
