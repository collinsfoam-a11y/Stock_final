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
    for coll_name in ["sessions", "verification_sessions", "erp_items"]:
        print(f"\nIndexes for {coll_name}:")
        indexes = await db[coll_name].list_indexes().to_list(100)
        for idx in indexes:
            print(f" - {idx}")
    client.close()


if __name__ == "__main__":
    asyncio.run(check_indexes())
