"""
Approval Policy Service

Reads configurable approval policies from MongoDB `approval_policies` collection.
Falls back to hard-coded enterprise defaults when no policy document exists.

Policy document shape (stored in MongoDB):
{
  "warehouse_id": "default",          # or a specific warehouse
  "auto_approve_pct":   5.0,          # variance % below which lines auto-approve
  "supervisor_pct":    15.0,          # variance % that requires supervisor review
  "manager_pct":       50.0,          # variance % that requires manager review
  "block_pct":         50.0,          # variance % that triggers hard block + alert
  "high_value_mrp":  5000.0,          # MRP above which stricter rules apply
  "high_value_supervisor_pct": 5.0,   # supervisor threshold for high-value items
}
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Enterprise defaults — applied when no policy document is found
_DEFAULT_POLICY: dict[str, float] = {
    "auto_approve_pct": 5.0,
    "supervisor_pct": 15.0,
    "manager_pct": 50.0,
    "block_pct": 50.0,
    "high_value_mrp": 5000.0,
    "high_value_supervisor_pct": 5.0,
}


@dataclass(frozen=True)
class ApprovalDecision:
    action: str  # "AUTO_APPROVE" | "SUPERVISOR_REVIEW" | "MANAGER_REVIEW" | "BLOCK"
    reason: str
    variance_pct: float
    requires_alert: bool = False


class ApprovalPolicyService:
    """Determine the required approval action for a counted variance."""

    def __init__(self, db: Any) -> None:
        self.db = db
        self._cache: dict[str, dict[str, float]] = {}

    async def _load_policy(self, warehouse_id: str = "default") -> dict[str, float]:
        """Load policy from MongoDB; fall back to defaults on miss."""
        cached = self._cache.get(warehouse_id)
        if cached is not None:
            return cached

        try:
            doc = await self.db.approval_policies.find_one(
                {"warehouse_id": {"$in": [warehouse_id, "default"]}},
                sort=[("warehouse_id", -1)],  # prefer specific warehouse over "default"
            )
        except Exception as exc:
            logger.warning("approval_policies lookup failed: %s — using defaults", exc)
            doc = None

        policy = dict(_DEFAULT_POLICY)
        if isinstance(doc, dict):
            for key in _DEFAULT_POLICY:
                if isinstance(doc.get(key), (int, float)):
                    policy[key] = float(doc[key])

        # Invalidate on next call by not caching (or cache briefly if needed)
        self._cache[warehouse_id] = policy
        return policy

    def invalidate_cache(self, warehouse_id: Optional[str] = None) -> None:
        if warehouse_id:
            self._cache.pop(warehouse_id, None)
        else:
            self._cache.clear()

    async def evaluate(
        self,
        *,
        erp_qty: float,
        counted_qty: float,
        erp_mrp: float = 0.0,
        warehouse_id: str = "default",
    ) -> ApprovalDecision:
        """Return the required approval action for a counted variance."""
        policy = await self._load_policy(warehouse_id)

        variance = counted_qty - erp_qty
        if erp_qty > 0:
            variance_pct = abs(variance) / erp_qty * 100
        elif counted_qty == 0:
            variance_pct = 0.0
        else:
            variance_pct = 100.0

        auto_approve_pct = policy["auto_approve_pct"]
        supervisor_pct = policy["supervisor_pct"]
        manager_pct = policy["manager_pct"]
        block_pct = policy["block_pct"]
        high_value_mrp = policy["high_value_mrp"]
        high_value_sup_pct = policy["high_value_supervisor_pct"]

        # High-value items get a stricter supervisor threshold
        effective_supervisor_pct = (
            high_value_sup_pct if erp_mrp >= high_value_mrp else supervisor_pct
        )

        if variance_pct >= block_pct:
            return ApprovalDecision(
                action="BLOCK",
                reason=f"Variance {variance_pct:.1f}% exceeds block threshold {block_pct:.0f}%",
                variance_pct=variance_pct,
                requires_alert=True,
            )

        if variance_pct >= manager_pct:
            return ApprovalDecision(
                action="MANAGER_REVIEW",
                reason=f"Variance {variance_pct:.1f}% requires manager approval (>{manager_pct:.0f}%)",
                variance_pct=variance_pct,
                requires_alert=False,
            )

        if variance_pct >= effective_supervisor_pct:
            return ApprovalDecision(
                action="SUPERVISOR_REVIEW",
                reason=f"Variance {variance_pct:.1f}% requires supervisor approval (>{effective_supervisor_pct:.0f}%)",
                variance_pct=variance_pct,
                requires_alert=False,
            )

        return ApprovalDecision(
            action="AUTO_APPROVE",
            reason=f"Variance {variance_pct:.1f}% within auto-approve threshold (<{auto_approve_pct:.0f}%)",
            variance_pct=variance_pct,
            requires_alert=False,
        )
