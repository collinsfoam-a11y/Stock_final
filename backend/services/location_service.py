from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.models.location import (
    LOCATION_TYPE_DEPTH,
    LocationCreate,
    LocationRecord,
    LocationType,
)
from backend.models.audit import AuditEventType
from backend.services.audit_service import AuditService


class LocationDomainError(ValueError):
    pass


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def location_slug(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or "location"


def deterministic_legacy_location_id(legacy_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"stock-verify:location:{legacy_id.strip().lower()}"))


class LocationService:
    """Authoritative writer and resolver for hierarchical physical locations."""

    def __init__(self, db: Any) -> None:
        self.db = db

    async def resolve(self, identifier: str) -> Optional[dict[str, Any]]:
        normalized = str(identifier or "").strip()
        if not normalized:
            return None
        return await self.db.locations.find_one(
            {"$or": [{"id": normalized}, {"legacy_id": normalized}, {"code": normalized}]}
        )

    async def create(
        self,
        payload: LocationCreate,
        *,
        actor: str,
        reason: str,
        change_reference: str,
    ) -> LocationRecord:
        if not actor.strip() or not reason.strip() or not change_reference.strip():
            raise LocationDomainError("actor, reason, and change_reference are required")
        parent = None
        if payload.parent_id:
            parent = await self.resolve(payload.parent_id)
            if not parent:
                raise LocationDomainError(f"Parent location not found: {payload.parent_id}")
            parent_type = LocationType(parent["location_type"])
            if LOCATION_TYPE_DEPTH[payload.location_type] <= LOCATION_TYPE_DEPTH[parent_type]:
                raise LocationDomainError(
                    f"{payload.location_type.value} must be below {parent_type.value}"
                )

        location_id = str(uuid.uuid4())
        path_ids = [*(parent.get("path_ids", []) if parent else []), location_id]
        path_names = [*(parent.get("path_names", []) if parent else []), payload.name]
        document = {
            **payload.model_dump(mode="json"),
            "id": location_id,
            "parent_id": parent["id"] if parent else None,
            "slug": location_slug(payload.name),
            "depth": len(path_ids) - 1,
            "path_ids": path_ids,
            "path_names": path_names,
            "active": True,
            "version": 1,
            "created_at": _utc_now(),
            "created_by": actor,
            "updated_at": _utc_now(),
            "updated_by": actor,
        }
        await self.db.locations.insert_one(document)
        await AuditService(self.db).log_event(
            event_type=AuditEventType.LOCATION_CREATED,
            actor_id=actor,
            actor_username=actor,
            resource_id=location_id,
            entity_type="location",
            entity_id=location_id,
            decision="CREATE",
            reason=reason.strip(),
            after={k: v for k, v in document.items() if k not in {"_id"}},
            details={"change_reference": change_reference.strip()},
            location_context={"location_id": location_id, "path_ids": path_ids},
        )
        return LocationRecord.model_validate(document)

    async def upsert_legacy(
        self,
        payload: LocationCreate,
        *,
        actor: str,
        reason: str,
        change_reference: str,
        parent_path_ids: Optional[list[str]] = None,
        parent_path_names: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        if not payload.legacy_id:
            raise LocationDomainError("legacy_id is required for migration upsert")
        if not actor.strip() or not reason.strip() or not change_reference.strip():
            raise LocationDomainError("actor, reason, and change_reference are required")
        location_id = deterministic_legacy_location_id(payload.legacy_id)
        path_ids = [*(parent_path_ids or []), location_id]
        path_names = [*(parent_path_names or []), payload.name]
        document = {
            **payload.model_dump(mode="json"),
            "id": location_id,
            "slug": location_slug(payload.name),
            "depth": len(path_ids) - 1,
            "path_ids": path_ids,
            "path_names": path_names,
            "active": True,
            "updated_at": _utc_now(),
            "updated_by": actor,
        }
        await self.db.locations.update_one(
            {"id": location_id},
            {"$set": document, "$setOnInsert": {"created_at": _utc_now(), "created_by": actor}},
            upsert=True,
        )
        await AuditService(self.db).log_event(
            event_type=AuditEventType.LOCATION_LEGACY_UPSERTED,
            actor_id=actor,
            actor_username=actor,
            resource_id=location_id,
            entity_type="location",
            entity_id=location_id,
            decision="UPSERT_LEGACY",
            reason=reason.strip(),
            after={k: v for k, v in document.items() if k not in {"_id"}},
            details={"change_reference": change_reference.strip()},
            location_context={"location_id": location_id, "path_ids": path_ids},
        )
        return document

    async def list(
        self, *, parent_id: Optional[str] = None, active_only: bool = True
    ) -> list[dict]:
        query: dict[str, Any] = {}
        if parent_id is not None:
            query["parent_id"] = parent_id
        if active_only:
            query["active"] = True
        return await self.db.locations.find(query).sort([("depth", 1), ("name", 1)]).to_list(5000)

    async def tree(self) -> list[dict[str, Any]]:
        rows = await self.list()
        nodes = {
            row["id"]: {k: v for k, v in row.items() if k != "_id"} | {"children": []}
            for row in rows
        }
        roots: list[dict[str, Any]] = []
        for row in rows:
            node = nodes[row["id"]]
            parent = nodes.get(row.get("parent_id"))
            if parent:
                parent["children"].append(node)
            else:
                roots.append(node)
        return roots

    async def rollback_migration(self, marker: str, *, actor: str, reason: str) -> int:
        """Remove only additive hierarchy nodes created by one reviewed migration."""
        if not marker.strip() or not actor.strip() or not reason.strip():
            raise LocationDomainError("marker, actor, and reason are required for rollback")
        result = await self.db.locations.delete_many({"metadata.migration_marker": marker.strip()})
        deleted = int(getattr(result, "deleted_count", 0) or 0)
        await AuditService(self.db).log_event(
            event_type=AuditEventType.LOCATION_MIGRATION_ROLLED_BACK,
            actor_id=actor,
            actor_username=actor,
            entity_type="location_migration",
            entity_id=marker.strip(),
            decision="ROLLBACK",
            reason=reason.strip(),
            details={"migration_marker": marker.strip(), "deleted_count": deleted},
        )
        return deleted
