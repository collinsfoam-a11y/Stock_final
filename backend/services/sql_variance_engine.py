"""
SQL Variance Engine

Computes audit and operational deltas:
- audit delta = total_physical - frozen_baseline
- operational delta = total_physical - movement_adjusted_expected
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class SqlVarianceEngine:
    def __init__(self, db: Any):
        self.db = db

    async def compute_session_variance(self, session_id: str) -> dict[str, Any]:
        observations = (
            await self.db["count_observations"]
            .find({"session_id": session_id})
            .to_list(length=1000)
        )

        total_physical = sum(float(o.get("counted_qty") or 0) for o in observations)
        total_sql_at_submission = sum(
            float(o.get("sql_qty_at_submission") or 0) for o in observations
        )
        audit_delta = round(total_physical - total_sql_at_submission, 4)

        movement_adjusted = await self._get_movement_adjusted_expected(session_id)
        operational_delta = round(total_physical - movement_adjusted, 4)

        variance_by_item = []
        for obs in observations:
            sql_qty = float(obs.get("sql_qty_at_submission") or 0)
            physical_qty = float(obs.get("counted_qty") or 0)
            item_variance = round(physical_qty - sql_qty, 4)
            variance_by_item.append(
                {
                    "item_code": obs.get("item_code"),
                    "sql_qty_at_submission": sql_qty,
                    "physical_qty": physical_qty,
                    "audit_delta": item_variance,
                    "operational_delta": item_variance,
                    "status": obs.get("status"),
                    "approval_status": obs.get("approval_status"),
                }
            )

        return {
            "session_id": session_id,
            "total_physical": total_physical,
            "total_sql_at_submission": total_sql_at_submission,
            "audit_delta": audit_delta,
            "movement_adjusted_expected": movement_adjusted,
            "operational_delta": operational_delta,
            "variance_by_item": variance_by_item,
            "computed_at": _utc_now().isoformat(),
        }

    async def _get_movement_adjusted_expected(self, session_id: str) -> float:
        movements = await self.db.erp_snapshot.find({"session_id": session_id}).to_list(length=1000)
        return sum(float(m.get("stock_qty") or 0) for m in movements)
