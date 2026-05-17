import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017"
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGODB_DB_NAME") or "stock_verification"
COLLECTION = "erp_items"


async def create_indexes():
    client = AsyncIOMotorClient(MONGO_URI)
    try:
        db = client[DB_NAME]
        coll = db[COLLECTION]
        # Single field indexes
        await coll.create_index([("category", 1)], background=True)
        await coll.create_index([("subcategory", 1)], background=True)
        await coll.create_index([("floor", 1)], background=True)
        await coll.create_index([("rack", 1)], background=True)
        await coll.create_index([("warehouse", 1)], background=True)
        await coll.create_index([("uom_code", 1)], background=True)
        await coll.create_index([("verified", 1)], background=True)
        # Text index for item_name and compound for item_code, barcode
        await coll.create_index(
            [("item_name", "text"), ("item_code", 1), ("barcode", 1)], background=True
        )
        print("Indexes created successfully")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(create_indexes())
