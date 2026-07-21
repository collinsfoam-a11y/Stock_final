"""AI Variance Assistant (v2.2, Priority 4).

Explains a variance and recommends next steps. Recommendations only -- this
service never mutates data or auto-approves anything; supervisors stay in
the loop.

The engine is deliberately deterministic (statistical heuristics over count
history, ERP movements, and nearby SKUs) rather than an external LLM call:
results are explainable, testable, and available offline/on-LAN. The output
contract matches the sprint spec so an LLM-backed provider can be swapped in
behind the same interface later.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

RISK_HIGH_THRESHOLD = 0.5
RISK_MEDIUM_THRESHOLD = 0.2


class VarianceAssistant:
    """Analyzes a single variance and produces ranked probable causes."""

    def __init__(self, db: Any):
        self._db = db

    async def analyze(
        self,
        *,
        item_code: str,
        expected_qty: float,
        counted_qty: float,
        session_id: Optional[str] = None,
    ) -> dict[str, Any]:
        variance = counted_qty - expected_qty
        variance_pct = (variance / expected_qty) if expected_qty else None

        erp_item = await self._db.erp_items.find_one({"item_code": item_code}) or {}
        history = await self._count_history(item_code)
        nearby = await self._nearby_skus(erp_item)
        similar_barcode = await self._similar_barcodes(erp_item)

        causes: list[dict[str, Any]] = []

        if variance == 0:
            causes.append(self._cause("no_variance", 0.99, "Count matches expected quantity."))

        # Repeated variance on the same item across sessions -> master data or
        # shrinkage pattern, not a one-off miscount.
        recurring = [h for h in history if h.get("variance") not in (0, None)]
        if variance != 0 and len(recurring) >= 2:
            causes.append(
                self._cause(
                    "recurring_variance",
                    0.8,
                    f"This item had non-zero variance in {len(recurring)} recent counts; "
                    "suspect stale master stock or systematic shrinkage.",
                )
            )

        # Large round-number variance -> full case/box missed or double-counted.
        pack_size = _to_float(erp_item.get("pack_size")) or _to_float(erp_item.get("uom_qty"))
        if variance != 0 and pack_size and pack_size > 1 and abs(variance) % pack_size == 0:
            causes.append(
                self._cause(
                    "pack_quantity",
                    0.75,
                    f"Variance ({variance:+g}) is an exact multiple of the pack size "
                    f"({pack_size:g}); a full pack was likely missed or double-counted.",
                )
            )

        # Similar barcodes -> mis-scan of a lookalike SKU.
        if variance != 0 and similar_barcode:
            causes.append(
                self._cause(
                    "similar_barcode",
                    0.6,
                    "Items with near-identical barcodes exist "
                    f"({', '.join(similar_barcode[:3])}); a lookalike may have been scanned.",
                )
            )

        # Nearby rack SKUs -> misplaced stock.
        if variance != 0 and nearby:
            causes.append(
                self._cause(
                    "misplaced_stock",
                    0.5,
                    "Same-category items share this rack; stock may sit on a "
                    "neighbouring position.",
                )
            )

        # Small relative variance -> plain miscount.
        if variance != 0 and variance_pct is not None and abs(variance_pct) <= 0.1:
            causes.append(
                self._cause(
                    "miscount",
                    0.55,
                    "Variance is under 10% of expected; a counting slip is plausible.",
                )
            )

        # Counted zero while system expects stock -> location empty or item not found.
        if counted_qty == 0 and expected_qty > 0:
            causes.append(
                self._cause(
                    "item_not_found",
                    0.65,
                    "Nothing was counted while the system expects stock; check "
                    "alternative locations or recent dispatches.",
                )
            )

        if not causes:
            causes.append(
                self._cause(
                    "unexplained",
                    0.3,
                    "No matching pattern found; a recount is the safest next step.",
                )
            )

        causes.sort(key=lambda c: c["confidence"], reverse=True)
        risk_level = self._risk_level(variance, expected_qty, erp_item)
        return {
            "item_code": item_code,
            "expected_qty": expected_qty,
            "counted_qty": counted_qty,
            "variance": variance,
            "probable_causes": causes,
            "confidence": causes[0]["confidence"],
            "recommended_action": self._recommend(variance, risk_level, causes[0]["cause"]),
            "similar_items": similar_barcode + [n.get("item_code") for n in nearby[:3]],
            "risk_level": risk_level,
        }

    @staticmethod
    def _cause(cause: str, confidence: float, explanation: str) -> dict[str, Any]:
        return {"cause": cause, "confidence": confidence, "explanation": explanation}

    @staticmethod
    def _risk_level(variance: float, expected_qty: float, erp_item: dict[str, Any]) -> str:
        mrp = _to_float(erp_item.get("mrp")) or 0.0
        financial_impact = abs(variance) * mrp
        rel = abs(variance) / expected_qty if expected_qty else (1.0 if variance else 0.0)
        if rel >= RISK_HIGH_THRESHOLD or financial_impact >= 10000:
            return "high"
        if rel >= RISK_MEDIUM_THRESHOLD or financial_impact >= 1000:
            return "medium"
        return "low"

    @staticmethod
    def _recommend(variance: float, risk_level: str, top_cause: str) -> str:
        if variance == 0:
            return "Approve - no variance."
        if top_cause == "similar_barcode":
            return "Verify the physical barcode against the listed lookalike SKUs before recounting."
        if top_cause == "misplaced_stock":
            return "Check neighbouring rack positions for misplaced stock, then recount."
        if top_cause == "recurring_variance":
            return "Trigger an ERP stock re-sync for this item and escalate if variance persists."
        if risk_level == "high":
            return "Assign an independent recount before approval (high risk)."
        return "Recount recommended; approve only if the recount confirms."

    async def _count_history(self, item_code: str, limit: int = 10) -> list[dict[str, Any]]:
        try:
            cursor = (
                self._db.count_lines.find({"item_code": item_code})
                .sort("counted_at", -1)
                .limit(limit)
            )
            return await cursor.to_list(length=limit)
        except Exception as e:
            logger.warning("Variance assistant history lookup failed: %s", e)
            return []

    async def _nearby_skus(self, erp_item: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
        rack = erp_item.get("rack")
        if not rack:
            return []
        try:
            cursor = self._db.erp_items.find(
                {"rack": rack, "item_code": {"$ne": erp_item.get("item_code")}}
            ).limit(limit)
            return await cursor.to_list(length=limit)
        except Exception as e:
            logger.warning("Variance assistant nearby lookup failed: %s", e)
            return []

    async def _similar_barcodes(self, erp_item: dict[str, Any], limit: int = 5) -> list[str]:
        barcode = str(erp_item.get("barcode") or "")
        if len(barcode) < 4:
            return []
        try:
            prefix = barcode[:-1]
            cursor = self._db.erp_items.find(
                {
                    "barcode": {"$regex": f"^{prefix}"},
                    "item_code": {"$ne": erp_item.get("item_code")},
                }
            ).limit(limit)
            docs = await cursor.to_list(length=limit)
            return [str(d.get("item_code")) for d in docs if d.get("item_code")]
        except Exception as e:
            logger.warning("Variance assistant barcode lookup failed: %s", e)
            return []


def _to_float(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
