import pytest
from backend.services.governance_guard import GovernanceViolation
from backend.services.validation_service import ValidationService
from backend.tests.utils.in_memory_db import InMemoryDatabase


@pytest.mark.asyncio
async def test_validate_count_line_logs_errors_in_non_strict_mode():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=False, write_logs=True)

    errors = await service.validate_count_line({"_id": "line-1", "session_id": "sess-1"})

    assert "Missing location_id" in errors
    assert "Missing floor_id" in errors
    assert "Missing rack_id" in errors
    assert await db["validation_logs"].count_documents({}) == 1


@pytest.mark.asyncio
async def test_validate_session_raises_in_strict_mode():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=True, write_logs=False)

    with pytest.raises(GovernanceViolation):
        await service.validate_session({"session_id": "sess-1", "status": "FINALIZED"})


@pytest.mark.asyncio
async def test_integrity_report_tracks_missing_context_documents():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=False, write_logs=False)

    await db.count_lines.insert_one({"session_id": "sess-1", "item_code": "I-1"})
    await db.count_lines.insert_one(
        {
            "session_id": "sess-1",
            "item_code": "I-2",
            "location_id": "L1",
            "floor_id": "F1",
            "rack_id": "R1",
        }
    )

    report = await service.run_integrity_report()
    assert report["missing_context_count"] == 1


@pytest.mark.asyncio
async def test_check_finalization_violations_filters_by_session_id():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=False, write_logs=False)

    await db.count_lines.insert_one({"session_id": "sess-a", "status": "pending"})
    await db.count_lines.insert_one({"session_id": "sess-b", "status": "LOCKED"})

    violations = await service.check_finalization_violations(session_id="sess-a")
    assert len(violations) == 1
    assert violations[0]["session_id"] == "sess-a"


@pytest.mark.asyncio
async def test_enforce_count_line_business_rules_blocks_fraction_for_nos():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=False, write_logs=False)
    await db.erp_items.insert_one(
        {
            "item_code": "ITEM-NOS",
            "uom_code": "NOS",
            "uom_name": "Numbers",
            "allow_fraction": False,
        }
    )

    with pytest.raises(GovernanceViolation, match="FRACTION_NOT_ALLOWED"):
        await service.enforce_count_line_business_rules(
            {
                "session_id": "sess-1",
                "item_code": "ITEM-NOS",
                "counted_qty": 1.5,
            }
        )


@pytest.mark.asyncio
async def test_enforce_count_line_business_rules_rejects_global_duplicate_serial():
    db = InMemoryDatabase()
    service = ValidationService(db, strict_mode=False, write_logs=False)
    await db.erp_items.insert_one(
        {
            "item_code": "ITEM-SERIAL",
            "uom_code": "NOS",
            "allow_fraction": False,
            "is_serialized": True,
        }
    )
    await db.serial_registry.insert_one(
        {
            "serial_no": "SN-DUP-1",
            "item_code": "ITEM-SERIAL",
            "session_id": "sess-a",
            "count_line_id": "line-a",
        }
    )

    with pytest.raises(GovernanceViolation, match="SERIAL_DUPLICATE"):
        await service.enforce_count_line_business_rules(
            {
                "session_id": "sess-b",
                "item_code": "ITEM-SERIAL",
                "counted_qty": 1,
                "serial_numbers": ["sn-dup-1"],
            }
        )
