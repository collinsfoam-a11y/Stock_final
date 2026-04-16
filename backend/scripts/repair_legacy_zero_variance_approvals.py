"""
Repair legacy zero-variance count lines that still require approval.

Targets `count_lines` documents where quantity variance is zero but the stored
review state is still pending from the older workflow. The current business
rule is that only variance items require supervisor verification, so exact-match
legacy rows should be normalized to approved.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import settings
from backend.db.runtime import get_db, lifespan_db
from backend.services.canonical_inventory import (
    count_line_requires_supervisor_review,
    normalize_approval_status,
    normalize_count_line_status,
)

logger = logging.getLogger(__name__)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _is_legacy_zero_variance_candidate(doc: dict[str, Any]) -> bool:
    if doc.get("finalized_at"):
        return False

    if count_line_requires_supervisor_review(doc):
        return False

    status = normalize_count_line_status(doc.get("status"))
    approval_status = normalize_approval_status(doc.get("approval_status"))

    if status in {"approved", "locked", "rejected"}:
        return False
    if approval_status == "REJECTED":
        return False
    if doc.get("recount_requested_at") or doc.get("assigned_to"):
        return False

    return status == "pending" or approval_status in {"PENDING", "NEEDS_REVIEW"}


def _build_repair_update(doc: dict[str, Any]) -> dict[str, Any]:
    approved_at = (
        doc.get("approved_at") or doc.get("updated_at") or doc.get("counted_at") or _utc_now_naive()
    )

    return {
        "status": "approved",
        "approval_status": "APPROVED",
        "approved_by": doc.get("approved_by") or "system",
        "approved_at": approved_at,
        "approval_by": doc.get("approval_by") or "system",
        "approval_at": doc.get("approval_at") or approved_at,
        "assigned_to": None,
        "recount_requested_at": None,
        "recount_requested_by": None,
        "rejection_reason": None,
        "updated_at": _utc_now_naive(),
        "updated_by": "system",
    }


async def repair_legacy_zero_variance_approvals(
    db: AsyncIOMotorDatabase,
    *,
    dry_run: bool = True,
    limit: Optional[int] = None,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    stats: dict[str, Any] = {
        "scanned": 0,
        "candidates": 0,
        "repairable": 0,
        "repaired": 0,
        "errors": 0,
        "examples": [],
    }

    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id

    cursor = db.count_lines.find(query).sort("counted_at", 1)

    async for doc in cursor:
        if limit is not None and stats["scanned"] >= limit:
            break

        stats["scanned"] += 1

        try:
            if not _is_legacy_zero_variance_candidate(doc):
                continue

            stats["candidates"] += 1
            update_doc = _build_repair_update(doc)
            stats["repairable"] += 1

            if len(stats["examples"]) < 10:
                stats["examples"].append(
                    {
                        "id": str(doc.get("id") or doc.get("_id") or ""),
                        "session_id": str(doc.get("session_id") or ""),
                        "item_code": str(doc.get("item_code") or ""),
                        "before_status": doc.get("status"),
                        "before_approval_status": doc.get("approval_status"),
                        "after_status": update_doc["status"],
                        "after_approval_status": update_doc["approval_status"],
                    }
                )

            if dry_run:
                logger.info(
                    "Dry-run legacy zero-variance approval repair candidate",
                    extra={
                        "id": str(doc.get("id") or doc.get("_id") or ""),
                        "session_id": doc.get("session_id"),
                        "item_code": doc.get("item_code"),
                    },
                )
                continue

            result = await db.count_lines.update_one({"_id": doc["_id"]}, {"$set": update_doc})
            if result.modified_count:
                stats["repaired"] += 1
        except Exception:
            stats["errors"] += 1
            logger.exception(
                "Failed to evaluate legacy zero-variance count line",
                extra={
                    "id": str(doc.get("id") or doc.get("_id") or ""),
                    "session_id": doc.get("session_id"),
                    "item_code": doc.get("item_code"),
                },
            )

    return stats


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME):
        db = get_db()
        if db is None:
            raise RuntimeError("Failed to get database connection")

        return await repair_legacy_zero_variance_approvals(
            db,
            dry_run=not args.execute,
            limit=args.limit,
            session_id=args.session_id,
        )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Apply repairs. Without this flag the script runs in dry-run mode.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional maximum number of count lines to inspect.",
    )
    parser.add_argument(
        "--session-id",
        dest="session_id",
        default=None,
        help="Restrict repairs to a single session id.",
    )
    return parser


def _print_summary(stats: dict[str, Any], execute: bool) -> None:
    print("\n=== Legacy Zero-Variance Approval Repair Results ===")
    print(f"Mode: {'execute' if execute else 'dry-run'}")
    print(f"Scanned: {stats['scanned']}")
    print(f"Candidates: {stats['candidates']}")
    print(f"Repairable: {stats['repairable']}")
    print(f"Repaired: {stats['repaired']}")
    print(f"Errors: {stats['errors']}")

    if stats["examples"]:
        print("Examples:")
        for example in stats["examples"]:
            print(
                f"  - session={example['session_id']} | item_code={example['item_code']} | "
                f"id={example['id']} | status {example['before_status']!r}->{example['after_status']!r} | "
                f"approval {example['before_approval_status']!r}->{example['after_approval_status']!r}"
            )


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    args = _build_parser().parse_args()
    stats = asyncio.run(_run(args))
    _print_summary(stats, args.execute)


if __name__ == "__main__":
    main()
