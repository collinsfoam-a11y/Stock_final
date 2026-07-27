from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from pymongo.errors import DuplicateKeyError

from backend.models.audit import AuditEventType
from backend.models.canonical_serial import (
    CanonicalSerial,
    SerialHistoryEntry,
    SerialStatus,
)
from backend.services.audit_service import AuditService
from backend.services.concurrency import ConcurrencyError, build_version_filter
from backend.services.governance_guard import write_authority

_SERIAL_NAMESPACE = uuid.UUID("bc8cffea-d4eb-4692-b0e5-67a4fdfe9c9c")
_WHITESPACE = re.compile(r"\s+")


class CanonicalSerialError(ValueError):
    pass


class CanonicalSerialNotFound(CanonicalSerialError):
    pass


class DuplicateSerialError(CanonicalSerialError):
    pass


def normalize_serial(value: Any) -> str:
    return _WHITESPACE.sub("", str(value or "").strip().upper())


def canonical_serial_id(serial_number: str) -> str:
    normalized = normalize_serial(serial_number)
    if not normalized:
        raise CanonicalSerialError("serial number is required")
    return str(uuid.uuid5(_SERIAL_NAMESPACE, normalized))


_TRANSITIONS: dict[SerialStatus, set[SerialStatus]] = {
    SerialStatus.IN_STOCK: {
        SerialStatus.QUARANTINED,
        SerialStatus.ALLOCATED,
        SerialStatus.CONSUMED,
        SerialStatus.RETIRED,
    },
    SerialStatus.QUARANTINED: {SerialStatus.IN_STOCK, SerialStatus.RETIRED},
    SerialStatus.ALLOCATED: {
        SerialStatus.IN_STOCK,
        SerialStatus.CONSUMED,
        SerialStatus.RETIRED,
    },
    SerialStatus.CONSUMED: {SerialStatus.RETIRED},
    SerialStatus.RETIRED: set(),
}


