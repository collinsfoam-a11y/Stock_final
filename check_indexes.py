import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def check():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_count
    indexes = await db.erp_items.index_information()
    print("Indexes on erp_items:")
    for name, info in indexes.items():
        print(f"{name}: {info['key']}")

if __name__ == "__main__":
    asyncio.run(check())
