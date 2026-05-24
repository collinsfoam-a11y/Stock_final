from datetime import datetime, timezone

import pytest

from backend.services.governance_guard import GovernanceViolation
from backend.services.projection_service import ProjectionService
from backend.services.validation_service import ValidationService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.mark.asyncio
async def test_serial_uniqueness_is_scoped_per_item():
    db = InMemoryDatabase()
    await db.serial_registry.insert_one(
        {
            "item_code": "ITEM-1",
            "serial_no": "SER-1",
            "count_line_id": "line-1",
        }
    )
    service = ValidationService(db)

    await service.assert_item_serial_uniqueness("ITEM-2", ["SER-1"])

    with pytest.raises(GovernanceViolation, match="SERIAL_DUPLICATE"):
        await service.assert_item_serial_uniqueness("ITEM-1", ["SER-1"])


def test_fractional_precision_uses_contract_error_code():
    db = InMemoryDatabase()
    service = ValidationService(db)

    with pytest.raises(GovernanceViolation, match="PRECISION_EXCEEDED"):
        service.normalize_quantity_for_item(
            item={
                "item_code": "ITEM-1",
                "uom_code": "KG",
                "base_uom": "KG",
                "allow_fraction": True,
                "uom_precision": 2,
            },
            doc={"item_code": "ITEM-1", "counted_qty": "1.234"},
        )


@pytest.mark.asyncio
async def test_projection_service_keeps_same_serial_for_different_items_distinct():
    db = InMemoryDatabase()
    service = ProjectionService(db)

    first_line = {
        "id": "line-1",
        "session_id": "sess-1",
        "item_code": "ITEM-1",
        "item_name": "Item One",
        "batch_id": "B1",
        "counted_qty": 1,
        "damaged_qty": 0,
        "serial_numbers": ["SER-1"],
    }
    second_line = {
        "id": "line-2",
        "session_id": "sess-1",
        "item_code": "ITEM-2",
        "item_name": "Item Two",
        "batch_id": "B1",
        "counted_qty": 1,
        "damaged_qty": 0,
        "serial_numbers": ["SER-1"],
    }

    await service.apply_event(
        {
            "_id": "evt-1",
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
            "payload": {
                "session_id": "sess-1",
                "item_id": "ITEM-1",
                "batch_id": "B1",
                "count_line_id": "line-1",
                "count_line": first_line,
                "before": None,
                "after": first_line,
                "delta": {"counted_qty": 1, "damaged_qty": 0, "serial_count": 1},
            },
        }
    )
    await service.apply_event(
        {
            "_id": "evt-2",
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
            "payload": {
                "session_id": "sess-1",
                "item_id": "ITEM-2",
                "batch_id": "B1",
                "count_line_id": "line-2",
                "count_line": second_line,
                "before": None,
                "after": second_line,
                "delta": {"counted_qty": 1, "damaged_qty": 0, "serial_count": 1},
            },
        }
    )

    registry_docs = await db.serial_registry.find({}).to_list(length=10)
    assert sorted((doc["item_code"], doc["serial_no"]) for doc in registry_docs) == [
        ("ITEM-1", "SER-1"),
        ("ITEM-2", "SER-1"),
    ]


@pytest.mark.asyncio
async def test_projection_rebuild_is_replay_safe():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    event = {
        "_id": "evt-replay-1",
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
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
                "counted_qty": 3,
                "damaged_qty": 0,
                "serial_numbers": ["SER-1", "SER-2", "SER-3"],
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
                "damaged_qty": 0,
                "serial_numbers": ["SER-1", "SER-2", "SER-3"],
            },
            "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 3},
        },
    }
    await db.event_log.insert_one(event)

    first = await service.rebuild_from_event_log(clear_existing=True)
    second = await service.rebuild_from_event_log(clear_existing=False)

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    applied = await db.event_applied.find({}).to_list(length=10)

    assert first["applied_events"] == 1
    assert first["shadow_rebuild"] is True
    assert first["swap_validated"] is True
    assert second["applied_events"] == 0
    assert snapshot["counted_qty"] == pytest.approx(3.0)
    assert len(applied) == 1


