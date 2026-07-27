from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class DamageCaseStatus(str, Enum):
    OPEN = "OPEN"
    UNDER_REVIEW = "UNDER_REVIEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    RESOLVED = "RESOLVED"
    VOIDED = "VOIDED"


class DamageDisposition(str, Enum):
    RETURNABLE = "RETURNABLE"
    NON_RETURNABLE = "NON_RETURNABLE"


class EvidenceKind(str, Enum):
    PHOTO = "PHOTO"
    DOCUMENT = "DOCUMENT"
    NOTE = "NOTE"


class DamageEvidence(BaseModel):
    id: str
    kind: EvidenceKind
    reference: str = Field(min_length=1, max_length=2048)
    content_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    media_type: Optional[str] = Field(default=None, max_length=100)
    captured_at: datetime
    captured_by: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DamageHistoryEntry(BaseModel):
    from_status: Optional[DamageCaseStatus] = None
    to_status: DamageCaseStatus
    actor: str
    reason: str
    change_reference: str
    changed_at: datetime


class DamageCase(BaseModel):
    id: str
    item_identity_id: str
    quantity: float = Field(gt=0)
    disposition: DamageDisposition
    status: DamageCaseStatus = DamageCaseStatus.OPEN
    physical_batch_id: Optional[str] = None
    canonical_serial_id: Optional[str] = None
    location_id: Optional[str] = None
    session_id: Optional[str] = None
    count_line_id: Optional[str] = None
    description: str = Field(min_length=1, max_length=2000)
    evidence: list[DamageEvidence] = Field(min_length=1)
    history: list[DamageHistoryEntry] = Field(default_factory=list)
    version: int = Field(default=0, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def validate_serial_quantity(self) -> "DamageCase":
        if self.canonical_serial_id and self.quantity != 1:
            raise ValueError("a serial-linked damage case must have quantity 1")
        return self
