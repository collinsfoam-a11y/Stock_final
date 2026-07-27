from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from backend.models.damage_case import (
    DamageCase,
    DamageCaseStatus,
    DamageDisposition,
    DamageEvidence,
    EvidenceKind,
)
from backend.services.concurrency import ConcurrencyError
from backend.services.damage_case_service import DamageCaseError, DamageCaseService


def evidence(evidence_id: str = "e-1") -> DamageEvidence:
    return DamageEvidence(
        id=evidence_id,
        kind=EvidenceKind.PHOTO,
        reference="https://example.com/evidence.jpg",
        content_hash="a" * 64,
        captured_at=datetime(2026, 1, 1),
        captured_by="staff",
    )


def test_evidence_requires_sha256_and_serial_damage_quantity_is_one():
    with pytest.raises(ValidationError):
        DamageEvidence(
            id="bad",
            kind=EvidenceKind.PHOTO,
            reference="ref",
            content_hash="short",
            captured_at=datetime(2026, 1, 1),
            captured_by="staff",
        )
    with pytest.raises(ValidationError, match="quantity 1"):
        DamageCase(
            id="case-1",
            item_identity_id="item-1",
            quantity=2,
            disposition=DamageDisposition.RETURNABLE,
            description="Broken",
            evidence=[evidence()],
            canonical_serial_id="serial-1",
        )


@pytest.mark.asyncio
async def test_create_requires_item_owned_batch_and_serial():
    db = MagicMock()
    db.inventory_identities.find_one = AsyncMock(return_value={"id": "item-1"})
    db.physical_batches.find_one = AsyncMock(
        return_value={"id": "batch-1", "item_identity_id": "item-2"}
    )
    with pytest.raises(DamageCaseError, match="batch does not belong"):
        await DamageCaseService(db).create(
            item_identity_id="item-1",
            quantity=1,
            disposition=DamageDisposition.RETURNABLE,
            description="Broken",
            evidence=[evidence()],
            actor="admin",
            reason="Inspection",
            change_reference="CHG-1",
            physical_batch_id="batch-1",
        )


@pytest.mark.asyncio
async def test_add_evidence_is_append_only_and_optimistically_locked():
    db = MagicMock()
    before = {"id": "case-1", "status": "OPEN", "version": 2, "evidence": []}
    db.damage_cases.find_one = AsyncMock(return_value=before)
    db.damage_cases.update_one = AsyncMock(return_value=MagicMock(modified_count=0))
    with pytest.raises(ConcurrencyError, match="version mismatch"):
        await DamageCaseService(db).add_evidence(
            "case-1",
            evidence=evidence(),
            expected_version=1,
            actor="admin",
            reason="More evidence",
            change_reference="CHG-2",
        )
    query, update = db.damage_cases.update_one.await_args.args
    assert {"version": 1} in query["$and"]
    assert "$push" in update and "$pull" not in update


@pytest.mark.asyncio
async def test_terminal_case_is_immutable_and_invalid_transition_is_rejected():
    db = MagicMock()
    db.damage_cases.find_one = AsyncMock(
        return_value={"id": "case-1", "status": "RESOLVED", "evidence": []}
    )
    service = DamageCaseService(db)
    with pytest.raises(DamageCaseError, match="immutable"):
        await service.add_evidence(
            "case-1",
            evidence=evidence(),
            expected_version=1,
            actor="admin",
            reason="Late evidence",
            change_reference="CHG-3",
        )
    with pytest.raises(DamageCaseError, match="invalid damage transition"):
        await service.transition(
            "case-1",
            status=DamageCaseStatus.OPEN,
            expected_version=1,
            actor="admin",
            reason="Reopen",
            change_reference="CHG-4",
        )
