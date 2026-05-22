"""
Variance Classification Service

Categorises a count-line variance by its most probable root cause,
enabling targeted corrective action and meaningful reporting.

Classification hierarchy (first match wins):
  EXPIRED             — item past expiry date
  THEFT               — large unexplained shortfall on high-value serialised item
  DAMAGE              — damage qty explains the shortfall
  MISPLACEMENT        — item found at wrong location (is_misplaced=True)
  BATCH_DISCREPANCY   — batch ids differ between count and ERP
  SYSTEM_ERROR        — variance exists but ERP qty was recently imported/corrected
  DATA_ENTRY          — no serials captured, large variance, no photo proof
  GENUINE_VARIANCE    — residual; no specific root cause identified
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VarianceClassification:
    root_cause: str
    confidence: str   # HIGH | MEDIUM | LOW
    notes: str


class VarianceClassificationService:
    """Classify count-line variance by root cause."""

    def classify(
        self,
        *,
        count_line: dict[str, Any],
        erp_item: Optional[dict[str, Any]] = None,
    ) -> VarianceClassification:
        variance = float(count_line.get("variance") or 0.0)
        if variance == 0:
            return VarianceClassification(
                root_cause="NO_VARIANCE",
                confidence="HIGH",
                notes="Counted qty matches ERP exactly.",
            )

        erp_mrp = float((erp_item or {}).get("mrp") or count_line.get("erp_mrp") or 0.0)
        damage_qty = float(count_line.get("damaged_qty") or 0.0) + float(
            count_line.get("non_returnable_damaged_qty") or 0.0
        )
        is_misplaced = bool(count_line.get("is_misplaced"))
        has_serials = bool(count_line.get("serial_numbers") or count_line.get("serial_entries"))
        has_photo = bool(count_line.get("photo_base64") or count_line.get("photo_proofs"))
        counted_batches = {str(b.get("batch_id") or "") for b in (count_line.get("batches") or []) if b.get("batch_id")}
        erp_batches = {str(b.get("batch_id") or "") for b in ((erp_item or {}).get("batches") or []) if b.get("batch_id")}

        # Check expiry
        expiry_str = count_line.get("expiry_date") or (erp_item or {}).get("expiry_date")
        if expiry_str and self._is_expired(expiry_str):
            return VarianceClassification(
                root_cause="EXPIRED",
                confidence="HIGH",
                notes=f"Item expiry date {expiry_str} is in the past.",
            )

        # Damage explains the shortfall
        if damage_qty > 0 and abs(abs(variance) - damage_qty) < 0.01:
            return VarianceClassification(
                root_cause="DAMAGE",
                confidence="HIGH",
                notes=f"Damage qty {damage_qty} fully explains the variance.",
            )

        # Misplacement
        if is_misplaced:
            return VarianceClassification(
                root_cause="MISPLACEMENT",
                confidence="HIGH",
                notes="Item flagged as found at wrong location.",
            )

        # Batch discrepancy
        if counted_batches and erp_batches and counted_batches != erp_batches:
            return VarianceClassification(
                root_cause="BATCH_DISCREPANCY",
                confidence="MEDIUM",
                notes=f"Batch mismatch — counted: {sorted(counted_batches)}, ERP: {sorted(erp_batches)}.",
            )

        # Theft signal: high-value, serialised, large negative variance, no explanation
        if (
            variance < 0
            and erp_mrp >= 5000
            and has_serials
            and not count_line.get("correction_reason")
            and not count_line.get("variance_reason")
        ):
            return VarianceClassification(
                root_cause="THEFT",
                confidence="MEDIUM",
                notes="Large shortfall on high-value serialised item with no stated reason.",
            )

        # Data entry likely: no photo, no serials, large variance
        if abs(variance) > 10 and not has_serials and not has_photo:
            return VarianceClassification(
                root_cause="DATA_ENTRY",
                confidence="LOW",
                notes="Large variance with no photo or serial evidence — possible data entry error.",
            )

        return VarianceClassification(
            root_cause="GENUINE_VARIANCE",
            confidence="LOW",
            notes="No specific root cause identified; manual review recommended.",
        )

    @staticmethod
    def _is_expired(expiry_str: str) -> bool:
        today = date.today()
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%Y", "%Y"):
            try:
                parsed = datetime.strptime(expiry_str.strip(), fmt).date()
                return parsed < today
            except ValueError:
                continue
        return False
