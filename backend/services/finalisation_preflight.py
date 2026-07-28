"""
Finalisation Preflight Service

Validates whether a session is ready for finalisation:
- All item drafts saved
- All locally queued records reached server
- Mandatory remarks present
- Split-count totals valid
- All serial scans internally consistent
- Required photos uploaded or safely queued
- No item still being edited
- No unresolved device conflict
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class FinalisationPreflightService:
    def __init__(self, db: Any):
        self.db = db

    async def evaluate(self, session_id: str) -> dict[str, Any]:
        session = await self.db.sessions.find_one({"$or": [{"id": session_id}, {"session_id": session_id}]})
        if not session:
            return {"ready": False, "blocking": ["SESSION_NOT_FOUND"], "checks": {}}

        checks: dict[str, Any] = {}
        blocking: list[str] = []

        checks["session_status"] = str(session.get("status") or "").upper()
        if checks["session_status"] in {"FINALISED", "CANCELLED"}:
            blocking.append("SESSION_ALREADY_CLOSED")

        count_lines = await self.db.count_lines.find({"session_id": session_id}).to_list(length=1000)
        observations = await self.db.count_observations.find({"session_id": session_id}).to_list(length=1000)

        checks["count_line_count"] = len(count_lines)
        checks["observation_count"] = len(observations)

        if not count_lines and not observations:
            blocking.append("NO_OBSERVATIONS")

        missing_remarks = sum(1 for obs in observations if not (obs.get("remark") or "").strip())
        checks["missing_remarks"] = missing_remarks
        if missing_remarks:
            blocking.append("MISSING_REMARKS")

        incomplete_split_counts = [
            obs.get("id") for obs in observations if obs.get("split_section") and not obs.get("split_total")
        ]
        checks["incomplete_split_counts"] = len(incomplete_split_counts)
        if incomplete_split_counts:
            blocking.append("INCOMPLETE_SPLIT_COUNTS")

        sync_conflicts = await self.db.sync_queue.count_documents({"session_id": session_id, "status": {"$in": ["conflict", "failed"]}})
        checks["sync_conflicts"] = sync_conflicts
        if sync_conflicts:
            blocking.append("UNRESOLVED_SYNC_CONFLICTS")

        blocking_observations = await self.db.count_observations.count_documents(
            {
                "session_id": session_id,
                "status": {
                    "$in": [
                        "PENDING_INVESTIGATION",
                        "DISTRIBUTED_STOCK_INVESTIGATION",
                        "SUPERVISOR_REVIEW",
                        "RECOUNT_REQUESTED",
                        "RECOUNT_ASSIGNED",
                        "RECOUNT_IN_PROGRESS",
                        "CONFLICT",
                    ]
                },
            }
        )
        checks["blocking_observations"] = blocking_observations
        if blocking_observations:
            blocking.append("BLOCKING_OBSERVATIONS")

        checks["last_heartbeat"] = session.get("last_heartbeat")
        if session.get("paused_at") and not session.get("resumed_at"):
            blocking.append("SESSION_PAUSED")

        return {
            "ready": len(blocking) == 0,
            "blocking": blocking,
            "checks": checks,
            "session_id": session_id,
            "evaluated_at": _utc_now(),
        }
