"""
Base Models
Shared Pydantic base models with strict validation for the entire API surface.
"""

from pydantic import BaseModel, ConfigDict


class StrictBaseModel(BaseModel):
    """
    Base model that forbids extra fields and enables strict mode.

    - extra="forbid": Rejects unknown fields at the API boundary
      (prevents mass assignment)
    - strict=True: Enforces exact types (no silent coercion)

    All request/response DTOs should inherit from this.
    """

    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True,
    )


class LenientBaseModel(BaseModel):
    """
    Base model that ignores extra fields but enables strict mode.

    - extra="ignore": Silently drops unknown fields (backward compatibility)
    - strict=True: Enforces exact types

    Use for backward-compatible endpoints that must accept legacy payloads.
    """

    model_config = ConfigDict(
        extra="ignore",
        strict=True,
        validate_assignment=True,
        use_enum_values=True,
        populate_by_name=True,
    )
