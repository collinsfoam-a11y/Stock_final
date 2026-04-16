"""
Count Line State Management API - Post-submit edit control

Provides endpoints for managing count line state transitions:
- Submit count line
- Approve/Reject count line
- Reopen count line
- Lock count line
- Check edit permissions
"""

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.count_state_machine import CountLineState, CountLineStateMachine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/count-lines", tags=["Count Line State Management"])


def _get_user_id(current_user: dict) -> str:
    return (
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or str(current_user.get("_id", "unknown"))
    )


# Request/Response Models


class StateTransitionRequest(BaseModel):
    """Request to transition count line state"""

    reason: Optional[str] = Field(None, description="Reason for transition")
    metadata: Optional[dict] = Field(None, description="Additional metadata")


class StateTransitionResponse(BaseModel):
    """Response from state transition"""

    success: bool
    count_line_id: str
    previous_state: str
    new_state: str
    transitioned_by: str
    message: str


class EditPermissionResponse(BaseModel):
    """Response for edit permission check"""

    can_edit: bool
    can_view: bool
    current_state: str
    allowed_transitions: list[str]
    message: str


class ReopenRequest(BaseModel):
    """Request to reopen a count line"""

    reason: str = Field(..., description="Reason for reopening")
    assign_to: Optional[str] = Field(None, description="User to assign recount to")


# API Endpoints


