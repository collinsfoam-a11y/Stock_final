"""Pure unit tests for DuplicateDetectionPolicy. No DB, no FastAPI, no
mocks -- plain Python objects only. Each test proves one required verdict
from the BSR Part F spec."""

from backend.domains.count_lines.domain.duplicate_policy import (
    CandidateLine,
    DuplicateDetectionPolicy,
    DuplicateReasonCode,
)
from backend.domains.count_lines.domain.value_objects import SemanticIdentity


def _candidate(**overrides) -> SemanticIdentity:
    base = dict(
        session_id="sess-1",
        item_code="ITEM-001",
        location_id="LOC-1",
        counted_qty=10.0,
        version=1,
    )
    base.update(overrides)
    return SemanticIdentity(**base)


class TestDuplicateDetectionPolicy:
    def test_same_idempotency_key_returns_idempotent_retry(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            matching_idempotency_line=CandidateLine(id="existing-1"),
        )
        assert verdict.reason_code == DuplicateReasonCode.IDEMPOTENT_RETRY
        assert verdict.is_duplicate is True
        assert verdict.existing_line_id == "existing-1"
        assert verdict.severity == "INFO"

    def test_same_item_same_location_returns_same_location_duplicate(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            same_location_line=CandidateLine(id="existing-2", status="pending"),
        )
        assert verdict.reason_code == DuplicateReasonCode.SAME_LOCATION_DUPLICATE
        assert verdict.is_duplicate is True
        assert verdict.requires_supervisor_review is True
        assert verdict.existing_line_id == "existing-2"

    def test_same_item_different_rack_returns_possible_relocation(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            elsewhere_in_session_line=CandidateLine(id="existing-3"),
        )
        assert verdict.reason_code == DuplicateReasonCode.POSSIBLE_RELOCATION
        assert verdict.is_duplicate is True
        assert verdict.severity == "WARNING"
        assert verdict.requires_supervisor_review is True

    def test_same_serial_twice_returns_serial_duplicate(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(serial_no="SN-001"),
            serial_conflict_line=CandidateLine(id="existing-4"),
        )
        assert verdict.reason_code == DuplicateReasonCode.SERIAL_DUPLICATE
        assert verdict.is_duplicate is True
        assert verdict.severity == "BLOCKING"
        assert verdict.requires_supervisor_review is True

    def test_same_semantic_hash_returns_semantic_duplicate(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            semantic_hash_match_line=CandidateLine(id="existing-5"),
        )
        assert verdict.reason_code == DuplicateReasonCode.SEMANTIC_DUPLICATE
        assert verdict.is_duplicate is True
        assert verdict.severity == "BLOCKING"

    def test_rejected_existing_line_returns_recount_allowed(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            same_location_line=CandidateLine(id="existing-6", status="rejected"),
        )
        assert verdict.reason_code == DuplicateReasonCode.RECOUNT_ALLOWED
        assert verdict.is_duplicate is True
        assert verdict.severity == "INFO"
        assert verdict.requires_supervisor_review is False

    def test_finalized_session_returns_finalized_session(self):
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),
            session_finalized=True,
            # Even a matching idempotency line must not override this --
            # finalized-session immutability (BSR rule #9) takes precedence.
            matching_idempotency_line=CandidateLine(id="existing-7"),
        )
        assert verdict.reason_code == DuplicateReasonCode.FINALIZED_SESSION
        assert verdict.is_duplicate is True
        assert verdict.severity == "BLOCKING"

    def test_no_match_returns_not_duplicate(self):
        verdict = DuplicateDetectionPolicy.evaluate(candidate=_candidate())
        assert verdict.reason_code == DuplicateReasonCode.NOT_DUPLICATE
        assert verdict.is_duplicate is False
        assert verdict.severity == "NONE"
        assert verdict.existing_line_id is None

    def test_different_explicit_batches_at_same_location_fall_through(self):
        """Two different, explicitly identified batches at the same
        location are legitimately separate counts, not a duplicate --
        mirrors canonical_inventory.find_duplicate_count_line's batch-aware
        matching (BSR Part D)."""
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(batch_id="BATCH-B"),
            same_location_line=CandidateLine(id="existing-8", batch_id="BATCH-A"),
        )
        assert verdict.reason_code == DuplicateReasonCode.NOT_DUPLICATE
        assert verdict.is_duplicate is False

    def test_missing_batch_context_on_either_side_still_flags_duplicate(self):
        """Absence of batch context must not weaken detection -- only an
        explicit mismatch on both sides does (matches production)."""
        verdict = DuplicateDetectionPolicy.evaluate(
            candidate=_candidate(),  # no batch_id
            same_location_line=CandidateLine(id="existing-9", batch_id="BATCH-A"),
        )
        assert verdict.reason_code == DuplicateReasonCode.SAME_LOCATION_DUPLICATE
