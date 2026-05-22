"""
Serial Reconciliation Service

After a session is finalized, compares serial numbers captured during the count
against those on record in ERP and produces a structured reconciliation report:

  MISSING   — serial in ERP but not counted (potential theft/misplacement)
  SURPLUS   — serial counted but not in ERP (unregistered stock, possible receipt)
  MOVED     — serial counted in a different location than ERP records
  DUPLICATE — same serial scanned more than once in this session
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class SerialReconciliationReport:
    session_id: str
    item_code: str
    missing: list[str] = field(default_factory=list)    # in ERP, not counted
    surplus: list[str] = field(default_factory=list)    # counted, not in ERP
    moved: list[dict[str, str]] = field(default_factory=list)   # wrong location
    duplicates: list[str] = field(default_factory=list) # scanned >1 time

    @property
    def is_clean(self) -> bool:
        return not (self.missing or self.surplus or self.moved or self.duplicates)

    def to_dict(self) -> dict[str, Any]:
        return {
            "session_id": self.session_id,
            "item_code": self.item_code,
            "is_clean": self.is_clean,
            "missing": self.missing,
            "surplus": self.surplus,
            "moved": self.moved,
            "duplicates": self.duplicates,
        }


class SerialReconciliationService:
    """Reconcile session serial numbers against ERP after finalization."""

    def __init__(self, db: Any) -> None:
        self.db = db

    async def reconcile_session(self, session_id: str) -> list[SerialReconciliationReport]:
        """Return one report per item_code that has serial numbers in the session."""
        count_lines = await self.db.count_lines.find(
            {"session_id": session_id, "is_serial_item": True}
        ).to_list(length=None)

        # Group by item_code
        grouped: dict[str, list[dict[str, Any]]] = {}
        for line in count_lines:
            code = str(line.get("item_code") or "").strip()
            if code:
                grouped.setdefault(code, []).append(line)

        reports: list[SerialReconciliationReport] = []
        for item_code, lines in grouped.items():
            report = await self._reconcile_item(session_id, item_code, lines)
            reports.append(report)

        return reports

    async def _reconcile_item(
        self,
        session_id: str,
        item_code: str,
        count_lines: list[dict[str, Any]],
    ) -> SerialReconciliationReport:
        report = SerialReconciliationReport(session_id=session_id, item_code=item_code)

        # Collect all serials counted in this session (with duplicate detection)
        counted_serials: list[str] = []
        for line in count_lines:
            for sn in (line.get("serial_numbers") or []):
                sn_str = str(sn).strip()
                if sn_str:
                    counted_serials.append(sn_str)

        # Detect duplicates
        seen: set[str] = set()
        for sn in counted_serials:
            if sn in seen:
                if sn not in report.duplicates:
                    report.duplicates.append(sn)
            seen.add(sn)

        counted_set = set(counted_serials)

        # Fetch ERP serials for this item
        erp_serials: dict[str, str] = {}  # serial → location_id
        erp_item = await self.db.items.find_one(
            {"$or": [{"item_code": item_code}, {"barcode": item_code}]},
            {"serial_numbers": 1, "location_id": 1},
        )
        if isinstance(erp_item, dict):
            loc = str(erp_item.get("location_id") or "")
            for sn in (erp_item.get("serial_numbers") or []):
                sn_str = str(sn).strip()
                if sn_str:
                    erp_serials[sn_str] = loc

        erp_set = set(erp_serials.keys())

        # Missing: in ERP but not counted
        report.missing = sorted(erp_set - counted_set)

        # Surplus: counted but not in ERP
        report.surplus = sorted(counted_set - erp_set)

        # Moved: counted in a different location than ERP records
        # Determine which location each serial was counted at
        counted_locations: dict[str, str] = {}
        for line in count_lines:
            loc_id = str(line.get("location_id") or "")
            for sn in (line.get("serial_numbers") or []):
                sn_str = str(sn).strip()
                if sn_str:
                    counted_locations[sn_str] = loc_id

        for sn in counted_set & erp_set:
            erp_loc = erp_serials.get(sn, "")
            counted_loc = counted_locations.get(sn, "")
            if erp_loc and counted_loc and erp_loc != counted_loc:
                report.moved.append({
                    "serial": sn,
                    "erp_location": erp_loc,
                    "counted_location": counted_loc,
                })

        if not report.is_clean:
            logger.warning(
                "Serial reconciliation anomalies for item %s in session %s: "
                "missing=%d surplus=%d moved=%d duplicates=%d",
                item_code,
                session_id,
                len(report.missing),
                len(report.surplus),
                len(report.moved),
                len(report.duplicates),
            )

        return report

    async def persist_report(self, report: SerialReconciliationReport) -> None:
        """Save the reconciliation report to MongoDB for audit purposes."""
        try:
            await self.db.serial_reconciliations.replace_one(
                {"session_id": report.session_id, "item_code": report.item_code},
                report.to_dict(),
                upsert=True,
            )
        except Exception as exc:
            logger.warning("Failed to persist serial reconciliation report: %s", exc)
