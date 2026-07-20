import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.test_db
    # This shouldn't throw if gathering is allowed
    await asyncio.gather(
        db.collection.count_documents({}),
        db.collection.count_documents({})
    )
    print("Gather worked with Motor DB")

asyncio.run(main())