@pytest.mark.asyncio
async def test_shadow_projection_rebuild_replaces_live_state_only_after_validation():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 99,
            "projection_version": "stale",
        }
    )
    await db.event_log.insert_one(
        {
            "_id": "evt-shadow-swap-1",
            "event_id": "evt-shadow-swap-1",
            "global_sequence": 1,
            "aggregate_id": "ITEM-1",
            "aggregate_sequence": 1,
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
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
                    "counted_qty": 3,
                    "damaged_qty": 0,
                },
                "after": {
                    "id": "line-1",
                    "session_id": "sess-1",
                    "item_code": "ITEM-1",
                    "item_name": "Widget",
                    "batch_id": "B1",
                    "counted_qty": 3,
                    "damaged_qty": 0,
                },
                "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 0},
            },
        }
    )

    result = await service.rebuild_from_event_log(clear_existing=True)

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    live_hash = await service._projection_state_hash(session_id=None, db_session=None)

    assert result["shadow_rebuild"] is True
    assert result["swap_atomic"] is True
    assert result["swap_validated"] is True
    assert snapshot["counted_qty"] == pytest.approx(3.0)
    assert live_hash == result["projection_hash"]
    checkpoint = await db.projection_replay_checkpoints.find_one(
        {"resume_token": result["resume_token"]}
    )
    assert checkpoint["status"] == "completed"
    assert checkpoint["processed_events"] == 1


@pytest.mark.asyncio
async def test_shadow_projection_rebuild_failure_preserves_live_state(monkeypatch):
    db = InMemoryDatabase()
    service = ProjectionService(db)
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 99,
            "projection_version": "live",
        }
    )
    await db.event_log.insert_one(
        {
            "_id": "evt-shadow-fail-1",
            "event_id": "evt-shadow-fail-1",
            "global_sequence": 1,
            "aggregate_id": "ITEM-1",
            "aggregate_sequence": 1,
            "event_type": "SCAN_ADDED",
            "timestamp": _utc_now(),
            "payload": {
                "session_id": "sess-1",
                "item_id": "ITEM-1",
                "count_line": {
                    "id": "line-1",
                    "session_id": "sess-1",
                    "item_code": "ITEM-1",
                    "counted_qty": 3,
                },
                "after": {
                    "id": "line-1",
                    "session_id": "sess-1",
                    "item_code": "ITEM-1",
                    "counted_qty": 3,
                },
                "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 0},
            },
        }
    )

    async def fail_inventory_projection(self, *_args, **_kwargs):
        raise RuntimeError("shadow replay failed")

    monkeypatch.setattr(
        ProjectionService,
        "_project_inventory_event",
        fail_inventory_projection,
    )

    with pytest.raises(RuntimeError, match="shadow replay failed"):
        await service.rebuild_from_event_log(clear_existing=True)

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    assert snapshot["counted_qty"] == pytest.approx(99)
    checkpoint = await db.projection_replay_checkpoints.find_one({})
    assert checkpoint["status"] == "failed"


@pytest.mark.asyncio
async def test_shadow_projection_rebuild_resumes_from_checkpoint():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    resume_token = "resume-shadow-1"
    event_one = {
        "_id": "evt-resume-1",
        "event_id": "evt-resume-1",
        "global_sequence": 1,
        "aggregate_id": "ITEM-1",
        "aggregate_sequence": 1,
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
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
                "counted_qty": 2,
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 2,
            },
            "delta": {"counted_qty": 2, "damaged_qty": 0, "serial_count": 0},
        },
    }
    event_two = {
        "_id": "evt-resume-2",
        "event_id": "evt-resume-2",
        "global_sequence": 2,
        "aggregate_id": "ITEM-1",
        "aggregate_sequence": 2,
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
        "payload": {
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "batch_id": "B1",
            "count_line_id": "line-2",
            "count_line": {
                "id": "line-2",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
            },
            "after": {
                "id": "line-2",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
            },
            "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 0},
        },
    }
    await db.event_log.insert_one(event_one)
    await db.event_log.insert_one(event_two)
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 99,
            "projection_version": "stale",
        }
    )

    shadow_map = service._shadow_collection_map(resume_token)
    await db[shadow_map["items_snapshot"]].insert_one(
        {
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "item_code": "ITEM-1",
            "counted_qty": 2,
            "damaged_qty": 0,
            "serial_count": 0,
            "projection_version": "v3.1",
        }
    )
    await db[shadow_map["batch_records"]].insert_one(
        {
            "session_id": "sess-1",
            "item_id": "ITEM-1",
            "item_code": "ITEM-1",
            "batch_id": "B1",
            "batch_no": "B1",
            "counted_qty": 2,
            "damaged_qty": 0,
            "projection_version": "v3.1",
        }
    )
    await db[shadow_map["event_applied"]].insert_one(
        {
            "event_id": "evt-resume-1",
            "event_type": "SCAN_ADDED",
            "aggregate_id": "ITEM-1",
            "session_id": "sess-1",
            "status": "applied",
            "projection_version": "v3.1",
        }
    )
    await db.projection_replay_checkpoints.insert_one(
        {
            "_id": f"{resume_token}:global",
            "rebuild_id": resume_token,
            "resume_token": resume_token,
            "session_id": None,
            "status": "running",
            "shadow_map": shadow_map,
            "event_window_hash": service._event_window_hash([event_one, event_two]),
            "processed_events": 1,
            "applied_events": 1,
            "total_events": 2,
            "last_event_id": "evt-resume-1",
            "last_global_sequence": 1,
            "projection_version": "v3.1",
        }
    )

    result = await service.rebuild_from_event_log(
        clear_existing=True,
        resume_token=resume_token,
        checkpoint_interval=1,
    )

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    checkpoint = await db.projection_replay_checkpoints.find_one({"resume_token": resume_token})

    assert result["resumed"] is True
    assert result["checkpoint_processed_events"] == 2
    assert snapshot["counted_qty"] == pytest.approx(5)
    assert checkpoint["status"] == "completed"


