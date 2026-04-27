import asyncio
import os
import sys
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.approval_guard import enforce_high_risk_entrypoint


async def reset_session():
    mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017/stock_verification")
    client = AsyncIOMotorClient(mongo_url)
    db = client.get_default_database()

    # Revoke all tokens for staff1
    result = await db.refresh_tokens.delete_many({"username": "staff1"})
    print(f"Deleted {result.deleted_count} stale tokens for staff1")

    client.close()


if __name__ == "__main__":
    enforce_high_risk_entrypoint(always_require=True)
    asyncio.run(reset_session())
