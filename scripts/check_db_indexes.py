import asyncio
from motor.motor_asyncio import AsyncIOMotorClient


async def check_indexes():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_verification
    for coll_name in ["sessions", "verification_sessions", "erp_items"]:
        print(f"\nIndexes for {coll_name}:")
        indexes = await db[coll_name].list_indexes().to_list(100)
        for idx in indexes:
            print(f" - {idx}")


if __name__ == "__main__":
    asyncio.run(check_indexes())
