"""Build canonical location nodes from legacy warehouses without changing legacy references."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db
from backend.models.location import LocationCreate, LocationType
from backend.services.location_service import (
    LocationService,
    deterministic_legacy_location_id,
)

MIGRATION_MARKER = "location-hierarchy-v1"
ROOT_LEGACY_ID = "legacy-root-warehouse"


def infer_location_type(document: dict[str, Any]) -> LocationType:
    legacy_id = str(document.get("id") or document.get("legacy_id") or "").lower()
    zone = str(document.get("zone") or "").lower()
    name = str(document.get("warehouse_name") or document.get("name") or "").lower()
    if legacy_id.startswith("fl_") or "floor" in name:
        return LocationType.FLOOR
    if legacy_id.startswith("wh_") or "godown" in zone or "godown" in name:
        return LocationType.GODOWN
    if "rack" in name:
        return LocationType.RACK
    return LocationType.OTHER_AREA


def build_candidates(warehouses: list[dict[str, Any]]) -> list[LocationCreate]:
    candidates: list[LocationCreate] = []
    for document in warehouses:
        legacy_id = str(document.get("id") or document.get("legacy_id") or "").strip()
        name = str(document.get("warehouse_name") or document.get("name") or "").strip()
        if not legacy_id or not name:
            continue
        candidates.append(
            LocationCreate(
                name=name,
                location_type=infer_location_type(document),
                parent_id=deterministic_legacy_location_id(ROOT_LEGACY_ID),
                code=legacy_id,
                legacy_id=legacy_id,
                metadata={
                    "migration_marker": MIGRATION_MARKER,
                    "legacy_zone": str(document.get("zone") or ""),
                },
            )
        )
    return candidates


def build_dry_run_report(warehouses: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = build_candidates(warehouses)
    return {
        "mode": "dry-run",
        "migration_marker": MIGRATION_MARKER,
        "source_warehouses": len(warehouses),
        "valid_candidates": len(candidates),
        "upserted": 0,
        "candidate_legacy_ids": [candidate.legacy_id for candidate in candidates],
    }


async def migrate(
    db: Any,
    *,
    execute: bool,
    actor: str,
    reason: str,
    change_reference: str,
) -> dict[str, Any]:
    warehouses = await db.warehouses.find({}).to_list(length=10000)
    candidates = build_candidates(warehouses)
    report = build_dry_run_report(warehouses)
    if not execute:
        return report
    report["mode"] = "execute"
    if not all(value.strip() for value in (actor, reason, change_reference)):
        raise ValueError("Execution requires actor, reason, and change-reference")

    service = LocationService(db)
    root = LocationCreate(
        name="Legacy Stock Verify",
        location_type=LocationType.WAREHOUSE,
        code="LEGACY-ROOT",
        legacy_id=ROOT_LEGACY_ID,
        metadata={
            "migration_marker": MIGRATION_MARKER,
            "reason": reason,
            "change_reference": change_reference,
        },
    )
    root_doc = await service.upsert_legacy(
        root, actor=actor, reason=reason, change_reference=change_reference
    )
    report["upserted"] += 1
    for candidate in candidates:
        await service.upsert_legacy(
            candidate,
            actor=actor,
            reason=reason,
            change_reference=change_reference,
            parent_path_ids=root_doc["path_ids"],
            parent_path_names=root_doc["path_names"],
        )
        report["upserted"] += 1
    return report


async def rollback(db: Any, *, actor: str, reason: str, confirm: bool) -> dict[str, Any]:
    if not confirm:
        raise ValueError("Rollback requires --confirm-rollback")
    deleted = await LocationService(db).rollback_migration(
        MIGRATION_MARKER, actor=actor, reason=reason
    )
    return {"mode": "rollback", "migration_marker": MIGRATION_MARKER, "deleted": deleted}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--confirm-rollback", action="store_true")
    parser.add_argument("--actor", default="")
    parser.add_argument("--reason", default="")
    parser.add_argument("--change-reference", default="")
    parser.add_argument(
        "--input-json",
        type=Path,
        help="Rehearse dry-run from an exported warehouse JSON array without a database connection.",
    )
    return parser


async def run(args: argparse.Namespace) -> dict[str, Any]:
    if args.input_json:
        if args.execute or args.rollback:
            raise ValueError("--input-json supports dry-run rehearsal only")
        warehouses = json.loads(args.input_json.read_text(encoding="utf-8"))
        if not isinstance(warehouses, list):
            raise ValueError("Input snapshot must be a JSON array")
        return build_dry_run_report(warehouses)
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if args.rollback:
            return await rollback(
                db, actor=args.actor, reason=args.reason, confirm=args.confirm_rollback
            )
        return await migrate(
            db,
            execute=args.execute,
            actor=args.actor,
            reason=args.reason,
            change_reference=args.change_reference,
        )


def main() -> None:
    args = build_parser().parse_args()
    print(json.dumps(asyncio.run(run(args)), indent=2))


if __name__ == "__main__":
    main()
