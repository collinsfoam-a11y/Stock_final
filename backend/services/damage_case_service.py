from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.models.audit import AuditEventType
from backend.models.damage_case import (
    DamageCase,
    DamageCaseStatus,
    DamageDisposition,
    DamageEvidence,
    DamageHistoryEntry,
)
from backend.services.audit_service import AuditService
from backend.services.concurrency import ConcurrencyError, build_version_filter
from backend.services.governance_guard import write_authority


class DamageCaseError(ValueError):
    pass


class DamageCaseNotFound(DamageCaseError):
    pass


_TRANSITIONS: dict[DamageCaseStatus, set[DamageCaseStatus]] = {
    DamageCaseStatus.OPEN: {
        DamageCaseStatus.UNDER_REVIEW,
        DamageCaseStatus.VOIDED,
    },
    DamageCaseStatus.UNDER_REVIEW: {
        DamageCaseStatus.APPROVED,
        DamageCaseStatus.REJECTED,
        DamageCaseStatus.VOIDED,
    },
    DamageCaseStatus.APPROVED: {DamageCaseStatus.RESOLVED},
    DamageCaseStatus.REJECTED: {DamageCaseStatus.UNDER_REVIEW, DamageCaseStatus.VOIDED},
    DamageCaseStatus.RESOLVED: set(),
    DamageCaseStatus.VOIDED: set(),
}


