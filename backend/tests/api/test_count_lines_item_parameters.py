"""
Tests for the BSR item-parameter persistence remediation (Part D):
- batch_id and UOM context, previously accepted on the request schema but
  silently dropped before persistence, must now be stored on the count_line
  document.
- Two different, explicitly identified batches at the same item/location
  must not be flagged as a duplicate; existing (no-batch-context) duplicate
  behavior must be unchanged.

Note: uom_code/uom_name specifically end up server-authoritative (sourced
from the ERP item master via ValidationService.normalize_quantity_for_item,
falling back to the request's input_uom only when the item master has no
UOM of its own) rather than a verbatim echo of client input -- this is
existing, correct behavior (frontend input is low trust; server-side
validation is mandatory) uncovered while testing this fix, not something
this change alters. The persistence tests below seed the item master with
its own UOM so the assertions reflect the real, intended contract.

This also uncovered and fixes a separate bug: that server-side UOM
normalization ran *after* insert_one and was never written back to
storage, so the API response could show different UOM values than what
was actually persisted. CountLineWriteService._run_post_write_validation
now syncs the normalized UOM/quantity fields back after validation, but
only when a genuine UOM identity field actually changed -- not on every
insert (input_qty/counted_qty always resolve to a concrete value even
with no UOM context at all, so gating on them alone would trigger a
second write on every single count-line submission).
"""

from unittest.mock import AsyncMock, patch

import pytest
from backend.api.count_lines_routes import create_count_line
from backend.api.schemas import CountLineCreate
from backend.services.governance_guard import install_db_write_guards
from backend.tests.utils.in_memory_db import InMemoryDatabase

CURRENT_USER = {"username": "staff1", "role": "staff"}


async def _seed_active_session(db: InMemoryDatabase, session_id: str, item_code: str) -> None:
    await db.sessions.insert_one(
        {"id": session_id, "session_id": session_id, "status": "ACTIVE", "version": 0}
    )
    await db.erp_items.insert_one(
        {
            "item_code": item_code,
            "barcode": f"BC-{item_code}",
            "item_name": "Test Item",
            "stock_qty": 100.0,
            "mrp": 50.0,
        }
    )
    await db.session_snapshots.insert_one(
        {
            "session_id": session_id,
            "snapshot_hash": f"hash-{session_id}",
            "items": [{"item_code": item_code, "stock_qty": 100.0}],
        }
    )


def _line(
    *,
    session_id: str,
    item_code: str,
    idempotency_key: str,
    floor: str = "F1",
    rack: str = "R1",
    **overrides,
) -> CountLineCreate:
    payload = {
        "session_id": session_id,
        "location_id": "LOC-1",
        "floor_id": floor,
        "rack_id": rack,
        "item_code": item_code,
        "idempotency_key": idempotency_key,
        "counted_qty": 100.0,
        "floor_no": floor,
        "rack_no": rack,
    }
    payload.update(overrides)
    return CountLineCreate(**payload)


@pytest.mark.asyncio
async def test_create_count_line_persists_batch_id_and_uom_context():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-1", "ITEM-PARAM")
    # Item master carries its own authoritative UOM naming; normalize_quantity_for_item
    # prefers this over client input for uom_code/uom_name (input_uom/base_uom stay
    # request-driven -- they describe what the counter actually used).
    await db.erp_items.update_one(
        {"item_code": "ITEM-PARAM"}, {"$set": {"uom_code": "BOX", "uom_name": "Box"}}
    )
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-param-1",
        item_code="ITEM-PARAM",
        idempotency_key="key-param-1",
        batch_id="BATCH-001",
        base_uom="PCS",
        input_uom="BOX",
        quantity_precision=2,
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["batch_id"] == "BATCH-001"
    assert result["uom_code"] == "BOX"
    assert result["uom_name"] == "Box"
    assert result["base_uom"] == "PCS"
    assert result["input_uom"] == "BOX"
    assert result["conversion_factor"] == 1.0

    # The persisted document must match what was returned: ValidationService.
    # enforce_count_line_business_rules normalizes uom_code/uom_name from the
    # item master *after* insert_one already ran, so without syncing that
    # normalization back to storage, the response would show different UOM
    # values than what's actually in count_lines (fixed in
    # CountLineWriteService._run_post_write_validation).
    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["batch_id"] == "BATCH-001"
    assert persisted["uom_code"] == "BOX"
    assert persisted["uom_name"] == "Box"


