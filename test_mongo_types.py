import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("backend/.env")

async def main():
    client = AsyncIOMotorClient(os.getenv("MONGO_URL"))
    db = client[os.getenv("DB_NAME")]
    doc = await db.erp_items.find_one({"item_code": {"$exists": True}})
    if doc:
        print("MongoDB item_code:", repr(doc.get("item_code")), type(doc.get("item_code")))
    else:
        print("No items found")

asyncio.run(main())
