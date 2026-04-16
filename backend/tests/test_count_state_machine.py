"""
Unit tests for CountLineStateMachine
"""

import pytest
from backend.services.count_state_machine import (
    CountLineStateMachine,
    StateTransition,
    EditPermission,
)


class MockDB:
    """Mock database for testing"""

    def __init__(self):
        self.count_lines = MockCollection()
        self.activity_logs = MockCollection()


class MockCollection:
    """Mock MongoDB collection"""

    def __init__(self):
        self.data = {}

    async def find_one(self, query):
        """Mock find_one"""
        count_id = query.get("id")
        return self.data.get(count_id)

    async def update_one(self, query, update):
        """Mock update_one"""
        count_id = query.get("id")
        if count_id in self.data:
            self.data[count_id].update(update.get("$set", {}))

    async def insert_one(self, doc):
        """Mock insert_one"""
        doc_id = doc.get("id", "test_id")
        self.data[doc_id] = doc
        return type("obj", (object,), {"inserted_id": doc_id})


# StateTransition Tests


def test_can_transition_draft_to_submitted_staff():
    """Staff can submit draft"""
    assert StateTransition.can_transition("draft", "submitted", "staff") is True


def test_can_transition_draft_to_submitted_supervisor():
    """Supervisor can submit draft"""
    assert StateTransition.can_transition("draft", "submitted", "supervisor") is True


def test_cannot_transition_draft_to_approved():
    """Cannot skip from draft to approved"""
    assert StateTransition.can_transition("draft", "approved", "staff") is False
    assert StateTransition.can_transition("draft", "approved", "supervisor") is False


def test_can_transition_pending_to_approved_supervisor():
    """Supervisor can approve pending"""
    assert StateTransition.can_transition("pending_approval", "approved", "supervisor") is True


def test_cannot_transition_pending_to_approved_staff():
    """Staff cannot approve pending"""
    assert StateTransition.can_transition("pending_approval", "approved", "staff") is False


def test_can_transition_approved_to_locked_admin():
    """Admin can lock approved"""
    assert StateTransition.can_transition("approved", "locked", "admin") is True


def test_cannot_transition_approved_to_locked_supervisor():
    """Supervisor cannot lock approved"""
    assert StateTransition.can_transition("approved", "locked", "supervisor") is False


def test_cannot_transition_from_locked():
    """No transitions allowed from locked state"""
    assert StateTransition.can_transition("locked", "draft", "admin") is False
    assert StateTransition.can_transition("locked", "approved", "admin") is False


def test_get_allowed_transitions_staff_draft():
    """Get allowed transitions for staff in draft state"""
    allowed = StateTransition.get_allowed_transitions("draft", "staff")
    assert "submitted" in allowed
    assert len(allowed) == 1


def test_get_allowed_transitions_supervisor_pending():
    """Get allowed transitions for supervisor in pending state"""
    allowed = StateTransition.get_allowed_transitions("pending_approval", "supervisor")
    assert "approved" in allowed
    assert "rejected" in allowed


# EditPermission Tests


def test_can_edit_draft_staff_owner():
    """Staff can edit their own draft"""
    assert EditPermission.can_edit("draft", "staff", is_owner=True) is True


def test_cannot_edit_draft_staff_not_owner():
    """Staff cannot edit others' draft"""
    assert EditPermission.can_edit("draft", "staff", is_owner=False) is False


def test_can_edit_draft_supervisor():
    """Supervisor can edit any draft"""
    assert EditPermission.can_edit("draft", "supervisor", is_owner=False) is True


def test_cannot_edit_submitted_staff():
    """Staff cannot edit submitted"""
    assert EditPermission.can_edit("submitted", "staff", is_owner=True) is False


def test_can_edit_submitted_supervisor():
    """Supervisor can edit submitted (to reopen)"""
    assert EditPermission.can_edit("submitted", "supervisor", is_owner=False) is True


def test_cannot_edit_locked_anyone():
    """Nobody can edit locked"""
    assert EditPermission.can_edit("locked", "staff", is_owner=True) is False
    assert EditPermission.can_edit("locked", "supervisor", is_owner=False) is False
    assert EditPermission.can_edit("locked", "admin", is_owner=False) is False


