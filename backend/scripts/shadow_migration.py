#!/usr/bin/env python3
"""
Shadow migration dry-run: replay count_lines -> count_observations
and compare aggregates. Produces a JSON report under reports/.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def _get_db() -> Any:
    try:
        from backend.db.runtime import get_db as _get_db_runtime
        return _get_db_runtime()
    except Exception:
        return None


async def _col(db: Any, name: str) -> Any:
    if db is None:
        return None
    return db[name]


async def _run(session_id: str | None, limit: int) -> dict[str, Any]:
    db = await _get_db()
    if db is None:
        raise RuntimeError("Database not initialized")

    count_lines_col = await _col(db, "count_lines")
    observations_col = await _col(db, "count_observations")

    if count_lines_col is None or observations_col is None:
        raise RuntimeError("Required collections not available")

    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id

    count_lines = await count_lines_col.find(query).limit(limit).to_list(length=limit)
    shadow_count = 0
    diverged: list[dict[str, Any]] = []
    for line in count_lines:
        shadow_count += 1
        existing = await observations_col.find_one({
            "session_id": line.get("session_id"),
            "item_code": line.get("item_code"),
            "counted_qty": float(line.get("counted_qty") or 0),
        }).limit(1)
        if existing is None:
            diverged.append({"line_id": str(line.get("_id") or line.get("id")), "item_code": line.get("item_code")})

    return {
        "session_id": session_id,
        "count_lines_scanned": len(count_lines),
        "shadow_observations_expected": shadow_count,
        "diverged_count": len(diverged),
        "diverged_samples": diverged[:10],
        "generated_at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Shadow migration dry-run")
    parser.add_argument("--session-id", default=None)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--output", default="reports/migration-shadow-report.json")
    args = parser.parse_args()

    report = asyncio.run(_run(args.session_id, args.limit))
    path = Path(args.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))
    logger.info("Shadow report written to %s", path)
    return 0 if report.get("diverged_count", 0) == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