@router.post("/{count_line_id}/submit", response_model=StateTransitionResponse)
async def submit_count_line(
    count_line_id: str,
    request_data: StateTransitionRequest = Body(...),
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Submit count line for approval.

    Transitions: draft → submitted

    Permissions: Staff (owner), Supervisor, Admin
    """
    try:
        state_machine = CountLineStateMachine(db)

        # Check if user can edit
        can_edit = await state_machine.can_edit(
            count_line_id,
            _get_user_id(current_user),
            current_user.get("role", "staff"),
        )

        if not can_edit:
            raise HTTPException(
                status_code=403, detail="You do not have permission to submit this count line"
            )

        # Transition to submitted
        result = await state_machine.transition(
            count_line_id=count_line_id,
            next_state=CountLineState.SUBMITTED.value,
            user_id=_get_user_id(current_user),
            user_role=current_user.get("role", "staff"),
            reason=request_data.reason,
            metadata=request_data.metadata,
        )

        return StateTransitionResponse(
            success=True,
            count_line_id=result["count_line_id"],
            previous_state=result["previous_state"],
            new_state=result["new_state"],
            transitioned_by=result["transitioned_by"],
            message="Count line submitted successfully",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error submitting count line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{count_line_id}/approve", response_model=StateTransitionResponse)
async def approve_count_line(
    count_line_id: str,
    request_data: StateTransitionRequest = Body(...),
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Approve count line.

    Transitions: pending_approval → approved

    Permissions: Supervisor, Admin
    """
    try:
        state_machine = CountLineStateMachine(db)

        result = await state_machine.transition(
            count_line_id=count_line_id,
            next_state=CountLineState.APPROVED.value,
            user_id=_get_user_id(current_user),
            user_role=current_user.get("role", "supervisor"),
            reason=request_data.reason,
            metadata=request_data.metadata,
        )

        return StateTransitionResponse(
            success=True,
            count_line_id=result["count_line_id"],
            previous_state=result["previous_state"],
            new_state=result["new_state"],
            transitioned_by=result["transitioned_by"],
            message="Count line approved successfully",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error approving count line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{count_line_id}/reject", response_model=StateTransitionResponse)
async def reject_count_line(
    count_line_id: str,
    request_data: StateTransitionRequest = Body(...),
    current_user: dict = require_permission(Permission.COUNT_LINE_REJECT),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Reject count line and request recount.

    Transitions: pending_approval → rejected

    Permissions: Supervisor, Admin
    """
    if not request_data.reason:
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    try:
        state_machine = CountLineStateMachine(db)

        result = await state_machine.transition(
            count_line_id=count_line_id,
            next_state=CountLineState.REJECTED.value,
            user_id=_get_user_id(current_user),
            user_role=current_user.get("role", "supervisor"),
            reason=request_data.reason,
            metadata=request_data.metadata,
        )

        return StateTransitionResponse(
            success=True,
            count_line_id=result["count_line_id"],
            previous_state=result["previous_state"],
            new_state=result["new_state"],
            transitioned_by=result["transitioned_by"],
            message="Count line rejected. Recount requested.",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error rejecting count line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{count_line_id}/reopen", response_model=StateTransitionResponse)
async def reopen_count_line(
    count_line_id: str,
    reopen_data: ReopenRequest,
    current_user: dict = require_permission(Permission.COUNT_LINE_APPROVE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Reopen a submitted/approved count line for editing.

    Transitions: submitted/approved → draft

    Permissions: Supervisor, Admin
    """
    try:
        state_machine = CountLineStateMachine(db)

        metadata = {
            "reopened_for_recount": True,
            "assigned_to": reopen_data.assign_to,
        }

        result = await state_machine.transition(
            count_line_id=count_line_id,
            next_state=CountLineState.DRAFT.value,
            user_id=_get_user_id(current_user),
            user_role=current_user.get("role", "supervisor"),
            reason=reopen_data.reason,
            metadata=metadata,
        )

        # If assigned to specific user, update count line
        if reopen_data.assign_to:
            await db.count_lines.update_one(
                {"id": count_line_id}, {"$set": {"assigned_to": reopen_data.assign_to}}
            )

        return StateTransitionResponse(
            success=True,
            count_line_id=result["count_line_id"],
            previous_state=result["previous_state"],
            new_state=result["new_state"],
            transitioned_by=result["transitioned_by"],
            message=f"Count line reopened for recount{' and assigned to ' + reopen_data.assign_to if reopen_data.assign_to else ''}",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error reopening count line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{count_line_id}/lock", response_model=StateTransitionResponse)
async def lock_count_line(
    count_line_id: str,
    request_data: StateTransitionRequest = Body(...),
    current_user: dict = require_permission(Permission.SETTINGS_MANAGE),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Lock count line (finalize, no further edits).

    Transitions: approved → locked

    Permissions: Admin only
    """
    try:
        state_machine = CountLineStateMachine(db)

        result = await state_machine.transition(
            count_line_id=count_line_id,
            next_state=CountLineState.LOCKED.value,
            user_id=_get_user_id(current_user),
            user_role=current_user.get("role", "admin"),
            reason=request_data.reason,
            metadata=request_data.metadata,
        )

        return StateTransitionResponse(
            success=True,
            count_line_id=result["count_line_id"],
            previous_state=result["previous_state"],
            new_state=result["new_state"],
            transitioned_by=result["transitioned_by"],
            message="Count line locked successfully",
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error locking count line: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{count_line_id}/permissions", response_model=EditPermissionResponse)
async def check_edit_permissions(
    count_line_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Check what actions the current user can perform on the count line.

    Returns:
    - can_edit: Whether user can edit the count line
    - can_view: Whether user can view the count line
    - current_state: Current state of the count line
    - allowed_transitions: List of allowed state transitions
    """
    try:
        state_machine = CountLineStateMachine(db)

        actions = await state_machine.get_allowed_actions(
            count_line_id, current_user.get("role", "staff")
        )

        return EditPermissionResponse(
            can_edit=actions["can_edit"],
            can_view=actions["can_view"],
            current_state=actions["current_state"],
            allowed_transitions=actions["allowed_transitions"],
            message=f"User can {'edit' if actions['can_edit'] else 'not edit'} this count line",
        )

    except Exception as e:
        logger.error(f"Error checking permissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{count_line_id}/state")
async def get_count_line_state(
    count_line_id: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get current state and state history of count line"""
    count_line = await db.count_lines.find_one({"id": count_line_id})

    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")

    # Get state history from activity logs
    state_history = (
        await db.activity_logs.find(
            {
                "resource_type": "count_line",
                "resource_id": count_line_id,
                "action": "count_line_state_transition",
            }
        )
        .sort("timestamp", -1)
        .to_list(100)
    )

    return {
        "count_line_id": count_line_id,
        "current_state": count_line.get("status", "draft"),
        "submitted_at": count_line.get("submitted_at"),
        "approved_at": count_line.get("approved_at"),
        "rejected_at": count_line.get("rejected_at"),
        "locked_at": count_line.get("locked_at"),
        "state_history": [
            {
                "from_state": log["metadata"].get("from_state"),
                "to_state": log["metadata"].get("to_state"),
                "user_id": log.get("user_id"),
                "reason": log["metadata"].get("reason"),
                "timestamp": log.get("timestamp"),
            }
            for log in state_history
        ],
    }
