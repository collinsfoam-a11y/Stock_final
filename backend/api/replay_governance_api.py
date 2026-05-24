from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query

from backend.auth.dependencies import require_admin
from backend.db.runtime import get_db
from backend.services.replay_certification_service import ReplayCertificationService


router = APIRouter(
    prefix="/api/replay-governance",
    tags=["Replay Governance"],
)


def _service() -> ReplayCertificationService:
    return ReplayCertificationService(get_db())


@router.get("/dashboard")
async def get_replay_governance_dashboard(
    _current_user: dict[str, Any] = Depends(require_admin),
):
    return await _service().dashboard_summary()


@router.get("/reports")
async def list_replay_certification_reports(
    limit: int = Query(default=20, ge=1, le=100),
    _current_user: dict[str, Any] = Depends(require_admin),
):
    return {
        "reports": await _service().latest_reports(limit=limit),
        "limit": limit,
    }


@router.post("/certify")
async def create_replay_certification_report(
    session_id: Optional[str] = Query(default=None),
    certification_id: Optional[str] = Query(default=None),
    _current_user: dict[str, Any] = Depends(require_admin),
):
    return await _service().certify(
        session_id=session_id,
        certification_id=certification_id,
    )


@router.get("/recovery-plan")
async def get_replay_recovery_plan(
    _current_user: dict[str, Any] = Depends(require_admin),
):
    return await _service().recovery_plan()


@router.post("/recovery/cleanup-stale-ownership")
async def cleanup_stale_replay_ownership(
    dry_run: bool = Query(default=True),
    _current_user: dict[str, Any] = Depends(require_admin),
):
    return await _service().cleanup_stale_ownership(dry_run=dry_run)
