"""
Conflict Detection Service

Detects situations where external changes to ERP data have occurred after a
session snapshot was taken, making the counted data potentially invalid.

Three conflict types are detected:
  ERP_QTY_CHANGED  — ERP stock qty moved by >= threshold since session snapshot
  ITEM_TRANSFERRED — Item moved to a different location in ERP mid-session
  BATCH_MISMATCH   — A batch present in the snapshot no longer exists in ERP
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class ConflictReport:
    session_id: str
    conflicts: list[dict[str, Any]] = field(default_factory=list)

    @property
    def has_conflicts(self) -> bool:
        return bool(self.conflicts)


class ConflictDetectionService:
    """Detect ERP-level conflicts that invalidate in-progress session data."""

    def __init__(self, db: Any, snapshot_service: Any) -> None:
        self.db = db
        self.snapshot_service = snapshot_service

    async def detect_session_conflicts(
        self,
        session_id: str,
        *,
        erp_qty_threshold: float = 1.0,
    ) -> ConflictReport:
        """Run all conflict checks for a session and return a consolidated report."""
        report = ConflictReport(session_id=session_id)

        session_snapshot = await self.db.session_snapshots.find_one({"session_id": session_id})
        if not session_snapshot:
            logger.warning("No session snapshot found for session %s — skipping conflict check", session_id)
            return report

        snapshot_items: list[dict[str, Any]] = session_snapshot.get("items") or []

        for snap_item in snapshot_items:
            item_code = str(snap_item.get("item_code") or "").strip()
            if not item_code:
                continue

            snapshotted_qty = float(snap_item.get("stock_qty") or 0.0)
            snapshotted_location = str(snap_item.get("location_id") or "").strip()
            snapshotted_batches: set[str] = {
                str(b.get("batch_id") or "") for b in (snap_item.get("batches") or [])
                if b.get("batch_id")
            }

            # Fetch current ERP item state
            current_item = await self._fetch_erp_item(item_code)
            if not current_item:
                continue

            current_qty = float(current_item.get("stock_qty") or 0.0)
            current_location = str(current_item.get("location_id") or "").strip()
            current_batches: set[str] = {
                str(b.get("batch_id") or "") for b in (current_item.get("batches") or [])
                if b.get("batch_id")
            }

            # Check 1: ERP qty changed beyond threshold
            qty_drift = abs(current_qty - snapshotted_qty)
            if qty_drift >= erp_qty_threshold:
                report.conflicts.append({
                    "type": "ERP_QTY_CHANGED",
                    "item_code": item_code,
                    "snapshotted_qty": snapshotted_qty,
                    "current_qty": current_qty,
                    "drift": qty_drift,
                })

            # Check 2: Item transferred to another location
            if snapshotted_location and current_location and snapshotted_location != current_location:
                report.conflicts.append({
                    "type": "ITEM_TRANSFERRED",
                    "item_code": item_code,
                    "snapshotted_location": snapshotted_location,
                    "current_location": current_location,
                })

            # Check 3: Batches present at snapshot time no longer exist
            missing_batches = snapshotted_batches - current_batches
            if missing_batches:
                report.conflicts.append({
                    "type": "BATCH_MISMATCH",
                    "item_code": item_code,
                    "missing_batches": sorted(missing_batches),
                })

        return report

    async def _fetch_erp_item(self, item_code: str) -> Optional[dict[str, Any]]:
        """Look up current ERP item state from the items collection."""
        try:
            return await self.db.items.find_one(
                {"$or": [{"item_code": item_code}, {"barcode": item_code}]},
                {"stock_qty": 1, "location_id": 1, "batches": 1},
            )
        except Exception as exc:
            logger.warning("ERP item lookup failed for %s: %s", item_code, exc)
            return None
