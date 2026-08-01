import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def test():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_count
    
    count = await db.erp_items.count_documents({})
    print(f"Total items in DB: {count}")
    
    sample = await db.erp_items.find_one()
    print("Sample item:")
    print(sample)

if __name__ == "__main__":
    asyncio.run(test())
