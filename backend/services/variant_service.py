"""
Variant Service - Handles relationships between item variants (Rule 5)
"""

import logging
from typing import Any, Dict, List, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class VariantService:
    """
    Service to manage item variants and coordinate locks/status across them.
    Fulfills Rule 5: Variant Propagation Engine.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_item_family(self, item_id: Any) -> List[Dict[str, Any]]:
        """
        Get all items belonging to the same ProductID (family).
        """
        if not item_id:
            return []

        cursor = self.db.erp_items.find({"item_id": item_id})
        return await cursor.to_list(None)

    async def get_sibling_barcodes(self, barcode: str) -> List[str]:
        """
        Given a barcode, find all other barcodes in the same variant family.
        """
        # Find the item first
        item = await self.db.erp_items.find_one({"barcode": barcode})
        if not item or not item.get("item_id"):
            return []

        item_id = item["item_id"]
        siblings = await self.db.erp_items.find(
            {"item_id": item_id, "barcode": {"$ne": barcode}}
        ).to_list(None)

        return [s["barcode"] for s in siblings if s.get("barcode")]

    async def propagate_lock(self, barcode: str, lock_service: Any, owner: str) -> bool:
        """
        Propagate a lock to all variants of the item.
        Actually just locks the item_id to be efficient.
        """
        item = await self.db.erp_items.find_one({"barcode": barcode})
        if not item or not item.get("item_id"):
            # Fallback to barcode lock if no family found
            await lock_service.acquire_lock(f"item:{barcode}", owner)
            return True

        item_id = item["item_id"]
        # Lock the entire product family
        await lock_service.acquire_lock(f"product:{item_id}", owner)
        return True

    async def check_variant_busy(self, barcode: str, lock_service: Any) -> Optional[str]:
        """
        Check if any variant in the family is currently being counted.
        Returns the owner of the lock if busy.
        """
        item = await self.db.erp_items.find_one({"barcode": barcode})
        if not item:
            return None

        item_id = item.get("item_id")
        if item_id:
            lock = await self.db.locks.find_one({"_id": f"product:{item_id}"})
            if lock:
                return lock["owner"]

        # Also check individual barcode lock for legacy/solo items
        lock = await self.db.locks.find_one({"_id": f"item:{barcode}"})
        return lock["owner"] if lock else None
