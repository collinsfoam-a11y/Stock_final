from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Optional
from unittest.mock import AsyncMock

import pytest
from fastapi import WebSocket

from backend.core.websocket_manager import WebSocketManager
from backend.tests.utils.in_memory_db import InMemoryDatabase


@dataclass
class ReconnectIdentity:
    client_id: str = "device-chaos-1"
    user_id: str = "user-chaos-1"
    session_id: str = "session-chaos-1"
    role: str = "staff"


class ReconnectStormHarness:
    def __init__(self) -> None:
        self.db = InMemoryDatabase()
        self.manager = WebSocketManager()
        self.manager.attach_replay_store(self.db)
        self.identity = ReconnectIdentity()

    async def seed_session_messages(self, count: int, *, start: int = 1) -> None:
        for index in range(start, start + count):
            await self.manager.broadcast_to_session(
                {
                    "type": "chaos_event",
                    "value": index,
                },
                self.identity.session_id,
            )

    async def connect(self, *, requested_cursor: Optional[int]) -> AsyncMock:
        websocket = AsyncMock(spec=WebSocket)
        await self.manager.connect(
            websocket,
            self.identity.user_id,
            self.identity.session_id,
            role=self.identity.role,
            replay_after=requested_cursor,
            client_id=self.identity.client_id,
        )
        return websocket

    async def ack(self, sequence: int) -> dict:
        return await self.manager.acknowledge_replay(
            client_id=self.identity.client_id,
            user_id=self.identity.user_id,
            session_id=self.identity.session_id,
            role=self.identity.role,
            ws_sequence=sequence,
        )

    async def cursor(self) -> Optional[dict]:
        return await self.db.websocket_replay_cursors.find_one(
            {
                "client_id": self.identity.client_id,
                "aggregate_id": (
                    f"ws:{self.identity.user_id}:{self.identity.session_id}:"
                    f"{self.identity.role}"
                ),
            }
        )


def sent_sequences(websocket: AsyncMock) -> list[int]:
    return [
        call.args[0]["ws_sequence"]
        for call in websocket.send_json.await_args_list
        if "ws_sequence" in call.args[0]
    ]


@pytest.mark.asyncio
async def test_duplicate_ack_replay_storm_keeps_cursor_monotonic():
    harness = ReconnectStormHarness()
    await harness.seed_session_messages(180)

    ack_sequences = [75, 75, 150, 150, 180, 120, 180, 1, 179, 180]
    results = await asyncio.gather(*(harness.ack(sequence) for sequence in ack_sequences))
    cursor = await harness.cursor()

    assert cursor["last_ack_sequence"] == 180
    assert all(result["acknowledged"] is True for result in results)
    assert any(result.get("idempotent") is True for result in results)

    await harness.seed_session_messages(1, start=181)
    reconnect = await harness.connect(requested_cursor=0)

    assert sent_sequences(reconnect) == [181]


@pytest.mark.asyncio
async def test_parallel_reconnect_race_invalidates_stale_socket_and_preserves_lineage():
    harness = ReconnectStormHarness()
    await harness.seed_session_messages(3)

    first_socket = await harness.connect(requested_cursor=0)
    second_socket = await harness.connect(requested_cursor=0)
    late_ack = await harness.ack(1)
    latest_ack = await harness.ack(3)
    cursor = await harness.cursor()

    assert sent_sequences(first_socket) == [1, 2, 3]
    assert sent_sequences(second_socket) == [1, 2, 3]
    assert first_socket.close.await_count == 1
    assert harness.manager.stale_socket_closures == 1
    assert first_socket not in harness.manager.active_connections[harness.identity.user_id]
    assert second_socket in harness.manager.active_connections[harness.identity.user_id]
    assert late_ack["acknowledged"] is True
    assert latest_ack["last_ack_sequence"] == 3
    assert cursor["last_ack_sequence"] == 3


@pytest.mark.asyncio
async def test_delayed_ack_reordering_cannot_regress_cursor():
    harness = ReconnectStormHarness()
    await harness.seed_session_messages(180)

    ack_180 = await harness.ack(180)
    ack_150 = await harness.ack(150)
    ack_179 = await harness.ack(179)
    cursor = await harness.cursor()

    assert ack_180["last_ack_sequence"] == 180
    assert ack_150["idempotent"] is True
    assert ack_150["last_ack_sequence"] == 180
    assert ack_179["idempotent"] is True
    assert cursor["last_ack_sequence"] == 180


@pytest.mark.asyncio
async def test_replay_during_partition_with_stale_cursor_has_no_gap_or_rollback():
    harness = ReconnectStormHarness()
    await harness.seed_session_messages(5)

    partitioned_socket = await harness.connect(requested_cursor=0)
    initial_replay = sent_sequences(partitioned_socket)
    await harness.ack(3)
    partitioned_socket.send_json.side_effect = RuntimeError("network partition")
    await harness.seed_session_messages(3, start=6)
    assert partitioned_socket not in harness.manager.active_connections.get(
        harness.identity.user_id,
        [],
    )

    reconnect = await harness.connect(requested_cursor=1)
    stale_ack = await harness.ack(2)
    final_ack = await harness.ack(8)
    cursor = await harness.cursor()

    assert initial_replay == [1, 2, 3, 4, 5]
    assert sent_sequences(reconnect) == [4, 5, 6, 7, 8]
    assert harness.manager.delivery_failures == 1
    assert stale_ack["idempotent"] is True
    assert final_ack["last_ack_sequence"] == 8
    assert cursor["last_ack_sequence"] == 8

    await harness.seed_session_messages(1, start=9)
    final_reconnect = await harness.connect(requested_cursor=0)

    assert sent_sequences(final_reconnect) == [9]
