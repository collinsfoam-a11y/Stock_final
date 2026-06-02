"""
FIX GROUP 4 — Regression tests: Tenant isolation (org_id boundary enforcement).

Validates that Org A users cannot read or modify Org B data.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.middleware.tenant_isolation import (
    TenantScopedQuery,
    inject_org_filter,
    set_request_org_id,
    get_request_org_id,
    require_org_id,
    TENANT_SCOPED_COLLECTIONS,
)


def test_inject_org_filter_adds_org_id():
    query = {"session_id": "sess-1"}
    result = inject_org_filter(query, org_id="ORG-A")
    assert result["org_id"] == "ORG-A"
    assert result["session_id"] == "sess-1"


def test_inject_org_filter_does_not_mutate_original():
    original = {"x": 1}
    inject_org_filter(original, org_id="ORG-B")
    assert "org_id" not in original


def test_set_and_get_request_org_id():
    set_request_org_id("ORG-C")
    assert get_request_org_id() == "ORG-C"


def test_require_org_id_raises_when_missing():
    set_request_org_id(None)
    with pytest.raises(RuntimeError, match="org_id is missing"):
        require_org_id()


def test_require_org_id_returns_value_when_set():
    set_request_org_id("ORG-D")
    assert require_org_id() == "ORG-D"


@pytest.mark.asyncio
async def test_scoped_query_injects_org_id_into_find_one():
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value={"session_id": "s1", "org_id": "ORG-A"})

    scoped = TenantScopedQuery(collection, org_id="ORG-A")
    await scoped.find_one({"session_id": "s1"})

    call_args = collection.find_one.call_args
    assert call_args.args[0].get("org_id") == "ORG-A"


@pytest.mark.asyncio
async def test_scoped_query_blocks_cross_tenant_read():
    """
    Org A scoped query must never return Org B documents.
    Simulate: collection returns a doc with org_id=ORG-B, but query has org_id=ORG-A.
    The scoped query must only pass org_id=ORG-A in the filter, so MongoDB would
    naturally exclude Org B data.
    """
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value=None)  # Org A cannot see Org B

    scoped = TenantScopedQuery(collection, org_id="ORG-A")
    result = await scoped.find_one({"session_id": "org-b-session"})

    # Filter must have included org_id=ORG-A
    call_args = collection.find_one.call_args.args[0]
    assert call_args.get("org_id") == "ORG-A"
    assert result is None


def test_all_sensitive_collections_are_tenant_scoped():
    required = {
        "sessions",
        "count_lines",
        "inventory_adjustments",
        "inventory_movements",
        "reconciliation_records",
        "unknown_items",
        "recount_requests",
    }
    missing = required - TENANT_SCOPED_COLLECTIONS
    assert not missing, f"These collections are not tenant-scoped: {missing}"


@pytest.mark.asyncio
async def test_aggregate_prepends_org_match_stage():
    collection = MagicMock()
    collection.aggregate = MagicMock(return_value=iter([]))

    scoped = TenantScopedQuery(collection, org_id="ORG-E")
    scoped.aggregate([{"$group": {"_id": "$item_code"}}])

    pipeline_used = collection.aggregate.call_args.args[0]
    assert pipeline_used[0] == {"$match": {"org_id": "ORG-E"}}, (
        "First pipeline stage must be $match org_id"
    )
