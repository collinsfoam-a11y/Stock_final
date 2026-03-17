from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4

from pydantic import BaseModel, Field


class SnapshotItem(BaseModel):
    item_code: str
    stock_qty: float
    warehouse: str
    source_data: Dict[str, Any]  # Minimal ERP fields needed to reconstruct the frozen baseline


class SessionSnapshot(BaseModel):
    """
    Immutable snapshot of inventory state at session start.
    Used to calculate variance against a fixed point in time.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    warehouse: str
    snapshot_hash: str = Field(..., description="SHA256 hash of the items payload")
    items: List[SnapshotItem]
    item_count: int
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc).replace(tzinfo=None)
    )
    config_version_id: str = Field(..., description="The system config active at this time")
