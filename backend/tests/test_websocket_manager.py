"""
Unit tests for WebSocket Manager (Core)
"""

from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocket

from backend.core.websocket_manager import WebSocketManager, WebSocketReplayPersistenceError
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.fixture
def manager():
    return WebSocketManager()


@pytest.fixture
def mock_websocket():
    ws = AsyncMock(spec=WebSocket)
    return ws


@pytest.mark.asyncio
async def test_connect(manager, mock_websocket):
    user_id = "user1"
    session_id = "session1"

    await manager.connect(mock_websocket, user_id, session_id)

    assert user_id in manager.active_connections
    assert mock_websocket in manager.active_connections[user_id]
    assert session_id in manager.session_connections
    assert mock_websocket in manager.session_connections[session_id]
    mock_websocket.accept.assert_called_once()


@pytest.mark.asyncio
async def test_disconnect(manager, mock_websocket):
    user_id = "user1"
    session_id = "session1"
    await manager.connect(mock_websocket, user_id, session_id)

    manager.disconnect(mock_websocket, user_id, session_id)

    assert user_id not in manager.active_connections
    assert session_id not in manager.session_connections


@pytest.mark.asyncio
async def test_send_personal_message(manager, mock_websocket):
    user_id = "user1"
    await manager.connect(mock_websocket, user_id)

    message = {"type": "test", "data": "hello"}
    await manager.send_personal_message(message, user_id)

    mock_websocket.send_json.assert_called_with(message)


@pytest.mark.asyncio
async def test_broadcast_to_session(manager):
    ws1 = AsyncMock(spec=WebSocket)
    ws2 = AsyncMock(spec=WebSocket)
    session_id = "session1"

    await manager.connect(ws1, "user1", session_id)
    await manager.connect(ws2, "user2", session_id)

    message = {"type": "update", "data": "new_count"}
    await manager.broadcast_to_session(message, session_id)

    ws1.send_json.assert_called_with(message)
    ws2.send_json.assert_called_with(message)


@pytest.mark.asyncio
async def test_broadcast_to_roles_only_targets_matching_users(manager):
    ws1 = AsyncMock(spec=WebSocket)
    ws2 = AsyncMock(spec=WebSocket)

    await manager.connect(ws1, "supervisor1")
    await manager.connect(ws2, "staff1")
    manager.user_roles["supervisor1"] = "supervisor"
    manager.user_roles["staff1"] = "staff"

    message = {"type": "dashboard_refresh_requested", "payload": {"event": "count_line_created"}}
    await manager.broadcast_to_roles(message, {"supervisor", "admin"})

    ws1.send_json.assert_called_with(message)
    ws2.send_json.assert_not_called()


@pytest.mark.asyncio
async def test_broadcast_persists_replay_sequence_when_store_attached(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)
    ws = AsyncMock(spec=WebSocket)

    await manager.connect(ws, "user1", "session1", role="staff")

    message = {"type": "update", "data": "new_count"}
    await manager.broadcast_to_session(message, "session1")

    sent = ws.send_json.await_args.args[0]
    stored = await db.websocket_replay_log.find_one({"ws_sequence": 1})

    assert sent["type"] == "update"
    assert sent["ws_sequence"] == 1
    assert sent["replay"]["ws_sequence"] == 1
    assert sent["replay"]["replayed"] is False
    assert stored["target"] == "session"
    assert stored["session_id"] == "session1"
    assert stored["payload"] == message


