import asyncio
from motor.motor_asyncio import AsyncIOMotorClient


async def check_kit_items():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_verification
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


if __name__ == "__main__":
    asyncio.run(check_kit_items())