@pytest.mark.asyncio
async def test_projection_rebuild_lease_blocks_parallel_swap():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    await db.projection_rebuild_leases.insert_one(
        {
            "_id": "projection_rebuild:global",
            "owner": "other-worker",
            "session_id": None,
            "expires_at": _utc_now().replace(year=_utc_now().year + 1),
            "fencing_token": 99,
            "lease_version": 1,
        }
    )
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 99,
            "projection_version": "live",
        }
    )

    with pytest.raises(RuntimeError, match="already locked"):
        await service.rebuild_from_event_log(clear_existing=True)

    snapshot = await db.items_snapshot.find_one({"session_id": "sess-1", "item_code": "ITEM-1"})
    assert snapshot["counted_qty"] == pytest.approx(99)


@pytest.mark.asyncio
async def test_projection_rebuild_hash_is_canonical_and_detects_field_drift():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    event = {
        "_id": "evt-replay-hash-1",
        "event_id": "evt-replay-hash-1",
        "global_sequence": 1,
        "aggregate_id": "ITEM-1",
        "aggregate_sequence": 1,
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
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
                "counted_qty": 3,
                "damaged_qty": 0,
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
                "damaged_qty": 0,
            },
            "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 0},
        },
    }
    await db.event_log.insert_one(event)

    first = await service.rebuild_from_event_log(clear_existing=True)
    second = await service.rebuild_from_event_log(clear_existing=True)

    assert first["projection_hash"] == second["projection_hash"]
    assert first["semantic_validation"]["passed"] is True
    assert {result["name"] for result in first["semantic_validation"]["invariant_results"]} >= {
        "inventory_conservation",
        "aggregate_version_monotonicity",
        "replay_determinism",
        "projection_semantic_equivalence",
    }
    assert first["semantic_validation"]["semantic_state_hash"]
    assert first["semantic_validation"]["invariants"]["items_snapshot_count"] == 1

    await db.items_snapshot.update_one(
        {"session_id": "sess-1", "item_code": "ITEM-1"},
        {"$set": {"counted_qty": 99}},
    )
    drifted_hash = await service._projection_state_hash(session_id=None, db_session=None)

    assert drifted_hash != first["projection_hash"]


@pytest.mark.asyncio
async def test_projection_rebuild_rejects_semantic_projection_drift():
    db = InMemoryDatabase()
    service = ProjectionService(db)
    event = {
        "_id": "evt-semantic-drift-1",
        "event_id": "evt-semantic-drift-1",
        "global_sequence": 1,
        "aggregate_id": "ITEM-1",
        "aggregate_sequence": 1,
        "event_type": "SCAN_ADDED",
        "timestamp": _utc_now(),
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
                "counted_qty": 3,
                "damaged_qty": 0,
            },
            "after": {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "item_name": "Widget",
                "batch_id": "B1",
                "counted_qty": 3,
                "damaged_qty": 0,
            },
            "delta": {"counted_qty": 3, "damaged_qty": 0, "serial_count": 0},
        },
    }
    await db.event_log.insert_one(event)
    await service.rebuild_from_event_log(clear_existing=True)

    await db.items_snapshot.update_one(
        {"session_id": "sess-1", "item_code": "ITEM-1"},
        {"$set": {"counted_qty": 99}},
    )

    with pytest.raises(ValueError, match="semantic validation failed"):
        await service.rebuild_from_event_log(clear_existing=False)


@pytest.mark.asyncio
async def test_projection_rebuild_rejects_projection_markers_in_event_log():
    db = InMemoryDatabase()
    service = ProjectionService(db)

    await db.event_log.insert_one(
        {
            "_id": "projection-marker-1",
            "event_type": "write.sync",
            "schema_version": "projection-marker.v1",
            "metadata": {"non_domain_projection_marker": True},
            "payload": {"session_id": "sess-1"},
            "timestamp": _utc_now(),
        }
    )

    with pytest.raises(ValueError, match="non-domain projection operation marker"):
        await service.rebuild_from_event_log()
