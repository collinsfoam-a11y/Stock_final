import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

async def check_indexes():
    mongo_url = (
        os.getenv("MONGO_URL")
        or os.getenv("MONGODB_URI")
        or os.getenv("MONGODB_URL")
        or "mongodb://localhost:27017"
    )
    db_name = os.getenv("DB_NAME") or os.getenv("MONGODB_DB_NAME") or "stock_verification"
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print("Indexes for erp_items:")
    indexes = await db.erp_items.index_information()
    for name, info in indexes.items():
        print(f"  {name}: {info}")

    print("\nSync Metadata:")
    metadata = await db.sync_metadata.find_one({"_id": "sql_qty_sync"})
    print(f"  {metadata}")

    client.close()

if __name__ == "__main__":
    asyncio.run(check_indexes())
