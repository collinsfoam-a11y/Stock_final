import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import settings
from motor.motor_asyncio import AsyncIOMotorClient


async def check_users():
    print(f"Connecting to {settings.MONGO_URL}...")
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]
    users = await db.users.find({}).to_list(100)
    print(f"Found {len(users)} users.")
    for u in users:
        print(f"- {u['username']} (Role: {u.get('role')}, Active: {u.get('is_active')})")
    client.close()


if __name__ == "__main__":
    asyncio.run(check_users())
