from __future__ import annotations
"""Report-only validation of legacy count_lines against V3.1 projections."""


import argparse
import asyncio
import json
from pathlib import Path
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

from backend.config import settings
from backend.scripts.v31_projection_validation import build_projection_validation_report


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session-id", help="Optional single session scope")
    parser.add_argument(
        "--limit", type=int, default=0, help="Optional maximum count_lines to inspect"
    )
    parser.add_argument("--report-file", help="Optional path to write the JSON report")
    return parser


async def _run_validation(*, session_id: Optional[str], limit: int) -> dict:
    client = AsyncIOMotorClient(settings.MONGO_URL.rstrip("/"))
    db = client[settings.DB_NAME]
    try:
        return await build_projection_validation_report(
            db,
            session_id=session_id,
            limit=max(int(limit or 0), 0),
        )
    finally:
        client.close()


def _write_report(report_file: Optional[str], report: dict) -> None:
    if not report_file:
        return
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def main() -> None:
    args = _build_parser().parse_args()
    result = asyncio.run(
        _run_validation(
            session_id=str(args.session_id).strip() if args.session_id else None,
            limit=max(int(args.limit or 0), 0),
        )
    )
    _write_report(args.report_file, result)
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
