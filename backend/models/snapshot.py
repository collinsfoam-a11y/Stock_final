from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class StockSnapshot(BaseModel):
    """
    Stock Snapshot model (Rule 2 Mandatory)
    Captures ERP qty and creates a hashed baseline for variance reconciliation.
    """

    id: str = Field(..., description="Unique snapshot ID")
    session_id: str = Field(..., description="Related count session ID")
    item_code: str = Field(..., description="ERP Item Code")
    barcode: Optional[str] = None
    erp_qty: float = Field(..., description="Frozen ERP quantity at time of snapshot")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    baseline_hash: str = Field(..., description="SHA256 hash of (item_code + erp_qty + timestamp)")
    created_by: str = Field(..., description="User or system triggering the snapshot")

    model_config = ConfigDict(populate_by_name=True)
