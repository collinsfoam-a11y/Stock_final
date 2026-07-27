from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, Optional

from backend.models.audit import AuditEventType
from backend.models.physical_batch import (
    PhysicalBatch,
    PhysicalBatchQuantities,
    PhysicalBatchStatus,
)
from backend.services.audit_service import AuditService
from backend.services.concurrency import ConcurrencyError, build_version_filter
from backend.services.governance_guard import write_authority

_BATCH_NAMESPACE = uuid.UUID("6a61635e-22bf-4fc4-9f76-1dd490f17ab8")
_WHITESPACE = re.compile(r"\s+")


class PhysicalBatchError(ValueError):
    pass


class PhysicalBatchNotFound(PhysicalBatchError):
    pass


def normalize_batch_number(value: Any) -> str:
    return _WHITESPACE.sub("", str(value or "").strip().upper())


def physical_batch_id(item_identity_id: str, batch_number: str) -> str:
    normalized = normalize_batch_number(batch_number)
    if not item_identity_id.strip() or not normalized:
        raise PhysicalBatchError("item identity and batch number are required")
    return str(uuid.uuid5(_BATCH_NAMESPACE, f"{item_identity_id.strip()}:{normalized}"))


_TRANSITIONS: dict[PhysicalBatchStatus, set[PhysicalBatchStatus]] = {
    PhysicalBatchStatus.ACTIVE: {
        PhysicalBatchStatus.QUARANTINED,
        PhysicalBatchStatus.DEPLETED,
        PhysicalBatchStatus.CLOSED,
    },
    PhysicalBatchStatus.QUARANTINED: {
        PhysicalBatchStatus.ACTIVE,
        PhysicalBatchStatus.DEPLETED,
        PhysicalBatchStatus.CLOSED,
    },
    PhysicalBatchStatus.DEPLETED: {
        PhysicalBatchStatus.ACTIVE,
        PhysicalBatchStatus.CLOSED,
    },
    PhysicalBatchStatus.CLOSED: set(),
}


class PhysicalBatchService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def get(self, batch_id: str) -> dict[str, Any]:
        document = await self.db.physical_batches.find_one({"id": batch_id})
        if not document:
            raise PhysicalBatchNotFound(f"Physical batch {batch_id} was not found")
        return document

    async def create(
        self,
        *,
        item_identity_id: str,
        batch_number: str,
        location_id: Optional[str],
        quantities: PhysicalBatchQuantities,
        actor: str,
        change_reference: str,
        manufactured_on: Optional[date] = None,
        expires_on: Optional[date] = None,
    ) -> dict[str, Any]:
        self._require_governance(actor, change_reference)
        if not await self.db.inventory_identities.find_one({"id": item_identity_id}):
            raise PhysicalBatchError("canonical item identity does not exist")
        if location_id and not await self.db.locations.find_one(
            {"id": location_id, "active": True}
        ):
            raise PhysicalBatchError("active location does not exist")
        normalized = normalize_batch_number(batch_number)
        model = PhysicalBatch(
            id=physical_batch_id(item_identity_id, normalized),
            item_identity_id=item_identity_id,
            batch_number=batch_number.strip(),
            normalized_batch_number=normalized,
            location_id=location_id,
            quantities=quantities,
            manufactured_on=manufactured_on,
            expires_on=expires_on,
        )
        now = self._now()
        with write_authority("PhysicalBatchService"):
            result = await self.db.physical_batches.update_one(
                {"id": model.id},
                {
                    "$setOnInsert": model.model_dump(mode="json")
                    | {
                        "created_at": now,
                        "created_by": actor,
                        "updated_at": now,
                        "updated_by": actor,
                        "change_reference": change_reference,
                    }
                },
                upsert=True,
            )
        document = await self.get(model.id)
        if (
            not getattr(result, "upserted_id", None)
            and document.get("item_identity_id") != item_identity_id
        ):
            raise PhysicalBatchError("batch identity collision")
        await self._audit(document, actor, change_reference, "CREATE", before=None)
        return document

    async def update(
        self,
        batch_id: str,
        *,
        expected_version: int,
        actor: str,
        change_reference: str,
        quantities: Optional[PhysicalBatchQuantities] = None,
        status: Optional[PhysicalBatchStatus] = None,
        location_id: Optional[str] = None,
    ) -> dict[str, Any]:
        self._require_governance(actor, change_reference)
        before = await self.get(batch_id)
        current = PhysicalBatch(**before)
        target_status = status or current.status
        if (
            status
            and status != current.status
            and status not in _TRANSITIONS[current.status]
        ):
            raise PhysicalBatchError(
                f"invalid batch transition {current.status} -> {status}"
            )
        target_quantities = quantities or current.quantities
        if (
            target_status == PhysicalBatchStatus.DEPLETED
            and target_quantities.on_hand != 0
        ):
            raise PhysicalBatchError("a depleted batch must have zero on-hand quantity")
        if current.status == PhysicalBatchStatus.CLOSED:
            raise PhysicalBatchError("closed batches are immutable")
        if location_id and not await self.db.locations.find_one(
            {"id": location_id, "active": True}
        ):
            raise PhysicalBatchError("active location does not exist")
        active = target_status != PhysicalBatchStatus.CLOSED
        update_fields: dict[str, Any] = {
            "status": target_status.value,
            "active": active,
            "quantities": target_quantities.model_dump(),
            "updated_at": self._now(),
            "updated_by": actor,
            "change_reference": change_reference,
        }
        if location_id is not None:
            update_fields["location_id"] = location_id
        with write_authority("PhysicalBatchService"):
            result = await self.db.physical_batches.update_one(
                {"$and": [{"id": batch_id}, build_version_filter(expected_version)]},
                {"$set": update_fields, "$inc": {"version": 1}},
            )
        if getattr(result, "modified_count", 0) != 1:
            raise ConcurrencyError(
                f"Physical batch version mismatch for {batch_id} (expected {expected_version})"
            )
        after = await self.get(batch_id)
        await self._audit(after, actor, change_reference, "UPDATE", before=before)
        return after

    @staticmethod
    def _require_governance(actor: str, change_reference: str) -> None:
        if not actor.strip() or not change_reference.strip():
            raise PhysicalBatchError("actor and change_reference are required")

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc).replace(tzinfo=None)

    async def _audit(
        self,
        document: dict[str, Any],
        actor: str,
        change_reference: str,
        decision: str,
        *,
        before: Optional[dict[str, Any]],
    ) -> None:
        await AuditService(self.db).log_event(
            event_type=AuditEventType.PHYSICAL_BATCH_CHANGED,
            actor_id=actor,
            actor_username=actor,
            resource_id=document["id"],
            entity_type="physical_batch",
            entity_id=document["id"],
            decision=decision,
            before=before,
            after=document,
            details={"change_reference": change_reference},
        )
