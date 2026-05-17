import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def check_kit_items():
    mongo_url = (
        os.getenv("MONGO_URL")
        or os.getenv("MONGODB_URI")
        or os.getenv("MONGODB_URL")
        or "mongodb://localhost:27017"
    )
    db_name = os.getenv("DB_NAME") or os.getenv("MONGODB_DB_NAME") or "stock_verification"
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    # Search for 'kit' in item_name, item_code, category
    query = {
        "$or": [
            {"item_name": {"$regex": "kit", "$options": "i"}},
            {"item_code": {"$regex": "kit", "$options": "i"}},
            {"category": {"$regex": "kit", "$options": "i"}},
        ]
    }
    items = await db.erp_items.find(query).limit(10).to_list(10)
    print(f"Found {len(items)} items matching 'kit':")
    for item in items:
        print(f"- {item.get('item_name')} ({item.get('item_code')})")
    client.close()


if __name__ == "__main__":
    asyncio.run(check_kit_items())
