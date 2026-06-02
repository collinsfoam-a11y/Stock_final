from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

from backend.tenancy.constants import DEFAULT_ORG_ID

_CURRENT_ORG_ID: ContextVar[str] = ContextVar("current_org_id", default=DEFAULT_ORG_ID)


def set_current_org_id(org_id: str) -> None:
    normalized = str(org_id or "").strip() or DEFAULT_ORG_ID
    _CURRENT_ORG_ID.set(normalized)


def get_current_org_id() -> str:
    return _CURRENT_ORG_ID.get()


def maybe_current_org_id(explicit_org_id: Optional[str]) -> str:
    if explicit_org_id is None:
        return get_current_org_id()
    normalized = str(explicit_org_id or "").strip()
    return normalized or DEFAULT_ORG_ID