def test_can_edit_rejected_staff_owner():
    """Staff can edit rejected (recount)"""
    assert EditPermission.can_edit("rejected", "staff", is_owner=True) is True


def test_can_view_supervisor():
    """Supervisor can view all"""
    assert EditPermission.can_view("draft", "supervisor", is_owner=False) is True
    assert EditPermission.can_view("submitted", "supervisor", is_owner=False) is True
    assert EditPermission.can_view("approved", "supervisor", is_owner=False) is True


def test_can_view_staff_owner():
    """Staff can view their own"""
    assert EditPermission.can_view("draft", "staff", is_owner=True) is True
    assert EditPermission.can_view("submitted", "staff", is_owner=True) is True


def test_cannot_view_staff_not_owner():
    """Staff cannot view others'"""
    assert EditPermission.can_view("draft", "staff", is_owner=False) is False


# CountLineStateMachine Tests


@pytest.mark.asyncio
async def test_transition_draft_to_submitted():
    """Test transitioning from draft to submitted"""
    db = MockDB()
    state_machine = CountLineStateMachine(db)

    # Setup count line
    count_line = {
        "id": "count_001",
        "status": "draft",
        "counted_by": "user1",
    }
    db.count_lines.data["count_001"] = count_line

    # Transition
    result = await state_machine.transition(
        count_line_id="count_001", next_state="submitted", user_id="user1", user_role="staff"
    )

    assert result["success"] is True
    assert result["new_state"] == "submitted"
    assert result["previous_state"] == "draft"


@pytest.mark.asyncio
async def test_transition_invalid_not_allowed():
    """Test that invalid transitions raise error"""
    db = MockDB()
    state_machine = CountLineStateMachine(db)

    count_line = {
        "id": "count_002",
        "status": "draft",
    }
    db.count_lines.data["count_002"] = count_line

    # Try invalid transition
    with pytest.raises(ValueError, match="not allowed"):
        await state_machine.transition(
            count_line_id="count_002",
            next_state="approved",  # Cannot skip to approved
            user_id="user1",
            user_role="staff",
        )


@pytest.mark.asyncio
async def test_can_edit_checks_ownership():
    """Test that can_edit checks ownership correctly"""
    db = MockDB()
    state_machine = CountLineStateMachine(db)

    count_line = {
        "id": "count_003",
        "status": "draft",
        "counted_by": "user1",
    }
    db.count_lines.data["count_003"] = count_line

    # Owner can edit
    can_edit = await state_machine.can_edit("count_003", "user1", "staff")
    assert can_edit is True

    # Non-owner cannot edit
    can_edit = await state_machine.can_edit("count_003", "user2", "staff")
    assert can_edit is False

    # Supervisor can edit regardless
    can_edit = await state_machine.can_edit("count_003", "supervisor1", "supervisor")
    assert can_edit is True


@pytest.mark.asyncio
async def test_get_allowed_actions():
    """Test getting allowed actions for count line"""
    db = MockDB()
    state_machine = CountLineStateMachine(db)

    count_line = {
        "id": "count_004",
        "status": "draft",
    }
    db.count_lines.data["count_004"] = count_line

    actions = await state_machine.get_allowed_actions("count_004", "staff")

    assert actions["current_state"] == "draft"
    assert actions["can_edit"] is True
    assert "submitted" in actions["allowed_transitions"]


@pytest.mark.asyncio
async def test_transition_with_reason():
    """Test transition with reason is stored"""
    db = MockDB()
    state_machine = CountLineStateMachine(db)

    count_line = {
        "id": "count_005",
        "status": "pending_approval",
    }
    db.count_lines.data["count_005"] = count_line

    result = await state_machine.transition(
        count_line_id="count_005",
        next_state="rejected",
        user_id="supervisor1",
        user_role="supervisor",
        reason="Quantity seems incorrect",
    )

    assert result["success"] is True
    updated_line = db.count_lines.data["count_005"]
    assert updated_line.get("rejection_reason") == "Quantity seems incorrect"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
