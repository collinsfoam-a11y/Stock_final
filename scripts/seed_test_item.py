import asyncio
import os
import sys
from pathlib import Path

# cSpell:ignore Sujata Dynamix Upserted upserted

from motor.motor_asyncio import AsyncIOMotorClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.approval_guard import enforce_high_risk_entrypoint  # noqa: E402

# Connect to local MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URL)
db = client.stock_verification


async def seed():
    item = {
        "item_code": "SUJ001",
        "item_name": "Sujata Dynamix Mixer Grinder",
        "barcode": "8901234567890",
        "stock_qty": 15.0,
        "mrp": 12500.0,  # Different from 14650 to test price change
        "category": "Appliances",
        "warehouse": "Main",
        "description": "750W Mixer Grinder with 3 Jars",
    }

    # Update or Insert
    result = await db.erp_items.update_one({"item_code": "SUJ001"}, {"$set": item}, upsert=True)
    print(
        f"Seeded 'Sujata Dynamix': Matched {result.matched_count}, Modified {result.modified_count}, Upserted {result.upserted_id}"
    )


if __name__ == "__main__":
    enforce_high_risk_entrypoint(always_require=True)
    asyncio.run(seed())
