from __future__ import annotations

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class PhysicalBatchStatus(str, Enum):
    ACTIVE = "ACTIVE"
    QUARANTINED = "QUARANTINED"
    DEPLETED = "DEPLETED"
    CLOSED = "CLOSED"


class PhysicalBatchQuantities(BaseModel):
    on_hand: float = Field(default=0, ge=0)
    damaged: float = Field(default=0, ge=0)
    reserved: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_components(self) -> "PhysicalBatchQuantities":
        if self.damaged + self.reserved > self.on_hand:
            raise ValueError(
                "damaged plus reserved quantity cannot exceed on-hand quantity"
            )
        return self

    @property
    def available(self) -> float:
        return self.on_hand - self.damaged - self.reserved


class PhysicalBatch(BaseModel):
    id: str
    item_identity_id: str
    batch_number: str
    normalized_batch_number: str
    location_id: Optional[str] = None
    status: PhysicalBatchStatus = PhysicalBatchStatus.ACTIVE
    quantities: PhysicalBatchQuantities = Field(default_factory=PhysicalBatchQuantities)
    manufactured_on: Optional[date] = None
    expires_on: Optional[date] = None
    version: int = Field(default=0, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def validate_dates_and_status(self) -> "PhysicalBatch":
        if (
            self.manufactured_on
            and self.expires_on
            and self.expires_on < self.manufactured_on
        ):
            raise ValueError("expiry date cannot precede manufacturing date")
        if self.status == PhysicalBatchStatus.DEPLETED and self.quantities.on_hand != 0:
            raise ValueError("a depleted batch must have zero on-hand quantity")
        if self.status == PhysicalBatchStatus.CLOSED and self.active:
            raise ValueError("a closed batch cannot remain active")
        return self
