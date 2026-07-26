from datetime import datetime, timezone
from typing import Any, Dict
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field


class ConfigVersion(BaseModel):
    """
    Immutable configuration version snapshot.
    Generated whenever system settings are updated.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    version_hash: str = Field(..., description="SHA256 hash of the payload")
    payload: Dict[str, Any] = Field(..., description="Full dump of system settings")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(..., description="Username of the admin who made the change")
    active_from: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    description: str = Field(default="Configuration update")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "version_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "payload": {"api_timeout": 30, "cache_enabled": True},
                "created_at": "2024-01-01T12:00:00Z",
                "created_by": "admin",
            }
        }
    )
