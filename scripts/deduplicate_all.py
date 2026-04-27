import asyncio
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.approval_guard import enforce_high_risk_entrypoint  # noqa: E402

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.stock_verification


async def analyze_duplicates():
    print("Analyze and Fix All Duplicates in erp_items...")

    pipeline = [
        {"$group": {"_id": "$item_code", "count": {"$sum": 1}, "docs": {"$push": "$_id"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]

    cursor = db.erp_items.aggregate(pipeline)
    duplicates = await cursor.to_list(length=None)

    print(f"Found {len(duplicates)} item_codes with duplicates.")

    for entry in duplicates:
        item_code = entry["_id"]
        doc_ids = entry["docs"]
        print(f"Resolving duplicates for item_code: {item_code} (Count: {len(doc_ids)})")

        # Keep the first one, delete the rest
        keep_id = doc_ids[0]
        delete_ids = doc_ids[1:]

        print(f"  Keeping: {keep_id}")
        for del_id in delete_ids:
            print(f"  Deleting: {del_id}")
            await db.erp_items.delete_one({"_id": del_id})

    print("Global deduplication complete.")


if __name__ == "__main__":
    enforce_high_risk_entrypoint(always_require=True)
    asyncio.run(analyze_duplicates())
