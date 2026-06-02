"""Immutable inventory adjustment ledger.

Workflow:
  1. Staff scans items → count line created (the variance "proposal")
  2. Supervisor approves count line → call post_approved_adjustment()
  3. An immutable ledger entry is inserted; the count line is linked back to it.

The adjustment_ledger collection must never be updated or deleted — only insert_one
is permitted.  A SHA-256 checksum over the core financial fields lets operators
detect post-hoc tampering.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.governance_guard import write_authority

logger = logging.getLogger(__name__)

_LEDGER_VERSION = "adjustment_ledger.v1"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_float(value: Any) -> float:
    try:
        return float(value) if value not in (None, "") else 0.0
    except (TypeError, ValueError):
        return 0.0


def _checksum(entry: dict[str, Any]) -> str:
    """SHA-256 over the financially-critical fields for tamper detection."""
    payload = {
        "ledger_entry_id": entry["ledger_entry_id"],
        "count_line_id": entry["count_line_id"],
        "item_code": entry["item_code"],
        "erp_qty": entry["erp_qty"],
        "counted_qty": entry["counted_qty"],
        "variance": entry["variance"],
        "financial_impact": entry["financial_impact"],
        "posted_at": entry["posted_at"].isoformat() if isinstance(entry["posted_at"], datetime) else str(entry["posted_at"]),
        "posted_by": entry["posted_by"],
        "org_id": entry.get("org_id") or "",
    }
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True).encode()
    ).hexdigest()


class AdjustmentLedgerService:
    """Posts approved count-line variances to the immutable adjustment ledger."""

    def __init__(self, db: Any) -> None:
        self.db = db

    async def post_approved_adjustment(
        self,
        *,
        count_line: dict[str, Any],
        approved_by: str,
        org_id: Optional[str] = None,
        approval_note: Optional[str] = None,
    ) -> str:
        """Create an immutable ledger entry for an approved count-line variance.

        Returns the ledger_entry_id of the new entry.
        """
        ledger_entry_id = str(uuid.uuid4())
        posted_at = _utc_now()

        resolved_org_id = (
            org_id
            or str(count_line.get("org_id") or "")
            or str(count_line.get("warehouse") or "")
            or "default"
        )

        erp_qty = _as_float(count_line.get("erp_qty"))
        counted_qty = _as_float(count_line.get("counted_qty"))
        variance = _as_float(count_line.get("variance"))
        financial_impact = _as_float(count_line.get("financial_impact"))
        if financial_impact == 0.0:
            unit_value = _as_float(
                count_line.get("mrp_counted")
                or count_line.get("mrp_erp")
                or count_line.get("last_cost")
                or count_line.get("sale_price")
            )
            financial_impact = (counted_qty - erp_qty) * unit_value

        approval_chain = [
            {
                "actor": approved_by,
                "role": "supervisor",
                "action": "APPROVED",
                "timestamp": posted_at.isoformat(),
                "note": approval_note or "",
            }
        ]

        entry: dict[str, Any] = {
            "ledger_entry_id": ledger_entry_id,
            "ledger_version": _LEDGER_VERSION,
            "org_id": resolved_org_id,
            "session_id": str(count_line.get("session_id") or ""),
            "count_line_id": str(count_line.get("id") or str(count_line.get("_id") or "")),
            "item_code": str(count_line.get("item_code") or ""),
            "item_name": str(count_line.get("item_name") or ""),
            "barcode": count_line.get("barcode"),
            "warehouse": count_line.get("warehouse"),
            "floor_no": count_line.get("floor_no") or count_line.get("floor"),
            "rack_no": count_line.get("rack_no") or count_line.get("rack_id"),
            "erp_qty": erp_qty,
            "counted_qty": counted_qty,
            "variance": variance,
            "financial_impact": financial_impact,
            "unit_value": _as_float(
                count_line.get("mrp_counted")
                or count_line.get("mrp_erp")
                or count_line.get("last_cost")
            ),
            "posted_by": approved_by,
            "posted_at": posted_at,
            "approval_chain": approval_chain,
            "checksum": "",  # filled below after building entry
        }
        entry["checksum"] = _checksum(entry)

        try:
            with write_authority("AdjustmentLedgerService"):
                await self.db.adjustment_ledger.insert_one(entry)
        except Exception:
            logger.exception(
                "Failed to post adjustment ledger entry for count_line_id=%s",
                entry["count_line_id"],
            )
            raise

        logger.info(
            "adjustment_ledger.posted ledger_entry_id=%s count_line_id=%s "
            "item_code=%s variance=%s posted_by=%s org_id=%s",
            ledger_entry_id,
            entry["count_line_id"],
            entry["item_code"],
            variance,
            approved_by,
            resolved_org_id,
        )
        return ledger_entry_id

    async def get_ledger_entry(self, ledger_entry_id: str) -> Optional[dict[str, Any]]:
        """Fetch a single ledger entry by its id."""
        doc = await self.db.adjustment_ledger.find_one(
            {"ledger_entry_id": ledger_entry_id}
        )
        return doc

    async def verify_checksum(self, ledger_entry_id: str) -> bool:
        """Return True if the stored checksum matches a freshly computed one."""
        doc = await self.get_ledger_entry(ledger_entry_id)
        if not doc:
            return False
        stored = doc.get("checksum", "")
        expected = _checksum(doc)
        return stored == expected
