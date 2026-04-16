import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from backend.config import settings
from motor.motor_asyncio import AsyncIOMotorClient


async def check_attempts():
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]
    attempts = await db.login_attempts.find({}).sort("timestamp", -1).to_list(10)
    print(f"Recent login attempts ({len(attempts)}):")
    for a in attempts:
        print(
            f"- {a['timestamp']} | User: {a.get('username')} | IP: {a.get('ip_address')} | Success: {a.get('success')} | Error: {a.get('error')}"
        )
    client.close()


if __name__ == "__main__":
    asyncio.run(check_attempts())
