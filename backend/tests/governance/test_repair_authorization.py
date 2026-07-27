import pytest

from backend.services.count_line_write_service import CountLineWriteService
from backend.services.governance_guard import GovernanceViolation


def test_repair_mode_rejects_missing_authorization_metadata():
    with pytest.raises(GovernanceViolation, match="repair_authorized"):
        CountLineWriteService._resolve_governance_mode_profile(
            {"governance_mode": "repair", "validation_mode": "repair_skip"}
        )


def test_repair_mode_accepts_complete_authorization_metadata():
    profile = CountLineWriteService._resolve_governance_mode_profile(
        {
            "governance_mode": "repair",
            "validation_mode": "repair_skip",
            "repair_authorized": True,
            "repair_actor": "supervisor-1",
            "repair_reason": "Correct legacy projection",
            "repair_change_reference": "INC-123",
        }
    )
    assert profile.require_active_session is False
    assert profile.require_full_context is False


def test_repair_metadata_is_stamped_on_update():
    payload = {"operation": "update_one", "update": {"$set": {"item_name": "Correct"}}}
    CountLineWriteService._stamp_repair_metadata(
        payload,
        {
            "governance_mode": "repair",
            "repair_actor": "supervisor-1",
            "repair_reason": "Correct legacy projection",
            "repair_change_reference": "INC-123",
        },
    )
    stamped = payload["update"]["$set"]
    assert stamped["repair_actor"] == "supervisor-1"
    assert stamped["repair_reason"] == "Correct legacy projection"
    assert stamped["repair_change_reference"] == "INC-123"
    assert stamped["repaired_at"] is not None
