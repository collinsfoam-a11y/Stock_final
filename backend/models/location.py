from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class LocationType(str, Enum):
    WAREHOUSE = "warehouse"
    GODOWN = "godown"
    FLOOR = "floor"
    ZONE = "zone"
    RACK = "rack"
    SHELF = "shelf"
    BIN = "bin"
    OTHER_AREA = "other_area"


LOCATION_TYPE_DEPTH = {location_type: index for index, location_type in enumerate(LocationType)}


class LocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    location_type: LocationType
    parent_id: Optional[str] = None
    code: Optional[str] = Field(default=None, max_length=80)
    legacy_id: Optional[str] = Field(default=None, max_length=160)
    metadata: dict[str, str] = Field(default_factory=dict)

    @field_validator("name", "parent_id", "code", "legacy_id")
    @classmethod
    def normalize_strings(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class LocationRecord(LocationCreate):
    id: str
    slug: str
    depth: int
    path_ids: list[str]
    path_names: list[str]
    active: bool = True
    version: int = 1


class LocationTreeNode(LocationRecord):
    children: list["LocationTreeNode"] = Field(default_factory=list)
