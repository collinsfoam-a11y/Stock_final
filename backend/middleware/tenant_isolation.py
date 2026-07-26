"""
FIX GROUP 4: Tenant Isolation Middleware and Repository Guard.

Every query touching sessions, count_lines, inventory, reconciliation,
movements, unknown_items, and reports must include an org_id filter.
This module provides the enforcement mechanism.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Thread-local org_id set by authentication middleware for every request.
_REQUEST_ORG_ID: ContextVar[Optional[str]] = ContextVar("request_org_id", default=None)

# Collections that are scoped per tenant.
TENANT_SCOPED_COLLECTIONS: frozenset[str] = frozenset(
    {
        "sessions",
        "count_lines",
        "inventory_adjustments",
        "inventory_ledger",
        "inventory_movements",
        "reconciliation_records",
        "unknown_items",
        "recount_requests",
        "verification_sessions",
        "session_snapshots",
        "reports",
        "governance_events",
        "sync_conflicts",
    }
)


def set_request_org_id(org_id: Optional[str]) -> None:
    """Called by authentication middleware after token validation."""
    _REQUEST_ORG_ID.set(str(org_id).strip() if org_id is not None else None)


def get_request_org_id() -> Optional[str]:
    """Return the org_id bound to the current request context."""
    return _REQUEST_ORG_ID.get()


def require_org_id() -> str:
    """
    Return the org_id for the current request.
    Raises RuntimeError if no org_id is in context (auth was bypassed).
    """
    org_id = get_request_org_id()
    if not org_id:
        raise RuntimeError(
            "CRITICAL: org_id is missing from request context. Tenant-scoped query blocked."
        )
    return org_id


def inject_org_filter(
    query: dict[str, Any],
    org_id: Optional[str] = None,
) -> dict[str, Any]:
    """
    Inject ``org_id`` into a MongoDB query dict.
    Uses the request-context org_id if none is explicitly provided.
    """
    effective_org = org_id or get_request_org_id()
    if not effective_org:
        raise RuntimeError(
            "CRITICAL: inject_org_filter called without org_id context. "
            "Tenant-scoped query blocked to prevent data leakage."
        )
    return {**query, "org_id": effective_org}


class TenantScopedQuery:
    """
    Helper that wraps a collection and automatically injects the org_id
    filter into all read operations (find / find_one / count_documents / aggregate).
    """

    def __init__(self, collection: Any, org_id: Optional[str] = None) -> None:
        self._collection = collection
        self._org_id = org_id or get_request_org_id()
        if not self._org_id:
            raise RuntimeError(
                "CRITICAL: TenantScopedQuery constructed without org_id context. "
                "Tenant-scoped queries require an explicit org_id or an active request context."
            )

    def _scoped(self, query: dict[str, Any]) -> dict[str, Any]:
        if not self._org_id:
            raise RuntimeError(
                "CRITICAL: TenantScopedQuery used without org_id context. "
                "Tenant-scoped query blocked to prevent data leakage."
            )
        return {**query, "org_id": self._org_id}

    def find(self, query: dict[str, Any] = None, *args: Any, **kwargs: Any) -> Any:
        return self._collection.find(self._scoped(query or {}), *args, **kwargs)

    async def find_one(self, query: dict[str, Any] = None, *args: Any, **kwargs: Any) -> Any:
        return await self._collection.find_one(self._scoped(query or {}), *args, **kwargs)

    async def count_documents(self, query: dict[str, Any] = None, **kwargs: Any) -> int:
        return await self._collection.count_documents(self._scoped(query or {}), **kwargs)

    def aggregate(self, pipeline: list, **kwargs: Any) -> Any:
        if not self._org_id:
            raise RuntimeError(
                "CRITICAL: TenantScopedQuery.aggregate used without org_id context. "
                "Tenant-scoped query blocked to prevent data leakage."
            )
        match_stage = {"$match": {"org_id": self._org_id}}
        return self._collection.aggregate([match_stage, *pipeline], **kwargs)

    def __getattr__(self, item: str) -> Any:
        return getattr(self._collection, item)
