from backend.contracts.states import (
    COUNT_LINE_STATES,
    SESSION_STATES,
    normalize_count_line_state,
    normalize_session_state,
)


def test_session_state_contract_and_legacy_aliases():
    assert tuple(SESSION_STATES) == ("CREATED", "ACTIVE", "REVIEW", "FINALIZED")
    assert normalize_session_state("open") == "CREATED"
    assert normalize_session_state("reconcile") == "REVIEW"
    assert normalize_session_state("closed") == "FINALIZED"


def test_count_line_state_contract_and_aliases():
    assert tuple(COUNT_LINE_STATES) == (
        "DRAFT",
        "SUBMITTED",
        "PENDING_APPROVAL",
        "APPROVED",
        "REJECTED",
        "LOCKED",
    )
    assert normalize_count_line_state("pending") == "PENDING_APPROVAL"
    assert normalize_count_line_state("finalized") == "LOCKED"
