"""
Canonical state contracts shared across backend modules.
"""

from __future__ import annotations

from typing import Final

SESSION_STATES: Final[tuple[str, ...]] = (
    "CREATED",
    "ACTIVE",
    "REVIEW",
    "FINALIZED",
)

COUNT_LINE_STATES: Final[tuple[str, ...]] = (
    "DRAFT",
    "SUBMITTED",
    "PENDING_APPROVAL",
    "APPROVED",
    "REJECTED",
    "LOCKED",
)

LEGACY_SESSION_STATUS_ALIASES: Final[dict[str, str]] = {
    "OPEN": "CREATED",
    "ACTIVE": "ACTIVE",
    "PAUSED": "ACTIVE",
    "RECONCILE": "REVIEW",
    "RECONCILING": "REVIEW",
    "REVIEW": "REVIEW",
    "COMPLETED": "FINALIZED",
    "CLOSED": "FINALIZED",
    "CANCELLED": "FINALIZED",
    "FINALIZED": "FINALIZED",
    "CREATED": "CREATED",
}

COUNT_LINE_STATUS_ALIASES: Final[dict[str, str]] = {
    "FINALIZED": "LOCKED",
    "LOCKED": "LOCKED",
    "APPROVED": "APPROVED",
    "REJECTED": "REJECTED",
    "PENDING": "PENDING_APPROVAL",
    "PENDING_APPROVAL": "PENDING_APPROVAL",
    "SUBMITTED": "SUBMITTED",
    "DRAFT": "DRAFT",
}


def normalize_session_state(value: object) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return "UNKNOWN"
    return LEGACY_SESSION_STATUS_ALIASES.get(raw, raw)


def normalize_count_line_state(value: object) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return "UNKNOWN"
    return COUNT_LINE_STATUS_ALIASES.get(raw, raw)