class CanonicalSerialService:
    AUTHORITY = "CanonicalSerialService"

    def __init__(self, db: Any) -> None:
        self.db = db

    async def resolve(self, serial_number: str) -> Optional[dict[str, Any]]:
        normalized = normalize_serial(serial_number)
        if not normalized:
            return None
        return await self.db.canonical_serials.find_one(
            {"normalized_serial": normalized}
        )

    async def register(
        self,
        *,
        serial_number: str,
        item_identity_id: str,
        physical_batch_id: Optional[str],
        location_id: Optional[str],
        actor: str,
        change_reference: str,
        source: str,
    ) -> dict[str, Any]:
        self._require_governance(actor, change_reference, source)
        await self._validate_links(item_identity_id, physical_batch_id, location_id)
        normalized = normalize_serial(serial_number)
        existing = await self.resolve(normalized)
        if existing:
            if (
                existing.get("item_identity_id") == item_identity_id
                and existing.get("physical_batch_id") == physical_batch_id
            ):
                return existing
            raise DuplicateSerialError(
                f"serial {normalized} is already assigned to another item or batch"
            )
        now = self._now()
        history = SerialHistoryEntry(
            to_status=SerialStatus.IN_STOCK,
            to_location_id=location_id,
            actor=actor,
            change_reference=change_reference,
            source=source,
            changed_at=now,
        )
        model = CanonicalSerial(
            id=canonical_serial_id(normalized),
            serial_number=serial_number.strip(),
            normalized_serial=normalized,
            item_identity_id=item_identity_id,
            physical_batch_id=physical_batch_id,
            location_id=location_id,
            history=[history],
        )
        document = model.model_dump(mode="json") | {
            "created_at": now,
            "created_by": actor,
            "updated_at": now,
            "updated_by": actor,
            "change_reference": change_reference,
        }
        try:
            with write_authority(self.AUTHORITY):
                await self.db.canonical_serials.insert_one(document)
        except DuplicateKeyError as exc:
            winner = await self.resolve(normalized)
            if winner and winner.get("item_identity_id") == item_identity_id:
                return winner
            raise DuplicateSerialError(
                f"serial {normalized} is already registered"
            ) from exc
        await self._audit(document, actor, change_reference, "REGISTER", before=None)
        return document

    async def import_serials(
        self,
        records: Iterable[dict[str, Any]],
        *,
        actor: str,
        change_reference: str,
    ) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []
        seen: set[str] = set()
        for index, record in enumerate(records):
            normalized = normalize_serial(record.get("serial_number"))
            if not normalized or normalized in seen:
                errors.append(
                    {
                        "index": str(index),
                        "serial": normalized,
                        "error": "duplicate or empty serial in import",
                    }
                )
                continue
            seen.add(normalized)
            try:
                results.append(
                    await self.register(
                        serial_number=str(record.get("serial_number") or ""),
                        item_identity_id=str(record.get("item_identity_id") or ""),
                        physical_batch_id=record.get("physical_batch_id"),
                        location_id=record.get("location_id"),
                        actor=actor,
                        change_reference=change_reference,
                        source="IMPORT",
                    )
                )
            except CanonicalSerialError as exc:
                errors.append(
                    {"index": str(index), "serial": normalized, "error": str(exc)}
                )
        return {"registered": len(results), "failed": len(errors), "errors": errors}

    async def transition(
        self,
        serial_id: str,
        *,
        status: SerialStatus,
        expected_version: int,
        actor: str,
        change_reference: str,
        location_id: Optional[str] = None,
        source: str = "API",
    ) -> dict[str, Any]:
        self._require_governance(actor, change_reference, source)
        before = await self.db.canonical_serials.find_one({"id": serial_id})
        if not before:
            raise CanonicalSerialNotFound(f"serial {serial_id} was not found")
        current = SerialStatus(before.get("status", SerialStatus.IN_STOCK))
        if current == status:
            return before
        if status not in _TRANSITIONS[current]:
            raise CanonicalSerialError(
                f"invalid serial transition {current} -> {status}"
            )
        if location_id and not await self.db.locations.find_one(
            {"id": location_id, "active": True}
        ):
            raise CanonicalSerialError("active location does not exist")
        now = self._now()
        history = SerialHistoryEntry(
            from_status=current,
            to_status=status,
            from_location_id=before.get("location_id"),
            to_location_id=(
                location_id if location_id is not None else before.get("location_id")
            ),
            actor=actor,
            change_reference=change_reference,
            source=source,
            changed_at=now,
        ).model_dump(mode="json")
        set_fields: dict[str, Any] = {
            "status": status.value,
            "active": status != SerialStatus.RETIRED,
            "updated_at": now,
            "updated_by": actor,
            "change_reference": change_reference,
        }
        if location_id is not None:
            set_fields["location_id"] = location_id
        with write_authority(self.AUTHORITY):
            result = await self.db.canonical_serials.update_one(
                {"$and": [{"id": serial_id}, build_version_filter(expected_version)]},
                {
                    "$set": set_fields,
                    "$inc": {"version": 1},
                    "$push": {"history": history},
                },
            )
        if getattr(result, "modified_count", 0) != 1:
            raise ConcurrencyError(
                f"Serial version mismatch for {serial_id} (expected {expected_version})"
            )
        after = await self.db.canonical_serials.find_one({"id": serial_id})
        await self._audit(after, actor, change_reference, "TRANSITION", before=before)
        return after

    async def _validate_links(
        self,
        item_identity_id: str,
        physical_batch_id: Optional[str],
        location_id: Optional[str],
    ) -> None:
        if not item_identity_id or not await self.db.inventory_identities.find_one(
            {"id": item_identity_id}
        ):
            raise CanonicalSerialError("canonical item identity does not exist")
        if physical_batch_id:
            batch = await self.db.physical_batches.find_one(
                {"id": physical_batch_id, "active": True}
            )
            if not batch or batch.get("item_identity_id") != item_identity_id:
                raise CanonicalSerialError(
                    "active physical batch does not belong to the item"
                )
        if location_id and not await self.db.locations.find_one(
            {"id": location_id, "active": True}
        ):
            raise CanonicalSerialError("active location does not exist")

    @staticmethod
    def _require_governance(actor: str, change_reference: str, source: str) -> None:
        if not actor.strip() or not change_reference.strip() or not source.strip():
            raise CanonicalSerialError(
                "actor, change_reference, and source are required"
            )

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
            event_type=AuditEventType.CANONICAL_SERIAL_CHANGED,
            actor_id=actor,
            actor_username=actor,
            resource_id=document["id"],
            entity_type="canonical_serial",
            entity_id=document["id"],
            decision=decision,
            before=before,
            after=document,
            details={"change_reference": change_reference},
        )
