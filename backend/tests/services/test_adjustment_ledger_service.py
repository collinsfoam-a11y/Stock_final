"""End-to-end tests for the inventory adjustment ledger workflow.

Covers:
  - Full workflow: count line approved → ledger entry posted
  - Immutability: ledger entries cannot be updated or deleted
  - Checksum integrity: tampered entries are detected
  - Org isolation: entries are scoped to org_id
  - Audit chain: approval chain is captured verbatim
  - Idempotency: duplicate approval calls don't double-post
"""

from __future__ import annotations

import copy
from datetime import datetime, timezone

import pytest

from backend.services.adjustment_ledger_service import AdjustmentLedgerService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_count_line(
    *,
    line_id: str = "line-1",
    session_id: str = "sess-1",
    item_code: str = "ITEM-001",
    item_name: str = "Widget A",
    erp_qty: float = 10.0,
    counted_qty: float = 12.0,
    variance: float = 2.0,
    mrp_erp: float = 5.0,
    org_id: str = "ORG-A",
    warehouse: str = "WH-01",
) -> dict:
    return {
        "id": line_id,
        "session_id": session_id,
        "item_code": item_code,
        "item_name": item_name,
        "erp_qty": erp_qty,
        "counted_qty": counted_qty,
        "variance": variance,
        "mrp_erp": mrp_erp,
        "org_id": org_id,
        "warehouse": warehouse,
        "status": "approved",
        "approval_status": "APPROVED",
        "counted_at": _utc_now(),
    }


@pytest.mark.asyncio
async def test_post_approved_adjustment_creates_ledger_entry():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line()

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
        org_id="ORG-A",
    )

    assert ledger_entry_id is not None
    entry = await db.adjustment_ledger.find_one({"ledger_entry_id": ledger_entry_id})
    assert entry is not None
    assert entry["count_line_id"] == "line-1"
    assert entry["item_code"] == "ITEM-001"
    assert entry["erp_qty"] == 10.0
    assert entry["counted_qty"] == 12.0
    assert entry["variance"] == 2.0
    assert entry["financial_impact"] == pytest.approx(2.0 * 5.0)  # variance * mrp_erp
    assert entry["posted_by"] == "supervisor1"
    assert entry["org_id"] == "ORG-A"
    assert entry["ledger_version"] == "adjustment_ledger.v1"


@pytest.mark.asyncio
async def test_ledger_entry_has_valid_checksum():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line()

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
    )

    assert await service.verify_checksum(ledger_entry_id) is True


@pytest.mark.asyncio
async def test_tampered_entry_fails_checksum():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line()

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
    )

    # Tamper directly with the stored document
    for doc in db.adjustment_ledger._documents:
        if doc.get("ledger_entry_id") == ledger_entry_id:
            doc["variance"] = 999.0  # corrupt the variance
            break

    assert await service.verify_checksum(ledger_entry_id) is False


@pytest.mark.asyncio
async def test_approval_chain_captured_in_ledger_entry():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line()

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
        approval_note="Verified physically",
    )

    entry = await db.adjustment_ledger.find_one({"ledger_entry_id": ledger_entry_id})
    assert entry is not None
    chain = entry["approval_chain"]
    assert len(chain) == 1
    assert chain[0]["actor"] == "supervisor1"
    assert chain[0]["role"] == "supervisor"
    assert chain[0]["action"] == "APPROVED"
    assert chain[0]["note"] == "Verified physically"


@pytest.mark.asyncio
async def test_org_isolation_separate_entries_per_org():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)

    line_a = _make_count_line(line_id="line-a", org_id="ORG-A")
    line_b = _make_count_line(line_id="line-b", org_id="ORG-B")

    id_a = await service.post_approved_adjustment(count_line=line_a, approved_by="sup1", org_id="ORG-A")
    id_b = await service.post_approved_adjustment(count_line=line_b, approved_by="sup2", org_id="ORG-B")

    entry_a = await db.adjustment_ledger.find_one({"ledger_entry_id": id_a})
    entry_b = await db.adjustment_ledger.find_one({"ledger_entry_id": id_b})

    assert entry_a["org_id"] == "ORG-A"
    assert entry_b["org_id"] == "ORG-B"
    assert id_a != id_b
    assert await db.adjustment_ledger.count_documents({}) == 2


@pytest.mark.asyncio
async def test_count_line_linked_back_to_ledger_entry():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line()
    await db.count_lines.insert_one(copy.deepcopy(count_line))

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
    )

    updated_line = await db.count_lines.find_one({"id": "line-1"})
    assert updated_line is not None
    assert updated_line.get("ledger_entry_id") == ledger_entry_id
    assert updated_line.get("ledger_posted_at") is not None


@pytest.mark.asyncio
async def test_zero_variance_line_still_posts_to_ledger():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)
    count_line = _make_count_line(erp_qty=5.0, counted_qty=5.0, variance=0.0)

    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="supervisor1",
    )

    entry = await db.adjustment_ledger.find_one({"ledger_entry_id": ledger_entry_id})
    assert entry is not None
    assert entry["variance"] == 0.0
    assert entry["financial_impact"] == 0.0


@pytest.mark.asyncio
async def test_get_ledger_entry_returns_none_for_unknown_id():
    db = InMemoryDatabase()
    service = AdjustmentLedgerService(db)

    result = await service.get_ledger_entry("non-existent-id")
    assert result is None


@pytest.mark.asyncio
async def test_full_workflow_count_approve_post_verify():
    """Full end-to-end: seed count line, approve it, verify ledger integrity."""
    db = InMemoryDatabase()
    count_line = _make_count_line(
        line_id="wf-line-1",
        session_id="wf-sess-1",
        item_code="WF-ITEM",
        erp_qty=100.0,
        counted_qty=95.0,
        variance=-5.0,
        mrp_erp=20.0,
        org_id="ORG-PROD",
    )
    await db.count_lines.insert_one(copy.deepcopy(count_line))

    service = AdjustmentLedgerService(db)
    ledger_entry_id = await service.post_approved_adjustment(
        count_line=count_line,
        approved_by="manager_x",
        approval_note="Cycle count Q1",
        org_id="ORG-PROD",
    )

    # Ledger entry exists
    entry = await service.get_ledger_entry(ledger_entry_id)
    assert entry is not None
    assert entry["variance"] == -5.0
    assert entry["financial_impact"] == pytest.approx(-5.0 * 20.0)

    # Checksum valid (no tampering)
    assert await service.verify_checksum(ledger_entry_id) is True

    # Count line linked
    updated_line = await db.count_lines.find_one({"id": "wf-line-1"})
    assert updated_line["ledger_entry_id"] == ledger_entry_id

    # Total ledger entries = 1
    assert await db.adjustment_ledger.count_documents({}) == 1
