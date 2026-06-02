from __future__ import annotations

from typing import Any, Optional

from backend.tenancy.constants import DEFAULT_ORG_ID
from backend.tenancy.org_context import maybe_current_org_id


def org_id_from_user(current_user: dict[str, Any]) -> str:
    org_id = str(current_user.get("org_id") or "").strip()
    return org_id or DEFAULT_ORG_ID


def org_scoped_filter(
    org_id: Optional[str] = None, base_filter: Optional[dict[str, Any]] = None
) -> dict[str, Any]:
    resolved_org_id = maybe_current_org_id(org_id)
    base = base_filter or {}
    if resolved_org_id == DEFAULT_ORG_ID:
        return {
            "$and": [
                base,
                {"$or": [{"org_id": resolved_org_id}, {"org_id": {"$exists": False}}]},
            ]
        }
    return {"$and": [base, {"org_id": resolved_org_id}]}


def org_scoped_pipeline(org_id: Optional[str], pipeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    scoped_match = org_scoped_filter(org_id, {})
    return [{"$match": scoped_match}, *pipeline]
