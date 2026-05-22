"""Pydantic request/response schemas for the count-lines API."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel

from backend.api.schemas import CountLineCreate  # re-export for convenience


class CountLineApprovalRequest(BaseModel):
    """Optional metadata for approving a count line."""

    notes: Optional[str] = None


class CountLineRejectRequest(BaseModel):
    """Optional metadata for requesting a recount."""

    notes: Optional[str] = None
    assign_to: Optional[str] = None


class AddQuantityRequest(BaseModel):
    """Payload for incrementing quantity on an existing count line."""

    additional_qty: float
    batches: Optional[list[dict[str, Any]]] = None


class CountLineUpdateRequest(BaseModel):
    """Minimal update payload for a count line (used by bulk update tooling)."""

    counted_qty: Optional[float] = None
    batches: Optional[list[dict[str, Any]]] = None


class CountLineBatchCreate(BaseModel):
    """Batch create payload for multiple count lines."""

    session_id: str
    lines: list[CountLineCreate]


class CountLineMergeRequest(BaseModel):
    """Request to merge duplicate count lines."""

    source_line_ids: list[str]
    target_line_id: str
    keep_target_qty: bool = True