class DamageCaseService:
    AUTHORITY = "DamageCaseService"

    def __init__(self, db: Any) -> None:
        self.db = db

    async def get(self, case_id: str) -> dict[str, Any]:
        document = await self.db.damage_cases.find_one({"id": case_id})
        if not document:
            raise DamageCaseNotFound(f"damage case {case_id} was not found")
        return document

    async def create(
        self,
        *,
        item_identity_id: str,
        quantity: float,
        disposition: DamageDisposition,
        description: str,
        evidence: list[DamageEvidence],
        actor: str,
        reason: str,
        change_reference: str,
        physical_batch_id: Optional[str] = None,
        canonical_serial_id: Optional[str] = None,
        location_id: Optional[str] = None,
        session_id: Optional[str] = None,
        count_line_id: Optional[str] = None,
    ) -> dict[str, Any]:
        self._require_governance(actor, reason, change_reference)
        await self._validate_links(
            item_identity_id, physical_batch_id, canonical_serial_id, location_id
        )
        now = self._now()
        case_id = str(uuid.uuid4())
        history = DamageHistoryEntry(
            to_status=DamageCaseStatus.OPEN,
            actor=actor,
            reason=reason,
            change_reference=change_reference,
            changed_at=now,
        )
        model = DamageCase(
            id=case_id,
            item_identity_id=item_identity_id,
            quantity=quantity,
            disposition=disposition,
            description=description,
            evidence=evidence,
            history=[history],
            physical_batch_id=physical_batch_id,
            canonical_serial_id=canonical_serial_id,
            location_id=location_id,
            session_id=session_id,
            count_line_id=count_line_id,
        )
        document = model.model_dump(mode="json") | {
            "created_at": now,
            "created_by": actor,
            "updated_at": now,
            "updated_by": actor,
            "change_reference": change_reference,
        }
        with write_authority(self.AUTHORITY):
            await self.db.damage_cases.insert_one(document)
        await self._audit(document, actor, reason, change_reference, "CREATE", None)
        return document

    async def add_evidence(
        self,
        case_id: str,
        *,
        evidence: DamageEvidence,
        expected_version: int,
        actor: str,
        reason: str,
        change_reference: str,
    ) -> dict[str, Any]:
        self._require_governance(actor, reason, change_reference)
        before = await self.get(case_id)
        if before.get("status") in {
            DamageCaseStatus.RESOLVED.value,
            DamageCaseStatus.VOIDED.value,
        }:
            raise DamageCaseError("terminal damage cases are immutable")
        if any(row.get("id") == evidence.id for row in before.get("evidence", [])):
            raise DamageCaseError(f"evidence {evidence.id} already exists")
        with write_authority(self.AUTHORITY):
            result = await self.db.damage_cases.update_one(
                {"$and": [{"id": case_id}, build_version_filter(expected_version)]},
                {
                    "$push": {"evidence": evidence.model_dump(mode="json")},
                    "$set": {
                        "updated_at": self._now(),
                        "updated_by": actor,
                        "change_reference": change_reference,
                    },
                    "$inc": {"version": 1},
                },
            )
        if getattr(result, "modified_count", 0) != 1:
            raise ConcurrencyError(
                f"Damage case version mismatch for {case_id} (expected {expected_version})"
            )
        after = await self.get(case_id)
        await self._audit(
            after, actor, reason, change_reference, "ADD_EVIDENCE", before
        )
        return after

    async def transition(
        self,
        case_id: str,
        *,
        status: DamageCaseStatus,
        expected_version: int,
        actor: str,
        reason: str,
        change_reference: str,
    ) -> dict[str, Any]:
        self._require_governance(actor, reason, change_reference)
        before = await self.get(case_id)
        current = DamageCaseStatus(before.get("status", DamageCaseStatus.OPEN))
        if current == status:
            return before
        if status not in _TRANSITIONS[current]:
            raise DamageCaseError(f"invalid damage transition {current} -> {status}")
        now = self._now()
        history = DamageHistoryEntry(
            from_status=current,
            to_status=status,
            actor=actor,
            reason=reason,
            change_reference=change_reference,
            changed_at=now,
        ).model_dump(mode="json")
        with write_authority(self.AUTHORITY):
            result = await self.db.damage_cases.update_one(
                {"$and": [{"id": case_id}, build_version_filter(expected_version)]},
                {
                    "$set": {
                        "status": status.value,
                        "active": status
                        not in {DamageCaseStatus.RESOLVED, DamageCaseStatus.VOIDED},
                        "updated_at": now,
                        "updated_by": actor,
                        "change_reference": change_reference,
                    },
                    "$push": {"history": history},
                    "$inc": {"version": 1},
                },
            )
        if getattr(result, "modified_count", 0) != 1:
            raise ConcurrencyError(
                f"Damage case version mismatch for {case_id} (expected {expected_version})"
            )
        after = await self.get(case_id)
        await self._audit(after, actor, reason, change_reference, "TRANSITION", before)
        return after

    async def _validate_links(
        self,
        item_identity_id: str,
        physical_batch_id: Optional[str],
        canonical_serial_id: Optional[str],
        location_id: Optional[str],
    ) -> None:
        if not await self.db.inventory_identities.find_one({"id": item_identity_id}):
            raise DamageCaseError("canonical item identity does not exist")
        if physical_batch_id:
            batch = await self.db.physical_batches.find_one({"id": physical_batch_id})
            if not batch or batch.get("item_identity_id") != item_identity_id:
                raise DamageCaseError("physical batch does not belong to the item")
        if canonical_serial_id:
            serial = await self.db.canonical_serials.find_one(
                {"id": canonical_serial_id}
            )
            if not serial or serial.get("item_identity_id") != item_identity_id:
                raise DamageCaseError("canonical serial does not belong to the item")
            if physical_batch_id and serial.get("physical_batch_id") not in {
                None,
                physical_batch_id,
            }:
                raise DamageCaseError(
                    "canonical serial does not belong to the physical batch"
                )
        if location_id and not await self.db.locations.find_one(
            {"id": location_id, "active": True}
        ):
            raise DamageCaseError("active location does not exist")

    @staticmethod
    def _require_governance(actor: str, reason: str, change_reference: str) -> None:
        if not actor.strip() or not reason.strip() or not change_reference.strip():
            raise DamageCaseError("actor, reason, and change_reference are required")

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    async def _audit(
        self,
        document: dict[str, Any],
        actor: str,
        reason: str,
        change_reference: str,
        decision: str,
        before: Optional[dict[str, Any]],
    ) -> None:
        await AuditService(self.db).log_event(
            event_type=AuditEventType.DAMAGE_CASE_CHANGED,
            actor_id=actor,
            actor_username=actor,
            resource_id=document["id"],
            entity_type="damage_case",
            entity_id=document["id"],
            decision=decision,
            reason=reason,
            before=before,
            after=document,
            details={"change_reference": change_reference},
        )
