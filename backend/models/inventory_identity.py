from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ItemAliasType(str, Enum):
    ITEM_CODE = "item_code"
    BARCODE = "barcode"
    MANUAL_BARCODE = "manual_barcode"
    UNIT2_BARCODE = "unit2_barcode"
    UNIT_M_BARCODE = "unit_m_barcode"


class ItemAlias(BaseModel):
    alias_type: ItemAliasType
    value: str
    normalized_value: str


class InventoryIdentity(BaseModel):
    id: str
    canonical_code: str
    normalized_code: str
    display_name: str = ""
    aliases: list[ItemAlias] = Field(default_factory=list)
    source_record_ids: list[str] = Field(default_factory=list)
    active: bool = True
    version: int = 1
    collision_state: Optional[str] = None