@pytest.mark.asyncio
async def test_connect_replays_missed_session_messages(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session1")

    ws = AsyncMock(spec=WebSocket)
    await manager.connect(ws, "user1", "session1", role="staff", replay_after=0)

    sent = ws.send_json.await_args.args[0]

    assert sent["type"] == "scan_created"
    assert sent["ws_sequence"] == 1
    assert sent["replay"]["replayed"] is True
    assert manager.replay_deliveries == 1


@pytest.mark.asyncio
async def test_replay_filters_by_session_scope(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session-a")

    ws = AsyncMock(spec=WebSocket)
    await manager.connect(ws, "user1", "session-b", role="staff", replay_after=0)

    ws.send_json.assert_not_called()
    assert manager.replay_misses == 1


@pytest.mark.asyncio
async def test_reconnect_replays_ordered_messages_after_cursor(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created", "value": 1}, "session1")
    await manager.broadcast_to_session({"type": "scan_updated", "value": 2}, "session1")
    await manager.broadcast_to_session({"type": "other_session", "value": 3}, "session2")
    await manager.broadcast_to_session({"type": "scan_verified", "value": 4}, "session1")

    ws = AsyncMock(spec=WebSocket)
    await manager.connect(ws, "user1", "session1", role="staff", replay_after=1)

    replayed = [call.args[0] for call in ws.send_json.await_args_list]

    assert [message["type"] for message in replayed] == ["scan_updated", "scan_verified"]
    assert [message["ws_sequence"] for message in replayed] == [2, 4]
    assert all(message["replay"]["replayed"] is True for message in replayed)
    assert manager.replay_deliveries == 2


@pytest.mark.asyncio
async def test_replay_delivery_failure_stops_reconnect_replay(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session1")
    await manager.broadcast_to_session({"type": "scan_updated"}, "session1")

    ws = AsyncMock(spec=WebSocket)
    ws.send_json.side_effect = RuntimeError("client backpressure")

    await manager.connect(ws, "user1", "session1", role="staff", replay_after=0)

    assert ws.send_json.await_count == 1
    assert manager.delivery_failures == 1
    assert manager.replay_deliveries == 0


@pytest.mark.asyncio
async def test_replay_persistence_failure_fails_closed_without_local_delivery(manager, mock_websocket):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)
    await manager.connect(mock_websocket, "user1", "session1", role="staff")

    async def fail_insert(*_args, **_kwargs):
        raise RuntimeError("mongo failover")

    db.websocket_replay_log.insert_one = fail_insert

    with pytest.raises(WebSocketReplayPersistenceError):
        await manager.broadcast_to_session({"type": "scan_created"}, "session1")

    mock_websocket.send_json.assert_not_called()
    assert manager.replay_persist_failures == 1


@pytest.mark.asyncio
async def test_replay_ack_persists_monotonic_cursor(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session1")
    await manager.broadcast_to_session({"type": "scan_updated"}, "session1")

    first = await manager.acknowledge_replay(
        client_id="device-1",
        user_id="user1",
        session_id="session1",
        role="staff",
        ws_sequence=2,
    )
    stale = await manager.acknowledge_replay(
        client_id="device-1",
        user_id="user1",
        session_id="session1",
        role="staff",
        ws_sequence=1,
    )
    cursor = await db.websocket_replay_cursors.find_one(
        {"client_id": "device-1", "aggregate_id": "ws:user1:session1:staff"}
    )

    assert first["acknowledged"] is True
    assert first["last_ack_sequence"] == 2
    assert stale["acknowledged"] is True
    assert stale["idempotent"] is True
    assert stale["last_ack_sequence"] == 2
    assert cursor["last_ack_sequence"] == 2
    assert cursor["last_ack_event_id"]


@pytest.mark.asyncio
async def test_connect_prefers_durable_cursor_over_stale_requested_cursor(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session1")
    await manager.broadcast_to_session({"type": "scan_updated"}, "session1")
    await manager.acknowledge_replay(
        client_id="device-1",
        user_id="user1",
        session_id="session1",
        role="staff",
        ws_sequence=2,
    )
    await manager.broadcast_to_session({"type": "scan_verified"}, "session1")

    ws = AsyncMock(spec=WebSocket)
    await manager.connect(
        ws,
        "user1",
        "session1",
        role="staff",
        replay_after=0,
        client_id="device-1",
    )

    replayed = [call.args[0] for call in ws.send_json.await_args_list]

    assert [message["type"] for message in replayed] == ["scan_verified"]
    assert replayed[0]["ws_sequence"] == 3


@pytest.mark.asyncio
async def test_replay_ack_rejects_unauthorized_sequence(manager):
    db = InMemoryDatabase()
    manager.attach_replay_store(db)

    await manager.broadcast_to_session({"type": "scan_created"}, "session-a")

    result = await manager.acknowledge_replay(
        client_id="device-1",
        user_id="user1",
        session_id="session-b",
        role="staff",
        ws_sequence=1,
    )
    cursor = await db.websocket_replay_cursors.find_one({"client_id": "device-1"})

    assert result == {"acknowledged": False, "reason": "unauthorized_sequence"}
    assert cursor is None
    assert manager.replay_ack_rejections == 1
