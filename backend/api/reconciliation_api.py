"""
Reconciliation API - Handles session-wide aggregation of counts to calculate true variance.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import PyMongoError

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.reconciliation_service import (
    ReconciliationService,
    get_reconciliation_service,
)
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/reconciliation", tags=["Reconciliation"])


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _user_can_view_session(session: dict[str, Any], current_user: dict[str, Any]) -> bool:
    role = str(current_user.get("role") or "").strip().lower()
    if role in {"admin", "supervisor"}:
        return True

    username = str(current_user.get("username") or "").strip()
    if not username:
        return False
    session_owner = str(session.get("staff_user") or session.get("user_id") or "").strip()
    return bool(session_owner) and session_owner == username


RECONCILIATION_ERRORS = (KeyError, PyMongoError, RuntimeError, TypeError, ValueError)


@router.get("/session/{session_id}/summary")
async def get_session_reconciliation_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
    reconciliation_service: ReconciliationService = Depends(get_reconciliation_service),
):
    """
    Get aggregated reconciliation summary for a session.
    Aggregates all non-superseded count lines and reports:
    - count_variance = physical - baseline
    - erp_drift = current_sql - baseline
    - final_gap = physical - current_sql
    """
    try:
        session = await reconciliation_service.get_session(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _user_can_view_session(session, current_user):
            raise HTTPException(status_code=403, detail="Not authorized to view this session")

        summary_stats, formatted_results = await reconciliation_service.get_session_summary(
            session_id
        )

        return {
            "success": True,
            "session_id": session_id,
            "stats": summary_stats,
            "items": formatted_results,
        }

    except HTTPException:
        raise
    except RECONCILIATION_ERRORS as e:
        logger.error(
            "Error generating reconciliation for session %s: %s",
            _safe_log_value(session_id),
            _safe_log_value(e, max_length=200),
        )
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {str(e)}")
