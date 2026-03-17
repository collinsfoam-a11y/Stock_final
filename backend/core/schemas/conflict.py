from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

from pydantic import BaseModel, Field


class ConflictFork(BaseModel):
    """
    Represents a forked version of an item verification that conflicted
    with an already APPROVED record.
    """

    fork_id: str = Field(default_factory=lambda: str(uuid4()))
    original_item_id: str = Field(..., description="The ID of the approved item being conflicted")
    session_id: str = Field(..., description="The session attempting the change")
    user_id: str = Field(..., description="The user attempting the change")

    # Forked Data
    conflicting_payload: Dict[str, Any] = Field(..., description="The payload that was attempted")

    reason: str = Field(default="Sync conflict on APPROVED record")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    status: str = "CONFLICT_DERIVED"
