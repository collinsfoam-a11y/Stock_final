from __future__ import annotations
"""Report-only validation of projection-backed business reads against legacy aggregates."""


import argparse
import asyncio
import json
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

from backend.config import settings
from backend.services.projection_read_service import ProjectionReadService


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-file", help="Optional path to write the JSON report")
    return parser


async def _run_validation() -> dict:
    client = AsyncIOMotorClient(settings.MONGO_URL.rstrip("/"))
    db = client[settings.DB_NAME]
    try:
        service = ProjectionReadService(db)
        return await service.build_projection_validation_report()
    finally:
        client.close()


def _write_report(report_file: str | None, report: dict) -> None:
    if not report_file:
        return
    path = Path(report_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")


def main() -> None:
    args = _build_parser().parse_args()
    report = asyncio.run(_run_validation())
    _write_report(args.report_file, report)
    print(json.dumps(report, indent=2, default=str))


if __name__ == "__main__":
    main()
