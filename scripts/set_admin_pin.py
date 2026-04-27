import asyncio
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.approval_guard import enforce_high_risk_entrypoint  # noqa: E402

# Connect to local MongoDB
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.stock_verification


async def update_admin_pin():
    # Update admin user with PIN '8888'
    result = await db.users.update_one(
        {"username": "admin"}, {"$set": {"pin": "8888", "role": "admin"}}
    )
    print(f"Updated Admin PIN: Matched {result.matched_count}, Modified {result.modified_count}")


if __name__ == "__main__":
    enforce_high_risk_entrypoint(always_require=True)
    asyncio.run(update_admin_pin())
