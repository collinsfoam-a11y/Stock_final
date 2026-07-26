"""Parity test: SemanticIdentity.hash_key() vs production's
count_line_write_service._build_semantic_hash.

This is the proof required before any future wiring of the domain layer
into production (BSR Part F: "No production wiring until parity is
proven") -- it is not itself a wiring step. This file is the one place in
backend/domains/count_lines allowed to import production code, since its
entire purpose is comparing the two.
"""

from backend.domains.count_lines.domain.value_objects import SemanticIdentity
from backend.services.count_line_write_service import _build_semantic_hash


def _production_hash(**doc_fields) -> str:
    return _build_semantic_hash(doc_fields)


class TestSemanticIdentityParityWithProduction:
    def test_matches_production_for_full_field_set(self):
        identity = SemanticIdentity(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=2,
            batch_id="BATCH-001",
        )
        production_hash = _production_hash(
            session_id="sess-1",
            item_code="ITEM-001",
            location_id="LOC-1",
            counted_qty=10.0,
            version=2,
            batch_id="BATCH-001",
        )
        assert identity.hash_key() == production_hash

    def test_matches_production_when_batch_id_absent(self):
        identity = SemanticIdentity(
            session_id="sess-2",
            item_code="ITEM-002",
            location_id="LOC-2",
            counted_qty=5.0,
            version=1,
        )
        production_hash = _production_hash(
            session_id="sess-2",
            item_code="ITEM-002",
            location_id="LOC-2",
            counted_qty=5.0,
            version=1,
        )
        assert identity.hash_key() == production_hash

    def test_matches_production_when_location_id_absent(self):
        identity = SemanticIdentity(
            session_id="sess-3", item_code="ITEM-003", counted_qty=1.0, version=1
        )
        production_hash = _production_hash(
            session_id="sess-3", item_code="ITEM-003", counted_qty=1.0, version=1
        )
        assert identity.hash_key() == production_hash

    def test_matches_production_across_several_random_looking_inputs(self):
        cases = [
            {
                "session_id": "s-a",
                "item_code": "I-A",
                "location_id": "L-A",
                "counted_qty": 0.0,
                "version": 1,
            },
            {
                "session_id": "s-b",
                "item_code": "I-B",
                "location_id": "L-B",
                "counted_qty": 123.456,
                "version": 7,
                "batch_id": "B-77",
            },
            {
                "session_id": "s-c",
                "item_code": "I-C",
                "location_id": "",
                "counted_qty": -1.0,
                "version": 1,
            },
        ]
        for case in cases:
            identity = SemanticIdentity(**case)
            assert identity.hash_key() == _production_hash(**case), case

    def test_production_hash_is_batch_id_sensitive_and_so_is_this_one(self):
        """Locks in the BSR Part D behavior (different explicit batches at
        the same session/item/location/qty/version hash differently) on
        both sides of the parity comparison, not just one."""
        common = {
            "session_id": "sess-4",
            "item_code": "ITEM-004",
            "location_id": "LOC-4",
            "counted_qty": 10.0,
            "version": 1,
        }
        identity_a = SemanticIdentity(**common, batch_id="BATCH-A")
        identity_b = SemanticIdentity(**common, batch_id="BATCH-B")
        production_a = _production_hash(**common, batch_id="BATCH-A")
        production_b = _production_hash(**common, batch_id="BATCH-B")

        assert identity_a.hash_key() == production_a
        assert identity_b.hash_key() == production_b
        assert identity_a.hash_key() != identity_b.hash_key()