@pytest.mark.asyncio
async def test_create_count_line_missing_batch_context_persists_as_none():
    """Historical/legacy-shaped submissions without batch context must not
    fabricate a value -- absence stays null, not a made-up default."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-2", "ITEM-PARAM2")
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-param-2", item_code="ITEM-PARAM2", idempotency_key="key-param-2"
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["batch_id"] is None
    assert result["uom_code"] is None


@pytest.mark.asyncio
async def test_different_batch_same_location_is_not_flagged_as_duplicate():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-3", "ITEM-PARAM3")
    install_db_write_guards(db)

    line_a = _line(
        session_id="sess-param-3",
        item_code="ITEM-PARAM3",
        idempotency_key="key-a-3",
        batch_id="BATCH-A",
    )
    line_b = _line(
        session_id="sess-param-3",
        item_code="ITEM-PARAM3",
        idempotency_key="key-b-3",
        batch_id="BATCH-B",
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result_a = await create_count_line(
            request=AsyncMock(), line_data=line_a, current_user=CURRENT_USER
        )
        result_b = await create_count_line(
            request=AsyncMock(), line_data=line_b, current_user=CURRENT_USER
        )

    assert result_a["id"] != result_b["id"]
    assert await db.count_lines.count_documents({"session_id": "sess-param-3"}) == 2


@pytest.mark.asyncio
async def test_same_batch_same_location_is_still_a_duplicate():
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-4", "ITEM-PARAM4")
    install_db_write_guards(db)

    line_a = _line(
        session_id="sess-param-4",
        item_code="ITEM-PARAM4",
        idempotency_key="key-a-4",
        batch_id="BATCH-SAME",
    )
    line_b = _line(
        session_id="sess-param-4",
        item_code="ITEM-PARAM4",
        idempotency_key="key-b-4",
        batch_id="BATCH-SAME",
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        await create_count_line(request=AsyncMock(), line_data=line_a, current_user=CURRENT_USER)
        with pytest.raises(Exception) as exc_info:
            await create_count_line(
                request=AsyncMock(), line_data=line_b, current_user=CURRENT_USER
            )

    assert "Duplicate Scan" in str(getattr(exc_info.value, "detail", exc_info.value))
    assert await db.count_lines.count_documents({"session_id": "sess-param-4"}) == 1


@pytest.mark.asyncio
async def test_missing_batch_context_on_both_sides_preserves_existing_duplicate_behavior():
    """No batch context provided on either count -- must still be flagged as
    a same-location duplicate, exactly as before batch-aware matching was
    added (backward compatibility for historical data / clients that don't
    send batch_id)."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-5", "ITEM-PARAM5")
    install_db_write_guards(db)

    line_a = _line(session_id="sess-param-5", item_code="ITEM-PARAM5", idempotency_key="key-a-5")
    line_b = _line(session_id="sess-param-5", item_code="ITEM-PARAM5", idempotency_key="key-b-5")

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        await create_count_line(request=AsyncMock(), line_data=line_a, current_user=CURRENT_USER)
        with pytest.raises(Exception) as exc_info:
            await create_count_line(
                request=AsyncMock(), line_data=line_b, current_user=CURRENT_USER
            )

    assert "Duplicate Scan" in str(getattr(exc_info.value, "detail", exc_info.value))


@pytest.mark.asyncio
async def test_create_count_line_persists_variant_and_condition_fields():
    """BSR Part C: variant_id, variant_barcode, mrp_source, condition_details,
    and damage_included were accepted and Pydantic-validated on
    CountLineCreate but never referenced in _build_count_line_document --
    silently dropped before persistence. Now stored additively."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-6", "ITEM-PARAM6")
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-param-6",
        item_code="ITEM-PARAM6",
        idempotency_key="key-param-6",
        variant_id="VARIANT-001",
        variant_barcode="BC-VARIANT-001",
        mrp_source="manual_override",
        condition_details="Minor packaging damage on one corner",
        damage_included=True,
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["variant_id"] == "VARIANT-001"
    assert result["variant_barcode"] == "BC-VARIANT-001"
    assert result["mrp_source"] == "manual_override"
    assert result["condition_details"] == "Minor packaging damage on one corner"
    assert result["damage_included"] is True

    persisted = await db.count_lines.find_one({"id": result["id"]})
    assert persisted["variant_id"] == "VARIANT-001"
    assert persisted["variant_barcode"] == "BC-VARIANT-001"
    assert persisted["mrp_source"] == "manual_override"
    assert persisted["condition_details"] == "Minor packaging damage on one corner"
    assert persisted["damage_included"] is True


@pytest.mark.asyncio
async def test_create_count_line_missing_variant_fields_persist_as_none():
    """Absence stays null, not fabricated -- matches the rest of this suite."""
    db = InMemoryDatabase()
    await _seed_active_session(db, "sess-param-7", "ITEM-PARAM7")
    install_db_write_guards(db)

    line_data = _line(
        session_id="sess-param-7", item_code="ITEM-PARAM7", idempotency_key="key-param-7"
    )

    with patch("backend.api.count_lines_routes.get_db", return_value=db):
        result = await create_count_line(
            request=AsyncMock(), line_data=line_data, current_user=CURRENT_USER
        )

    assert result["variant_id"] is None
    assert result["variant_barcode"] is None
    assert result["mrp_source"] is None
    assert result["condition_details"] is None
    assert result["damage_included"] is None
