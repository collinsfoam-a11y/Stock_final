import hashlib
import logging
from datetime import datetime, timezone
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
        Fetch existing snapshot for item in session, or create a new one from live ERP data.
        """
        # 1. Check for existing snapshot
        existing = await self.db.stock_snapshots.find_one(
            {"session_id": session_id, "item_code": item_code}
        )
        if existing:
            return existing

        # 2. Fetch live ERP data to freeze it
        erp_item = await self.db.erp_items.find_one({"item_code": item_code})
        if not erp_item:
            logger.warning(f"Cannot create snapshot: Item {item_code} not found in ERP")
            return None

        # 3. Create new snapshot
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        erp_qty = float(erp_item.get("stock_qty", 0.0))

        import uuid

        snapshot = {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "item_code": item_code,
            "barcode": erp_item.get("barcode"),
            "erp_qty": erp_qty,
            "timestamp": now,
            "baseline_hash": self._generate_hash(item_code, erp_qty, now),
            "created_by": current_user,
        }

        await self.db.stock_snapshots.insert_one(snapshot)
        logger.info(
            f"Rule 2: Frozen snapshot created for {item_code} in session {session_id} (Qty: {erp_qty})"
        )

        return snapshot

    async def verify_snapshot_integrity(self, snapshot_id: str) -> bool:
        """Verify the hash of a snapshot to detect tampering."""
        snapshot = await self.db.stock_snapshots.find_one({"id": snapshot_id})
        if not snapshot:
            return False

        expected_hash = self._generate_hash(
            snapshot["item_code"], snapshot["erp_qty"], snapshot["timestamp"]
        )
        return snapshot["baseline_hash"] == expected_hash
