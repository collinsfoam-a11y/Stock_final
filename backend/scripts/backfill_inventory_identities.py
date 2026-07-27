"""Dry-run-first canonical inventory identity backfill."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db
from backend.services.inventory_identity_service import (
    InventoryIdentityError,
    InventoryIdentityService,
    build_identity,
    collision_report,
    merge_identities,
)


def build_report(items: list[dict[str, Any]]) -> dict[str, Any]:
    invalid: list[dict[str, str]] = []
    identity_ids: set[str] = set()
    for item in items:
        try:
            identity_ids.add(build_identity(item).id)
        except InventoryIdentityError as exc:
            invalid.append(
                {
                    "source_id": str(item.get("id") or item.get("_id") or ""),
                    "error": str(exc),
                }
            )
    collisions = collision_report(items)
    return {
        "mode": "dry-run",
        "source_items": len(items),
        "valid_identities": len(identity_ids),
        "invalid_items": invalid,
        "alias_collision_count": len(collisions),
        "alias_collisions": collisions,
        "upserted": 0,
    }


async def backfill(
    db: Any,
    *,
    execute: bool,
    actor: str,
    reason: str,
    change_reference: str,
    quarantine_collisions: bool = False,
) -> dict[str, Any]:
    items = await db.erp_items.find({}).to_list(length=1_000_000)
    report = build_report(items)
    if not execute:
        return report
    if not all(value.strip() for value in (actor, reason, change_reference)):
        raise ValueError("Execution requires actor, reason, and change-reference")
    if report["invalid_items"] or (
        report["alias_collision_count"] and not quarantine_collisions
    ):
        raise ValueError(
            "Backfill blocked until invalid records and alias collisions are resolved"
        )

    service = InventoryIdentityService(db)
    quarantined_aliases = (
        set(report["alias_collisions"]) if quarantine_collisions else set()
    )
    identities = merge_identities(items, quarantined_aliases=quarantined_aliases)
    for identity in identities:
        await service.upsert_identity(
            identity, actor=actor, change_reference=change_reference
        )
    report["mode"] = "execute"
    report["reason"] = reason
    report["quarantined_aliases"] = sorted(quarantined_aliases)
    if quarantined_aliases:
        now_conflicts = [
            {
                "alias": alias,
                "owners": report["alias_collisions"][alias],
                "status": "QUARANTINED",
                "change_reference": change_reference,
                "created_by": actor,
                "reason": reason,
            }
            for alias in sorted(quarantined_aliases)
        ]
        for conflict in now_conflicts:
            await db.inventory_identity_conflicts.update_one(
                {"alias": conflict["alias"], "status": "QUARANTINED"},
                {"$set": conflict},
                upsert=True,
            )
    report["upserted"] = len(identities)
    return report


async def rollback(
    db: Any, *, actor: str, reason: str, change_reference: str, confirm: bool
):
    if not confirm or not all(
        value.strip() for value in (actor, reason, change_reference)
    ):
        raise ValueError(
            "Rollback requires confirmation, actor, reason, and change-reference"
        )
    result = await db.inventory_identities.delete_many(
        {"change_reference": change_reference}
    )
    conflict_result = await db.inventory_identity_conflicts.delete_many(
        {"change_reference": change_reference}
    )
    return {
        "mode": "rollback",
        "change_reference": change_reference,
        "actor": actor,
        "reason": reason,
        "deleted": int(getattr(result, "deleted_count", 0) or 0),
        "conflicts_deleted": int(getattr(conflict_result, "deleted_count", 0) or 0),
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--execute", action="store_true")
    result.add_argument("--rollback", action="store_true")
    result.add_argument("--confirm-rollback", action="store_true")
    result.add_argument("--actor", default="")
    result.add_argument("--reason", default="")
    result.add_argument("--change-reference", default="")
    result.add_argument("--input-json", type=Path)
    result.add_argument("--quarantine-collisions", action="store_true")
    return result


async def run(args: argparse.Namespace) -> dict[str, Any]:
    if args.input_json:
        if args.execute or args.rollback:
            raise ValueError("JSON snapshots support dry-run only")
        items = json.loads(args.input_json.read_text(encoding="utf-8"))
        if not isinstance(items, list):
            raise ValueError("Input snapshot must be a JSON array")
        return build_report(items)
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if args.rollback:
            return await rollback(
                db,
                actor=args.actor,
                reason=args.reason,
                change_reference=args.change_reference,
                confirm=args.confirm_rollback,
            )
        return await backfill(
            db,
            execute=args.execute,
            actor=args.actor,
            reason=args.reason,
            change_reference=args.change_reference,
            quarantine_collisions=args.quarantine_collisions,
        )


if __name__ == "__main__":
    print(json.dumps(asyncio.run(run(parser().parse_args())), indent=2))
