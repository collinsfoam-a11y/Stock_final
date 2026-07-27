from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SerialStatus(str, Enum):
    IN_STOCK = "IN_STOCK"
    QUARANTINED = "QUARANTINED"
    ALLOCATED = "ALLOCATED"
    CONSUMED = "CONSUMED"
    RETIRED = "RETIRED"


class SerialHistoryEntry(BaseModel):
    from_status: Optional[SerialStatus] = None
    to_status: SerialStatus
    from_location_id: Optional[str] = None
    to_location_id: Optional[str] = None
    actor: str
    change_reference: str
    source: str
    changed_at: datetime


class CanonicalSerial(BaseModel):
    id: str
    serial_number: str
    normalized_serial: str
    item_identity_id: str
    physical_batch_id: Optional[str] = None
    location_id: Optional[str] = None
    status: SerialStatus = SerialStatus.IN_STOCK
    history: list[SerialHistoryEntry] = Field(default_factory=list)
    version: int = Field(default=0, ge=0)
    active: bool = True
