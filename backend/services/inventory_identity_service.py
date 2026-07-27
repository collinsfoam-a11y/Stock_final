from __future__ import annotations

import re
import unicodedata
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from backend.models.inventory_identity import (
    InventoryIdentity,
    ItemAlias,
    ItemAliasType,
)
from backend.models.audit import AuditEventType
from backend.services.audit_service import AuditService


ALIAS_FIELDS: tuple[tuple[str, ItemAliasType], ...] = (
    ("item_code", ItemAliasType.ITEM_CODE),
    ("barcode", ItemAliasType.BARCODE),
    ("autobarcode", ItemAliasType.BARCODE),
    ("auto_barcode", ItemAliasType.BARCODE),
    ("manual_barcode", ItemAliasType.MANUAL_BARCODE),
    ("unit2_barcode", ItemAliasType.UNIT2_BARCODE),
    ("unit_m_barcode", ItemAliasType.UNIT_M_BARCODE),
)


class InventoryIdentityError(ValueError):
    pass


def normalize_item_identifier(value: Any) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().upper()
    return re.sub(r"\s+", "", text)


def canonical_inventory_id(normalized_code: str) -> str:
    if not normalized_code:
        raise InventoryIdentityError("normalized item code is required")
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"stock-verify:item:{normalized_code}"))


def _source_id(document: dict[str, Any]) -> str:
    return str(document.get("id") or document.get("_id") or "")


def aliases_for(document: dict[str, Any]) -> list[ItemAlias]:
    seen: set[tuple[str, str]] = set()
    aliases: list[ItemAlias] = []
    for field, alias_type in ALIAS_FIELDS:
        raw = str(document.get(field) or "").strip()
        normalized = normalize_item_identifier(raw)
        key = (alias_type.value, normalized)
        if not normalized or key in seen:
            continue
        seen.add(key)
        aliases.append(
            ItemAlias(alias_type=alias_type, value=raw, normalized_value=normalized)
        )
    return sorted(
        aliases, key=lambda item: (item.alias_type.value, item.normalized_value)
    )


def build_identity(document: dict[str, Any]) -> InventoryIdentity:
    canonical_code = str(document.get("item_code") or "").strip()
    normalized_code = normalize_item_identifier(canonical_code)
    if not normalized_code:
        raise InventoryIdentityError("item_code is required for canonical identity")
    source_id = _source_id(document)
    return InventoryIdentity(
        id=canonical_inventory_id(normalized_code),
        canonical_code=canonical_code,
        normalized_code=normalized_code,
        display_name=str(
            document.get("item_name") or document.get("name") or ""
        ).strip(),
        aliases=aliases_for(document),
        source_record_ids=[source_id] if source_id else [],
    )


def merge_identities(
    documents: Iterable[dict[str, Any]],
    *,
    quarantined_aliases: Optional[set[str]] = None,
) -> list[InventoryIdentity]:
    quarantined = quarantined_aliases or set()
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for document in documents:
        normalized_code = normalize_item_identifier(document.get("item_code"))
        if normalized_code:
            grouped[normalized_code].append(document)

    merged: list[InventoryIdentity] = []
    for normalized_code, rows in sorted(grouped.items()):
        identity_quarantined = False
        aliases: dict[tuple[str, str], ItemAlias] = {}
        source_ids: set[str] = set()
        names: set[str] = set()
        codes: set[str] = set()
        for row in rows:
            source_id = _source_id(row)
            if source_id:
                source_ids.add(source_id)
            name = str(row.get("item_name") or row.get("name") or "").strip()
            if name:
                names.add(name)
            code = str(row.get("item_code") or "").strip()
            if code:
                codes.add(code)
            for alias in aliases_for(row):
                if alias.normalized_value in quarantined:
                    identity_quarantined = True
                    continue
                aliases[(alias.alias_type.value, alias.normalized_value)] = alias
        merged.append(
            InventoryIdentity(
                id=canonical_inventory_id(normalized_code),
                canonical_code=sorted(codes, key=lambda value: (value.upper(), value))[
                    0
                ],
                normalized_code=normalized_code,
                display_name=(
                    sorted(names, key=lambda value: (value.upper(), value))[0]
                    if names
                    else ""
                ),
                aliases=[aliases[key] for key in sorted(aliases)],
                source_record_ids=sorted(source_ids),
                collision_state="ALIAS_QUARANTINED" if identity_quarantined else None,
            )
        )
    return merged


def collision_report(
    documents: Iterable[dict[str, Any]],
) -> dict[str, list[dict[str, str]]]:
    owners: dict[str, list[dict[str, str]]] = defaultdict(list)
    for document in documents:
        normalized_code = normalize_item_identifier(document.get("item_code"))
        if not normalized_code:
            continue
        for alias in aliases_for(document):
            owners[alias.normalized_value].append(
                {"normalized_code": normalized_code, "source_id": _source_id(document)}
            )
    collisions: dict[str, list[dict[str, str]]] = {}
    for alias, candidates in owners.items():
        distinct = {
            (candidate["normalized_code"], candidate["source_id"])
            for candidate in candidates
        }
        codes = {candidate[0] for candidate in distinct}
        if len(codes) > 1:
            collisions[alias] = [
                {"normalized_code": code, "source_id": source_id}
                for code, source_id in sorted(distinct)
            ]
    return dict(sorted(collisions.items()))


class InventoryIdentityService:
    def __init__(self, db: Any) -> None:
        self.db = db

    async def resolve(self, identifier: str) -> Optional[dict[str, Any]]:
        normalized = normalize_item_identifier(identifier)
        if not normalized:
            return None
        return await self.db.inventory_identities.find_one(
            {
                "$or": [
                    {"normalized_code": normalized},
                    {"aliases.normalized_value": normalized},
                ]
            }
        )

    async def upsert_identity(
        self, identity: InventoryIdentity, *, actor: str, change_reference: str
    ) -> dict[str, Any]:
        if not actor.strip() or not change_reference.strip():
            raise InventoryIdentityError("actor and change_reference are required")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        document = identity.model_dump(mode="json") | {
            "updated_at": now,
            "updated_by": actor,
            "change_reference": change_reference,
        }
        await self.db.inventory_identities.update_one(
            {"id": identity.id},
            {
                "$set": document,
                "$setOnInsert": {"created_at": now, "created_by": actor},
            },
            upsert=True,
        )
        await AuditService(self.db).log_event(
            event_type=AuditEventType.INVENTORY_IDENTITY_UPSERTED,
            actor_id=actor,
            actor_username=actor,
            resource_id=identity.id,
            entity_type="inventory_identity",
            entity_id=identity.id,
            decision="UPSERT",
            after=document,
            details={"change_reference": change_reference},
        )
        return document

    async def upsert(
        self, source: dict[str, Any], *, actor: str, change_reference: str
    ) -> dict[str, Any]:
        return await self.upsert_identity(
            build_identity(source), actor=actor, change_reference=change_reference
        )
