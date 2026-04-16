import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os

# Add the project root to sys.path
sys.path.append(os.getcwd())

from backend.db.indexes import create_indexes


async def run():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_verification
    print("Creating indexes...")
    results = await create_indexes(db)
    print(f"Index creation results: {results}")


if __name__ == "__main__":
    asyncio.run(run())
