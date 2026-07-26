from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


class SyncItem(BaseModel):
    """
    Represents a single item in the sync queue.
    """

    operation: Literal["count_update", "session_complete", "session_start"]
    entity_type: Literal["count_line", "session"]
    entity_id: str | None = None
    payload: dict[str, Any]
    created_at: datetime
    retry_count: int = 0
    status: Literal["pending", "syncing", "synced", "failed", "conflict"] = "pending"
    error_message: str | None = None


class SyncRequest(BaseModel):
    """
    Batch sync request from client.
    """

    items: list[SyncItem]
    device_id: str
