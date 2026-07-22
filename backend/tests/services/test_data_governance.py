"""Tests for DataGovernanceService retention policies and GDPR data-subject requests."""

import pytest

from backend.services.data_governance import (
    DataCategory,
    DataGovernanceService,
    RetentionPolicy,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase

pytestmark = pytest.mark.asyncio


def _make() -> DataGovernanceService:
    return DataGovernanceService(InMemoryDatabase())


def _policy(collection_name="activity_logs", days=90) -> RetentionPolicy:
    return RetentionPolicy(
        category=DataCategory.OPERATIONAL,
        collection_name=collection_name,
        retention_days=days,
        archive_before_delete=False,
        description="test policy",
    )


async def test_set_and_get_retention_policy_roundtrip():
    svc = _make()
    assert await svc.set_retention_policy(_policy(days=90)) is True
    policies = await svc.get_retention_policies()
    assert len(policies) == 1
    assert policies[0].collection_name == "activity_logs"
    assert policies[0].retention_days == 90


async def test_set_retention_policy_upserts_not_duplicates():
    svc = _make()
    await svc.set_retention_policy(_policy(days=90))
    await svc.set_retention_policy(_policy(days=120))  # same collection_name -> update
    policies = await svc.get_retention_policies()
    assert len(policies) == 1
    assert policies[0].retention_days == 120


async def test_create_valid_data_subject_request():
    svc = _make()
    req_id = await svc.create_data_subject_request(
        "erasure", subject_id="user-1", subject_email="u@example.com"
    )
    assert req_id
    pending = await svc.get_pending_requests()
    assert len(pending) == 1
    assert pending[0]["request_type"] == "erasure"
    assert pending[0]["subject_id"] == "user-1"
    assert pending[0]["status"] == "pending"


async def test_create_request_rejects_invalid_type():
    svc = _make()
    with pytest.raises(ValueError, match="Invalid request type"):
        await svc.create_data_subject_request("nonsense", subject_id="user-1")


@pytest.mark.parametrize(
    "rtype", ["access", "rectification", "erasure", "portability", "restriction"]
)
async def test_all_gdpr_request_types_accepted(rtype):
    svc = _make()
    req_id = await svc.create_data_subject_request(rtype, subject_id="user-1")
    assert req_id
