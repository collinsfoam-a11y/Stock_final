from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.core.websocket_manager import WebSocketManager
from backend.services.projection_service import ProjectionService


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def scan_event(
    *,
    event_id: str,
    global_sequence: int,
    aggregate_sequence: int,
    counted_qty: float,
    line_id: str,
    session_id: str = "sess-chaos",
    item_code: str = "ITEM-CHAOS",
    batch_id: str = "BATCH-CHAOS",
) -> dict[str, Any]:
    return {
        "_id": event_id,
        "event_id": event_id,
        "global_sequence": global_sequence,
        "aggregate_id": item_code,
        "aggregate_sequence": aggregate_sequence,
        "aggregate_version": aggregate_sequence,
        "event_type": "SCAN_ADDED",
        "schema_version": "event.v1",
        "timestamp": utc_now(),
        "recorded_at": utc_now(),
        "actor_id": "chaos-test",
        "request_id": event_id,
        "correlation_id": f"corr-{event_id}",
        "device_id": "chaos-device",
        "idempotency_key": event_id,
        "metadata": {
            "actor_id": "chaos-test",
            "request_id": event_id,
            "correlation_id": f"corr-{event_id}",
            "device_id": "chaos-device",
            "idempotency_key": event_id,
            "expected_version": aggregate_sequence - 1,
        },
        "payload": {
            "session_id": session_id,
            "item_id": item_code,
            "batch_id": batch_id,
            "count_line_id": line_id,
            "count_line": {
                "id": line_id,
                "session_id": session_id,
                "item_code": item_code,
                "item_name": "Chaos Widget",
                "batch_id": batch_id,
                "counted_qty": counted_qty,
                "damaged_qty": 0,
            },
            "after": {
                "id": line_id,
                "session_id": session_id,
                "item_code": item_code,
                "item_name": "Chaos Widget",
                "batch_id": batch_id,
                "counted_qty": counted_qty,
                "damaged_qty": 0,
            },
            "delta": {"counted_qty": counted_qty, "damaged_qty": 0, "serial_count": 0},
        },
    }


def sent_sequences(websocket: Any) -> list[int]:
    return [
        int(call.args[0]["ws_sequence"])
        for call in websocket.send_json.await_args_list
        if call.args and "ws_sequence" in call.args[0]
    ]


class ReplayContinuityValidator:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def websocket_log_sequences(self) -> list[int]:
        docs = await self.db.websocket_replay_log.find({}).to_list(length=10_000)
        return sorted(int(doc["ws_sequence"]) for doc in docs)

    async def assert_websocket_log_contiguous(self) -> None:
        sequences = await self.websocket_log_sequences()
        if not sequences:
            return
        assert sequences == list(range(min(sequences), max(sequences) + 1))

    async def assert_cursor(
        self,
        manager: WebSocketManager,
        *,
        client_id: str,
        user_id: str,
        session_id: str,
        role: str,
        expected_sequence: int,
    ) -> dict[str, Any]:
        cursor = await manager.get_replay_cursor(
            client_id=client_id,
            user_id=user_id,
            session_id=session_id,
            role=role,
        )
        assert isinstance(cursor, dict)
        assert cursor["last_ack_sequence"] == expected_sequence
        return cursor

    async def assert_event_sequence_state(
        self,
        *,
        expected_global: int,
        aggregate_id: str,
        expected_aggregate: int,
    ) -> None:
        global_doc = await self.db.event_sequences.find_one({"_id": "global"})
        aggregate_doc = await self.db.event_sequences.find_one({"_id": f"aggregate:{aggregate_id}"})
        assert isinstance(global_doc, dict)
        assert isinstance(aggregate_doc, dict)
        assert global_doc["value"] == expected_global
        assert aggregate_doc["value"] == expected_aggregate

    async def assert_projection_semantics_pass(
        self,
        service: ProjectionService,
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        validation = await service._semantic_replay_validation(
            events,
            session_id=None,
            db_session=None,
        )
        assert validation["passed"] is True
        return validation
