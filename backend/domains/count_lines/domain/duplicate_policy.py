"""Pure domain policy: given a proposed count and whatever candidate lines
already exist, decide what kind of duplicate (if any) this is.

Zero I/O. Zero Mongo. Zero FastAPI. This mirrors the decision tree
currently implemented in count_lines_routes.py's _evaluate_duplicate_context
(the proactive check endpoint) and _resolve_recount_target (the actual
submit path) -- extracted so it can be unit tested with plain Python
objects. Not wired into production; see package docstring.

Precedence (first match wins), matching production's order in
_evaluate_duplicate_context:
  1. FINALIZED_SESSION
  2. IDEMPOTENT_RETRY
  3. SERIAL_DUPLICATE
  4. SAME_LOCATION_DUPLICATE / RECOUNT_ALLOWED (same location, batch-aware)
  5. POSSIBLE_RELOCATION (item counted elsewhere in session)
  6. SEMANTIC_DUPLICATE (semantic-hash collision not already caught above)
  7. NOT_DUPLICATE
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Optional, Any

from .value_objects import SemanticIdentity


class DuplicateReasonCode(str, Enum):
    IDEMPOTENT_RETRY = "IDEMPOTENT_RETRY"
    SAME_LOCATION_DUPLICATE = "SAME_LOCATION_DUPLICATE"
    SERIAL_DUPLICATE = "SERIAL_DUPLICATE"
    POSSIBLE_RELOCATION = "POSSIBLE_RELOCATION"
    RECOUNT_ALLOWED = "RECOUNT_ALLOWED"
    FINALIZED_SESSION = "FINALIZED_SESSION"
    NOT_DUPLICATE = "NOT_DUPLICATE"
    SEMANTIC_DUPLICATE = "SEMANTIC_DUPLICATE"


@dataclass(frozen=True)
class DuplicateVerdict:
    is_duplicate: bool
    reason_code: DuplicateReasonCode
    severity: str
    message: str
    existing_line_id: Optional[str] = None
    requires_supervisor_review: bool = False


@dataclass(frozen=True)
class CandidateLine:
    """Minimal shape the policy needs from an existing count line. Callers
    (not built yet -- see package docstring) map their real documents into
    this before calling the policy, keeping the policy itself free of any
    persistence-shaped assumptions."""

    id: str
    status: str = "pending"
    batch_id: Optional[str] = None
    recount_requested_at: Optional[Any] = None


class DuplicateDetectionPolicy:
    @staticmethod
    def evaluate(
        *,
        candidate: SemanticIdentity,
        session_finalized: bool = False,
        matching_idempotency_line: Optional[CandidateLine] = None,
        serial_conflict_line: Optional[CandidateLine] = None,
        same_location_line: Optional[CandidateLine] = None,
        elsewhere_in_session_line: Optional[CandidateLine] = None,
        semantic_hash_match_line: Optional[CandidateLine] = None,
    ) -> DuplicateVerdict:
        if session_finalized:
            return DuplicateVerdict(
                is_duplicate=True,
                reason_code=DuplicateReasonCode.FINALIZED_SESSION,
                severity="BLOCKING",
                message="Session is finalized; new count-line submissions are blocked.",
            )

        if matching_idempotency_line is not None:
            return DuplicateVerdict(
                is_duplicate=True,
                reason_code=DuplicateReasonCode.IDEMPOTENT_RETRY,
                severity="INFO",
                message="This exact submission was already recorded; retry is safe.",
                existing_line_id=matching_idempotency_line.id,
            )

        if serial_conflict_line is not None:
            return DuplicateVerdict(
                is_duplicate=True,
                reason_code=DuplicateReasonCode.SERIAL_DUPLICATE,
                severity="BLOCKING",
                message="This serial number was already counted in this session.",
                existing_line_id=serial_conflict_line.id,
                requires_supervisor_review=True,
            )

        if same_location_line is not None:
            batches_explicitly_differ = (
                same_location_line.batch_id is not None
                and candidate.batch_id is not None
                and same_location_line.batch_id != candidate.batch_id
            )
            if not batches_explicitly_differ:
                if same_location_line.status == "rejected" or getattr(same_location_line, "recount_requested_at", None):
                    return DuplicateVerdict(
                        is_duplicate=True,
                        reason_code=DuplicateReasonCode.RECOUNT_ALLOWED,
                        severity="INFO",
                        message=(
                            "Existing count line at this location was flagged for recount; "
                            "recount allowed."
                        ),
                        existing_line_id=same_location_line.id,
                    )
                return DuplicateVerdict(
                    is_duplicate=True,
                    reason_code=DuplicateReasonCode.SAME_LOCATION_DUPLICATE,
                    severity="BLOCKING",
                    message="This item was already counted at this location in this session.",
                    existing_line_id=same_location_line.id,
                    requires_supervisor_review=True,
                )
            # else: different, explicitly identified batches at the same
            # location are legitimately separate counts -- fall through.

        if elsewhere_in_session_line is not None:
            return DuplicateVerdict(
                is_duplicate=True,
                reason_code=DuplicateReasonCode.POSSIBLE_RELOCATION,
                severity="WARNING",
                message="This item was counted at a different location in this session.",
                existing_line_id=elsewhere_in_session_line.id,
                requires_supervisor_review=True,
            )

        if semantic_hash_match_line is not None:
            return DuplicateVerdict(
                is_duplicate=True,
                reason_code=DuplicateReasonCode.SEMANTIC_DUPLICATE,
                severity="BLOCKING",
                message=(
                    "An identical count already exists for this session/item/"
                    "location/quantity/version."
                ),
                existing_line_id=semantic_hash_match_line.id,
                requires_supervisor_review=True,
            )

        return DuplicateVerdict(
            is_duplicate=False,
            reason_code=DuplicateReasonCode.NOT_DUPLICATE,
            severity="NONE",
            message="No duplicate detected.",
        )
