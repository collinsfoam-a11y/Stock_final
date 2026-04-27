import hashlib
import logging
from datetime import datetime
from typing import Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class SnapshotService:
    """
    Service to manage Stock Snapshots (Rule 2 Mandatory)
    Ensures variance reconciliation uses a frozen hashed baseline.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    def _generate_hash(self, item_code: str, qty: float, timestamp: datetime) -> str:
        """Generate SHA256 hash for snapshot integrity."""
        data = f"{item_code}:{qty}:{timestamp.isoformat()}"
        return hashlib.sha256(data.encode()).hexdigest()

    async def get_or_create_snapshot(
        self, session_id: str, item_code: str, current_user: str
    ) -> Optional[dict[str, Any]]:
        """
        Legacy API compatibility helper.
        Returns existing immutable baseline data only; never creates or mutates snapshots.
        """
        # 1. Legacy per-item snapshot lookup (read-only).
        existing = await self.db.stock_snapshots.find_one(
            {"session_id": session_id, "item_code": item_code}
        )
        if existing:
            return existing

        # 2. Session baseline snapshot lookup (read-only).
        session_snapshot = await self.db.session_snapshots.find_one({"session_id": session_id})
        if isinstance(session_snapshot, dict):
            snapshot_hash = str(session_snapshot.get("snapshot_hash") or "").strip()
            for item in session_snapshot.get("items") or []:
                if str(item.get("item_code") or "").strip() != str(item_code or "").strip():
                    continue
                return {
                    "session_id": session_id,
                    "item_code": item_code,
                    "erp_qty": float(item.get("stock_qty") or 0.0),
                    "baseline_hash": snapshot_hash or "SESSION_SNAPSHOT",
                    "created_by": current_user,
                }

        logger.warning(
            "Immutable baseline missing for item %s in session %s; no snapshot created",
            item_code,
            session_id,
        )
        return None

    async def verify_snapshot_integrity(self, snapshot_id: str) -> bool:
        """Verify the hash of a snapshot to detect tampering."""
        snapshot = await self.db.stock_snapshots.find_one({"id": snapshot_id})
        if not snapshot:
            return False

        expected_hash = self._generate_hash(
            snapshot["item_code"], snapshot["erp_qty"], snapshot["timestamp"]
        )
        return snapshot["baseline_hash"] == expected_hash
