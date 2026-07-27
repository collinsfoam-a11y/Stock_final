from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.models.location import LocationCreate, LocationType
from backend.services.location_service import (
    LocationDomainError,
    LocationService,
    deterministic_legacy_location_id,
    location_slug,
)


def test_legacy_location_ids_are_stable_and_slugs_are_normalized():
    assert deterministic_legacy_location_id("WH-MAIN") == deterministic_legacy_location_id(
        "wh-main"
    )
    assert location_slug("Rack A / Shelf 01") == "rack-a-shelf-01"


@pytest.mark.asyncio
async def test_create_builds_materialized_ancestry():
    db = MagicMock()
    db.locations.find_one = AsyncMock(
        return_value={
            "id": "warehouse-1",
            "name": "Main Warehouse",
            "location_type": "warehouse",
            "path_ids": ["warehouse-1"],
            "path_names": ["Main Warehouse"],
        }
    )
    db.locations.insert_one = AsyncMock()
    db.audit_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="audit-1"))
    result = await LocationService(db).create(
        LocationCreate(name="Rack A", location_type=LocationType.RACK, parent_id="warehouse-1"),
        actor="supervisor1",
        reason="Create governed rack",
        change_reference="CHG-101",
    )
    assert result.parent_id == "warehouse-1"
    assert result.path_ids[0] == "warehouse-1"
    assert result.path_names == ["Main Warehouse", "Rack A"]
    assert result.depth == 1


@pytest.mark.asyncio
async def test_create_rejects_parent_at_same_or_deeper_type():
    db = MagicMock()
    db.locations.find_one = AsyncMock(
        return_value={"id": "rack-1", "location_type": "rack", "path_ids": ["rack-1"]}
    )
    with pytest.raises(LocationDomainError, match="must be below"):
        await LocationService(db).create(
            LocationCreate(
                name="Another rack", location_type=LocationType.RACK, parent_id="rack-1"
            ),
            actor="supervisor1",
            reason="Create governed rack",
            change_reference="CHG-102",
        )


@pytest.mark.asyncio
async def test_create_requires_governance_context():
    db = MagicMock()
    with pytest.raises(LocationDomainError, match="actor, reason, and change_reference"):
        await LocationService(db).create(
            LocationCreate(name="Main", location_type=LocationType.WAREHOUSE),
            actor="supervisor1",
            reason="",
            change_reference="CHG-103",
        )


@pytest.mark.asyncio
async def test_create_records_canonical_audit_event():
    db = MagicMock()
    db.locations.insert_one = AsyncMock()
    db.audit_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="audit-1"))

    result = await LocationService(db).create(
        LocationCreate(name="Main", location_type=LocationType.WAREHOUSE),
        actor="supervisor1",
        reason="Approved hierarchy setup",
        change_reference="CHG-104",
    )

    audit_doc = db.audit_logs.insert_one.await_args.args[0]
    assert audit_doc["event_type"] == "LOCATION_CREATED"
    assert audit_doc["entity_id"] == result.id
    assert audit_doc["reason"] == "Approved hierarchy setup"
    assert audit_doc["details"]["change_reference"] == "CHG-104"
