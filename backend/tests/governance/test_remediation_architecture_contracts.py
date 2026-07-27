"""Characterization tests for contracts that remediation phases must preserve."""

from backend.api.sync_batch_api import BatchSyncRequest, SyncRecord
from backend.exceptions import ValidationError
from backend.services.count_line_write_service import (
    GOVERNANCE_MODE_PROFILES,
    _build_semantic_hash,
    _is_superseded_count_line,
)
from backend.services.count_state_machine import CountLineState, StateTransition


def test_locked_count_line_has_no_outbound_transition():
    assert StateTransition.get_allowed_transitions(CountLineState.LOCKED.value, "admin") == []


def test_superseded_markers_are_excluded_consistently():
    assert _is_superseded_count_line({"status": "SUPERSEDED"})
    assert _is_superseded_count_line({"superseded_by_version_id": "next-version"})
    assert _is_superseded_count_line({"superseded_at": "2026-07-27T00:00:00Z"})
    assert not _is_superseded_count_line({"status": "pending"})


def test_batch_identity_participates_in_semantic_deduplication():
    base = {
        "session_id": "session-1",
        "item_code": "ITEM-1",
        "location_id": "location-1",
        "counted_qty": 2,
        "version": 1,
    }
    assert _build_semantic_hash({**base, "batch_id": "batch-a"}) != _build_semantic_hash(
        {**base, "batch_id": "batch-b"}
    )


def test_offline_record_requires_stable_client_identity():
    fields = SyncRecord.model_fields
    assert fields["client_record_id"].is_required()
    assert fields["session_id"].is_required()
    assert BatchSyncRequest.model_fields["batch_id"].is_required() is False


def test_error_compatibility_shape_remains_machine_readable():
    payload = ValidationError("Quantity is invalid", field="counted_qty").to_dict()
    assert payload == {
        "error": "VALIDATION_ERROR",
        "message": "Quantity is invalid",
        "details": {"field": "counted_qty"},
    }


def test_repair_mode_is_named_for_explicit_authorization_gate():
    assert "repair" in GOVERNANCE_MODE_PROFILES
