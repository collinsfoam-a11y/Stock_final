from __future__ import annotations

from datetime import datetime, timezone

import pytest
from backend.services.observability import metrics
from backend.services.read_router import InventoryReadRouter, ProjectionReadError
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.fixture(autouse=True)
def reset_projection_read_metrics():
    metrics._counters.clear()
    metrics._gauges.clear()
    metrics._histograms.clear()
    yield
    metrics._counters.clear()
    metrics._gauges.clear()
    metrics._histograms.clear()


@pytest.mark.asyncio
async def test_projection_read_router_uses_projection_collections(monkeypatch):
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 7.0,
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_by": "staff-1",
            "counted_at": now,
            "updated_at": now,
        }
    )
    await db.batch_records.insert_many(
        [
            {
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "batch_id": "B1",
                "batch_no": "B1",
                "counted_qty": 4.0,
                "damaged_qty": 0.0,
            },
            {
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "batch_id": "B2",
                "batch_no": "B2",
                "counted_qty": 3.0,
                "damaged_qty": 1.0,
            },
        ]
    )

    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    router = InventoryReadRouter(db)

    result = await router.get_session_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        endpoint="scan-status",
    )

    assert result["source"] == "projection"
    assert result["scanned"] is True
    assert result["total_qty"] == 7.0
    assert result["locations"] == [
        {
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_qty": 7.0,
            "counted_by": "staff-1",
            "counted_at": now,
        }
    ]
    assert result["batch_totals"] == [
        {"batch_id": "B1", "batch_no": "B1", "counted_qty": 4.0, "damaged_qty": 0.0},
        {"batch_id": "B2", "batch_no": "B2", "counted_qty": 3.0, "damaged_qty": 1.0},
    ]
    metrics_snapshot = await metrics.get_metrics()
    assert metrics_snapshot["counters"] == {'projection_read_hit_count{endpoint="scan-status"}': 1}


@pytest.mark.asyncio
async def test_projection_read_router_falls_back_to_legacy_when_projection_missing(monkeypatch):
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.count_lines.insert_many(
        [
            {
                "id": "line-1",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "counted_qty": 2.0,
                "floor_no": "F1",
                "rack_no": "R1",
                "counted_by": "staff-1",
                "counted_at": now,
                "batches": [
                    {"batch_id": "B1", "batch_no": "B1", "quantity": 2.0},
                ],
                "status": "pending",
            },
            {
                "id": "line-2",
                "session_id": "sess-1",
                "item_code": "ITEM-1",
                "counted_qty": 3.0,
                "floor_no": "F2",
                "rack_no": "R2",
                "counted_by": "staff-2",
                "counted_at": now,
                "batches": [
                    {"batch_id": "B2", "batch_no": "B2", "quantity": 3.0},
                ],
                "status": "pending",
            },
        ]
    )

    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    router = InventoryReadRouter(db)

    result = await router.get_session_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        endpoint="scan-status",
    )

    assert result["source"] == "legacy"
    assert result["scanned"] is True
    assert result["total_qty"] == 5.0
    assert len(result["locations"]) == 2
    assert result["batch_totals"] == [
        {"batch_id": "B1", "batch_no": "B1", "counted_qty": 2.0, "damaged_qty": 0.0},
        {"batch_id": "B2", "batch_no": "B2", "counted_qty": 3.0, "damaged_qty": 0.0},
    ]
    fallback_audits = await db.audit_projection_fallbacks.find({}).to_list(length=10)
    assert fallback_audits[0]["reason"] == "projection_item_missing"
    metrics_snapshot = await metrics.get_metrics()
    assert metrics_snapshot["counters"] == {
        'projection_fallback_count{endpoint="scan-status",reason="projection_item_missing"}': 1
    }


@pytest.mark.asyncio
async def test_projection_read_router_rejects_hidden_divergence_in_strict_mode(monkeypatch):
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_by": "staff-1",
            "counted_at": now,
            "status": "pending",
        }
    )

    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    monkeypatch.setenv("V3_PROJECTION_STRICT_MODE", "true")
    router = InventoryReadRouter(db)

    with pytest.raises(ProjectionReadError) as exc_info:
        await router.get_session_item_scan_status(
            session_id="sess-1",
            item_code="ITEM-1",
            endpoint="scan-status",
        )

    assert exc_info.value.reason == "projection_item_missing"
    fallback_audits = await db.audit_projection_fallbacks.find({}).to_list(length=10)
    assert fallback_audits == []
    metrics_snapshot = await metrics.get_metrics()
    assert metrics_snapshot["counters"] == {}


@pytest.mark.asyncio
async def test_projection_read_router_allows_unscanned_item_in_strict_mode(monkeypatch):
    db = InMemoryDatabase()
    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    monkeypatch.setenv("V3_PROJECTION_STRICT_MODE", "true")
    router = InventoryReadRouter(db)

    result = await router.get_session_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        endpoint="scan-status",
    )

    assert result == {
        "scanned": False,
        "total_qty": 0.0,
        "locations": [],
        "batch_totals": [],
        "source": "legacy",
    }


@pytest.mark.asyncio
async def test_projection_read_router_falls_back_when_projected_batch_totals_do_not_match(
    monkeypatch,
):
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 5.0,
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_by": "staff-1",
            "counted_at": now,
        }
    )
    await db.batch_records.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "batch_id": "B1",
            "batch_no": "B1",
            "counted_qty": 2.0,
            "damaged_qty": 0.0,
        }
    )
    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 5.0,
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_by": "staff-1",
            "counted_at": now,
            "batches": [
                {"batch_id": "B1", "batch_no": "B1", "quantity": 2.0},
                {"batch_id": "B2", "batch_no": "B2", "quantity": 3.0},
            ],
            "status": "pending",
        }
    )

    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    router = InventoryReadRouter(db)

    result = await router.get_session_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        endpoint="scan-status",
    )

    assert result["source"] == "legacy"
    fallback_audits = await db.audit_projection_fallbacks.find({}).to_list(length=10)
    assert fallback_audits[0]["reason"] == "projection_batch_gap"


@pytest.mark.asyncio
async def test_projection_read_router_uses_legacy_for_non_allowlisted_endpoint(monkeypatch):
    db = InMemoryDatabase()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 2.0,
            "floor_no": "F1",
            "rack_no": "R1",
            "counted_by": "staff-1",
            "counted_at": now,
            "status": "pending",
        }
    )
    await db.items_snapshot.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "ITEM-1",
            "counted_qty": 9.0,
            "floor_no": "F9",
            "rack_no": "R9",
            "counted_by": "staff-9",
            "counted_at": now,
        }
    )

    monkeypatch.setenv("V3_PROJECTION_READS", "true")
    router = InventoryReadRouter(db)

    result = await router.get_session_item_scan_status(
        session_id="sess-1",
        item_code="ITEM-1",
        endpoint="reports",
    )

    assert result["source"] == "legacy"
    metrics_snapshot = await metrics.get_metrics()
    assert metrics_snapshot["counters"] == {}
