"""Pure unit tests for count-line domain value objects. No DB, no
FastAPI, no mocks -- plain Python objects only."""

import pytest

from backend.domains.count_lines.domain.value_objects import (
    ItemIdentity,
    LocationContext,
    SemanticIdentity,
    UomContext,
)


class TestLocationContext:
    def test_requires_location_floor_and_rack(self):
        with pytest.raises(ValueError):
            LocationContext(location_id="", floor_id="F1", rack_id="R1")
        with pytest.raises(ValueError):
            LocationContext(location_id="LOC-1", floor_id="", rack_id="R1")
        with pytest.raises(ValueError):
            LocationContext(location_id="LOC-1", floor_id="F1", rack_id="")

    def test_valid_construction(self):
        loc = LocationContext(location_id="LOC-1", floor_id="F1", rack_id="R1")
        assert loc.location_id == "LOC-1"
        assert loc.floor_id == "F1"
        assert loc.rack_id == "R1"
        assert loc.zone is None
        assert loc.shelf is None

    def test_immutable(self):
        loc = LocationContext(location_id="LOC-1", floor_id="F1", rack_id="R1")
        with pytest.raises(Exception):
            loc.location_id = "OTHER"  # type: ignore[misc]


class TestUomContext:
    def test_defaults(self):
        uom = UomContext()
        assert uom.conversion_factor == 1.0
        assert uom.uom_code is None

    def test_full_construction(self):
        uom = UomContext(
            input_uom="BOX",
            base_uom="PCS",
            uom_code="BOX",
            uom_name="Box",
            conversion_factor=12.0,
            quantity_precision=2,
        )
        assert uom.conversion_factor == 12.0
        assert uom.quantity_precision == 2


class TestItemIdentity:
    def test_minimal_construction(self):
        item = ItemIdentity(item_code="ITEM-001")
        assert item.item_code == "ITEM-001"
        assert item.item_id is None
        assert item.batch_id is None

    def test_full_construction(self):
        item = ItemIdentity(
            item_code="ITEM-001",
            item_id="internal-id-1",
            barcode="1234567890",
            batch_id="BATCH-001",
            batch_no="B-001",
            serial_no="SN-001",
        )
        assert item.barcode == "1234567890"
        assert item.serial_no == "SN-001"


class TestSemanticIdentity:
    def test_requires_session_item_qty_version(self):
        identity = SemanticIdentity(
            session_id="sess-1", item_code="ITEM-001", counted_qty=10.0, version=1
        )
        assert identity.location_id is None
        assert identity.batch_id is None

    def test_hash_key_is_deterministic(self):
        identity_a = SemanticIdentity(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=1,
        )
        identity_b = SemanticIdentity(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=1,
        )
        assert identity_a.hash_key() == identity_b.hash_key()

    def test_hash_key_differs_on_different_batch(self):
        base_kwargs = dict(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=1,
        )
        identity_a = SemanticIdentity(**base_kwargs, batch_id="BATCH-A")
        identity_b = SemanticIdentity(**base_kwargs, batch_id="BATCH-B")
        assert identity_a.hash_key() != identity_b.hash_key()

    def test_hash_key_unaffected_by_fields_not_yet_used_in_production(self):
        """barcode/batch_no/serial_no/warehouse_id/floor/zone/rack/shelf are
        captured on the value object (BSR-required field list) but must not
        change hash_key(), since production's semantic hash doesn't use
        them either -- see the module docstring's parity rationale."""
        base_kwargs = dict(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=1,
        )
        bare = SemanticIdentity(**base_kwargs)
        with_extras = SemanticIdentity(
            **base_kwargs,
            item_id="internal-1",
            barcode="1234567890",
            batch_no="B-001",
            serial_no="SN-001",
            warehouse_id="WH-1",
            floor="F1",
            zone="Z1",
            rack="R1",
            shelf="S1",
        )
        assert bare.hash_key() == with_extras.hash_key()
