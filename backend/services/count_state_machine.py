"""
Count Line State Machine - Post-submit edit control

Implements state-based access control for count lines:
- draft: Editable by counter
- submitted: Locked for counter, viewable by supervisor
- pending_approval: Awaiting supervisor decision
- approved: Locked for all except admin
- rejected: Reopened for counter with supervisor notes
- locked: Finalized, no edits allowed

State Transitions:
  draft → submitted → pending_approval → approved/rejected
  rejected → draft (reopen)
  approved → locked (finalize)
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class CountLineState(str, Enum):
    """Valid states for count lines"""

    DRAFT = "draft"
    SUBMITTED = "submitted"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    LOCKED = "locked"


class StateTransition:
    """Defines allowed state transitions and their requirements"""

    # Map of current_state -> {next_state: required_role}
    TRANSITIONS = {
        CountLineState.DRAFT: {
            CountLineState.SUBMITTED: ["staff", "supervisor", "admin"],
        },
        CountLineState.SUBMITTED: {
            CountLineState.PENDING_APPROVAL: ["system"],  # Auto-transition
            CountLineState.DRAFT: ["supervisor", "admin"],  # Reopen
        },
        CountLineState.PENDING_APPROVAL: {
            CountLineState.APPROVED: ["supervisor", "admin"],
            CountLineState.REJECTED: ["supervisor", "admin"],
        },
        CountLineState.APPROVED: {
            CountLineState.LOCKED: ["admin"],
            CountLineState.DRAFT: ["admin"],  # Admin override
        },
        CountLineState.REJECTED: {
            CountLineState.DRAFT: ["staff", "supervisor", "admin"],  # Recount
        },
        CountLineState.LOCKED: {
            # No transitions allowed from locked state
        },
    }

    @classmethod
    def can_transition(cls, current_state: str, next_state: str, user_role: str) -> bool:
        """
        Check if a state transition is allowed for the given user role.

        Args:
            current_state: Current state of the count line
            next_state: Desired next state
            user_role: Role of the user attempting the transition

        Returns:
            True if transition is allowed, False otherwise
        """
        try:
            current = CountLineState(current_state)
            next_s = CountLineState(next_state)
        except ValueError:
            logger.error(f"Invalid state: current={current_state}, next={next_state}")
            return False

        allowed_transitions = cls.TRANSITIONS.get(current, {})
        required_roles = allowed_transitions.get(next_s, [])

        # System transitions are always allowed
        if "system" in required_roles:
            return True

        return user_role in required_roles

    @classmethod
    def get_allowed_transitions(cls, current_state: str, user_role: str) -> list[str]:
        """
        Get list of allowed next states for the given user role.

        Args:
            current_state: Current state of the count line
            user_role: Role of the user

        Returns:
            List of allowed next states
        """
        try:
            current = CountLineState(current_state)
        except ValueError:
            return []

        allowed_transitions = cls.TRANSITIONS.get(current, {})

        return [
            next_state.value
            for next_state, required_roles in allowed_transitions.items()
            if user_role in required_roles or "system" in required_roles
        ]


class EditPermission:
    """Defines edit permissions based on state and user role"""

    # Map of state -> {role: can_edit}
    EDIT_PERMISSIONS = {
        CountLineState.DRAFT: {
            "staff": True,
            "supervisor": True,
            "admin": True,
        },
        CountLineState.SUBMITTED: {
            "staff": False,
            "supervisor": True,  # Can reopen
            "admin": True,
        },
        CountLineState.PENDING_APPROVAL: {
            "staff": False,
            "supervisor": False,  # Can only approve/reject
            "admin": True,
        },
        CountLineState.APPROVED: {
            "staff": False,
            "supervisor": False,
            "admin": True,  # Admin override
        },
        CountLineState.REJECTED: {
            "staff": True,  # Can recount
            "supervisor": True,
            "admin": True,
        },
        CountLineState.LOCKED: {
            "staff": False,
            "supervisor": False,
            "admin": False,  # Locked for everyone
        },
    }

    @classmethod
    def can_edit(cls, state: str, user_role: str, is_owner: bool = False) -> bool:
        """
        Check if user can edit count line in given state.

        Args:
            state: Current state of the count line
            user_role: Role of the user
            is_owner: Whether user owns the count line

        Returns:
            True if user can edit, False otherwise
        """
        try:
            state_enum = CountLineState(state)
        except ValueError:
            logger.error(f"Invalid state: {state}")
            return False

        permissions = cls.EDIT_PERMISSIONS.get(state_enum, {})
        can_edit_by_role = permissions.get(user_role, False)

        # Staff can only edit their own count lines
        if user_role == "staff" and not is_owner:
            return False

        return can_edit_by_role

    @classmethod
    def can_view(cls, state: str, user_role: str, is_owner: bool = False) -> bool:
        """
        Check if user can view count line in given state.

        Args:
            state: Current state of the count line
            user_role: Role of the user
            is_owner: Whether user owns the count line

        Returns:
            True if user can view, False otherwise
        """
        # Supervisors and admins can view all
        if user_role in ["supervisor", "admin"]:
            return True

        # Staff can view their own
        if user_role == "staff" and is_owner:
            return True

        return False


class CountLineStateMachine:
    """State machine for managing count line lifecycle"""

    def __init__(self, db):
        self.db = db

    async def transition(
        self,
        count_line_id: str,
        next_state: str,
        user_id: str,
        user_role: str,
        reason: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Transition count line to next state.

        Args:
            count_line_id: ID of the count line
            next_state: Desired next state
            user_id: ID of the user performing transition
            user_role: Role of the user
            reason: Optional reason for transition
            metadata: Optional additional metadata

        Returns:
            Dict with success status and updated count line

        Raises:
            ValueError: If transition is not allowed
        """
        # Get current count line
        count_line = await self.db.count_lines.find_one({"id": count_line_id})
        if not count_line:
            raise ValueError(f"Count line {count_line_id} not found")

        current_state = count_line.get("status", CountLineState.DRAFT.value)

        # Check if transition is allowed
        if not StateTransition.can_transition(current_state, next_state, user_role):
            raise ValueError(
                f"Transition from {current_state} to {next_state} not allowed for role {user_role}"
            )

        # Prepare update data
        update_data = {
            "status": next_state,
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "updated_by": user_id,
        }

        # Add state-specific fields
        if next_state == CountLineState.SUBMITTED.value:
            update_data["submitted_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
            update_data["submitted_by"] = user_id

        elif next_state == CountLineState.APPROVED.value:
            update_data["approved_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
            update_data["approved_by"] = user_id
            update_data["approval_reason"] = reason

        elif next_state == CountLineState.REJECTED.value:
            update_data["rejected_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
            update_data["rejected_by"] = user_id
            update_data["rejection_reason"] = reason

        elif next_state == CountLineState.LOCKED.value:
            update_data["locked_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
            update_data["locked_by"] = user_id

        # Add metadata if provided
        if metadata:
            update_data["state_metadata"] = metadata

        # Update count line
        await self.db.count_lines.update_one({"id": count_line_id}, {"$set": update_data})

        # Log state transition
        await self._log_transition(
            count_line_id=count_line_id,
            from_state=current_state,
            to_state=next_state,
            user_id=user_id,
            user_role=user_role,
            reason=reason,
            metadata=metadata,
        )

        logger.info(
            f"Count line {count_line_id} transitioned from {current_state} to {next_state} "
            f"by {user_id} ({user_role})"
        )

        return {
            "success": True,
            "count_line_id": count_line_id,
            "previous_state": current_state,
            "new_state": next_state,
            "transitioned_by": user_id,
            "transitioned_at": update_data["updated_at"],
        }

    async def _log_transition(
        self,
        count_line_id: str,
        from_state: str,
        to_state: str,
        user_id: str,
        user_role: str,
        reason: Optional[str],
        metadata: Optional[Dict[str, Any]],
    ):
        """Log state transition to audit trail"""
        await self.db.activity_logs.insert_one(
            {
                "user_id": user_id,
                "action": "count_line_state_transition",
                "resource_type": "count_line",
                "resource_id": count_line_id,
                "metadata": {
                    "from_state": from_state,
                    "to_state": to_state,
                    "user_role": user_role,
                    "reason": reason,
                    "additional_metadata": metadata,
                },
                "timestamp": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

    async def can_edit(self, count_line_id: str, user_id: str, user_role: str) -> bool:
        """Check if user can edit the count line"""
        count_line = await self.db.count_lines.find_one({"id": count_line_id})
        if not count_line:
            return False

        state = count_line.get("status", CountLineState.DRAFT.value)
        is_owner = (
            count_line.get("counted_by") == user_id or count_line.get("created_by") == user_id
        )

        return EditPermission.can_edit(state, user_role, is_owner)

    async def can_view(self, count_line_id: str, user_id: str, user_role: str) -> bool:
        """Check if user can view the count line"""
        count_line = await self.db.count_lines.find_one({"id": count_line_id})
        if not count_line:
            return False

        state = count_line.get("status", CountLineState.DRAFT.value)
        is_owner = (
            count_line.get("counted_by") == user_id or count_line.get("created_by") == user_id
        )

        return EditPermission.can_view(state, user_role, is_owner)

    async def get_allowed_actions(
        self, count_line_id: str, user_role: str, user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get allowed actions for count line in current state"""
        count_line = await self.db.count_lines.find_one({"id": count_line_id})
        if not count_line:
            return {"can_edit": False, "can_view": False, "allowed_transitions": []}

        state = count_line.get("status", CountLineState.DRAFT.value)
        if user_id:
            is_owner = (
                count_line.get("counted_by") == user_id or count_line.get("created_by") == user_id
            )
        else:
            is_owner = user_role == "staff"

        return {
            "current_state": state,
            "can_edit": EditPermission.can_edit(state, user_role, is_owner),
            "can_view": EditPermission.can_view(state, user_role, is_owner),
            "allowed_transitions": StateTransition.get_allowed_transitions(state, user_role),
        }
