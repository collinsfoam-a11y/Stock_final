from backend.services.replay_invariant_engine import ReplayInvariantEngine


def _scan_event(
    *,
    event_id: str = "evt-1",
    counted_qty: float = 5,
    global_sequence: int = 1,
    aggregate_version: int = 1,
) -> dict:
    return {
        "_id": event_id,
        "event_id": event_id,
        "global_sequence": global_sequence,
        "aggregate_id": "ITEM-1",
        "aggregate_sequence": aggregate_version,
        "aggregate_version": aggregate_version,
        "event_type": "SCAN_ADDED",
        "payload": {
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "batch_id": "B1",
            "count_line_id": "line-1",
            "count_line": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": counted_qty,
                "damaged_qty": 0,
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": counted_qty,
                "damaged_qty": 0,
            },
            "delta": {"counted_qty": counted_qty, "damaged_qty": 0, "serial_count": 0},
        },
    }


def _projection_docs(*, counted_qty: float = 5, batch_qty: float = 5) -> dict:
    return {
        "items_snapshot": [
            {
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "counted_qty": counted_qty,
                "damaged_qty": 0,
                "serial_count": 0,
            }
        ],
        "batch_records": [
            {
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "batch_id": "B1",
                "counted_qty": batch_qty,
                "damaged_qty": 0,
            }
        ],
        "serial_registry": [],
        "damage_logs": [],
        "variance_logs": [],
        "approvals": [],
        "sync_queue": [],
        "event_applied": [{"event_id": "evt-1", "session_id": "sess-1"}],
    }


def _reasons(result: dict) -> set[str]:
    return {violation["reason"] for violation in result["violations"]}


def test_replay_invariant_engine_accepts_valid_projection_state():
    engine = ReplayInvariantEngine()
    events = [_scan_event()]

    first = engine.validate(events, _projection_docs())
    second = engine.validate(events, _projection_docs())

    assert first["passed"] is True
    assert first["semantic_state_hash"] == second["semantic_state_hash"]
    assert {result["name"] for result in first["invariant_results"]} == {
        "inventory_conservation",
        "reservation_closure",
        "aggregate_version_monotonicity",
        "replay_determinism",
        "projection_semantic_equivalence",
    }
    assert first["invariants"]["items_snapshot_count"] == 1
    assert first["invariants"]["aggregate_count"] == 1


def test_inventory_conservation_detects_negative_and_orphan_quantities():
    engine = ReplayInvariantEngine()
    expected = engine.expected_semantic_state([_scan_event()])

    result = engine.assert_inventory_conservation(
        expected,
        _projection_docs(counted_qty=-1, batch_qty=4),
    )

    reasons = _reasons(result)
    assert result["status"] == "failed"
    assert "negative_quantity" in reasons
    assert "quantity_mismatch" in reasons
    assert "actual_batch_item_closure_mismatch" in reasons


def test_aggregate_version_monotonicity_detects_gaps_and_duplicates():
    engine = ReplayInvariantEngine()
    events = [
        _scan_event(event_id="evt-1", global_sequence=1, aggregate_version=1),
        _scan_event(event_id="evt-2", global_sequence=2, aggregate_version=3),
        _scan_event(event_id="evt-3", global_sequence=3, aggregate_version=3),
    ]

    result = engine.assert_aggregate_version_monotonicity(events)

    reasons = _reasons(result)
    assert result["status"] == "failed"
    assert "aggregate_version_gap" in reasons
    assert "duplicate_aggregate_version" in reasons


def test_reservation_closure_detects_dangling_and_duplicate_release():
    engine = ReplayInvariantEngine()
    events = [
        {
            "_id": "res-open-1",
            "event_type": "RESERVATION_CREATED",
            "payload": {"reservation_id": "res-1"},
        },
        {
            "_id": "res-release-1",
            "event_type": "RESERVATION_RELEASED",
            "payload": {"reservation_id": "res-2"},
        },
        {
            "_id": "res-release-2",
            "event_type": "RESERVATION_RELEASED",
            "payload": {"reservation_id": "res-2"},
        },
    ]

    result = engine.assert_reservation_closure(events)

    reasons = _reasons(result)
    assert result["status"] == "failed"
    assert "dangling_reservation" in reasons
    assert "close_without_open_reservation" in reasons
    assert "duplicate_close_reservation" in reasons


def test_replay_determinism_detects_duplicate_event_and_sequence():
    engine = ReplayInvariantEngine()
    events = [
        _scan_event(event_id="evt-1", global_sequence=1, aggregate_version=1),
        _scan_event(event_id="evt-1", global_sequence=1, aggregate_version=2),
    ]
    expected = engine.expected_semantic_state(events)

    result = engine.assert_replay_determinism(events, expected)

    reasons = _reasons(result)
    assert result["status"] == "failed"
    assert "duplicate_event_id" in reasons
    assert "duplicate_global_sequence" in reasons
