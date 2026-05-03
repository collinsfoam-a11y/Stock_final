from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.scripts.publish_projection_readiness import (
    build_readiness_document,
    publish_projection_readiness,
)
from backend.tests.utils.in_memory_db import InMemoryDatabase


def _passing_report():
    return {
        "is_consistent": True,
        "metrics": {
            "projection_drift_count": 0,
            "projection_gap_count": 0,
            "event_lag_seconds": 0.0,
        },
    }


def test_build_readiness_document_rejects_failed_parity_report():
    with pytest.raises(ValueError):
        build_readiness_document(
            {"is_consistent": False},
            source_report=Path(".agent/reports/failing.json"),
        )


def test_build_readiness_document_marks_projection_ready():
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    doc = build_readiness_document(
        _passing_report(),
        source_report=Path(".agent/reports/passing.json"),
        now=now,
    )

    assert doc["is_ready"] is True
    assert doc["ready"] is True
    assert doc["parity_passed"] is True
    assert doc["projection_drift_count"] == 0
    assert doc["projection_gap_count"] == 0
    assert doc["updated_at"] == now


@pytest.mark.asyncio
async def test_publish_projection_readiness_dry_run_does_not_write():
    db = InMemoryDatabase()

    report = await publish_projection_readiness(
        db,
        parity_report=_passing_report(),
        source_report=Path(".agent/reports/passing.json"),
        dry_run=True,
    )

    assert report["published"] is False
    assert await db["projection_readiness"].count_documents({}) == 0


@pytest.mark.asyncio
async def test_publish_projection_readiness_execute_upserts_document():
    db = InMemoryDatabase()

    report = await publish_projection_readiness(
        db,
        parity_report=_passing_report(),
        source_report=Path(".agent/reports/passing.json"),
        dry_run=False,
    )

    stored = await db["projection_readiness"].find_one({"_id": "current"})
    assert report["published"] is True
    assert stored["ready"] is True
    assert stored["is_consistent"] is True
