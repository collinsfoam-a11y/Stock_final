import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class SnapshotIntegrityError(RuntimeError):
    """Raised when stored session snapshot data fails integrity validation."""


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

    def _generate_session_hash(self, snapshot_items: list[dict[str, Any]]) -> str:
        normalized_items = sorted(snapshot_items, key=lambda item: str(item.get("item_code") or ""))
        payload_str = json.dumps(normalized_items, sort_keys=True, default=str)
        return hashlib.sha256(payload_str.encode()).hexdigest()

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

    async def assert_session_snapshot_integrity(
        self, session: dict[str, Any] | None, *, session_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        """
        Verify that the stored session snapshot still matches its persisted hash.

        Legacy sessions without snapshot metadata are allowed through to preserve
        compatibility, but any session with snapshot governance fields must pass.
        """
        if not session and not session_id:
            raise SnapshotIntegrityError("Snapshot integrity check requires a session context")

        resolved_session_id = str(
            session_id or session.get("id") or session.get("session_id") or ""
        ).strip()
        if not resolved_session_id:
            raise SnapshotIntegrityError("Session is missing an identifier")

        session_snapshot_hash = str((session or {}).get("snapshot_hash") or "").strip()
        snapshot_ref = str((session or {}).get("snapshot_items_ref") or "").strip()
        if not session_snapshot_hash and not snapshot_ref:
            return None

        query: dict[str, Any]
        if snapshot_ref:
            query = {"$or": [{"id": snapshot_ref}, {"session_id": resolved_session_id}]}
        else:
            query = {"session_id": resolved_session_id}

        session_snapshot = await self.db.session_snapshots.find_one(query)
        if not session_snapshot:
            raise SnapshotIntegrityError("Session snapshot record is missing")

        snapshot_items = session_snapshot.get("items")
        if not isinstance(snapshot_items, list) or not snapshot_items:
            raise SnapshotIntegrityError("Session snapshot payload is missing or empty")

        stored_snapshot_hash = str(session_snapshot.get("snapshot_hash") or "").strip()
        recomputed_hash = self._generate_session_hash(snapshot_items)

        if stored_snapshot_hash and stored_snapshot_hash != recomputed_hash:
            raise SnapshotIntegrityError("Session snapshot payload hash mismatch detected")
        if session_snapshot_hash and session_snapshot_hash != recomputed_hash:
            raise SnapshotIntegrityError("Session metadata hash does not match frozen snapshot")

        return session_snapshot
