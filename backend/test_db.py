import asyncio

from motor.motor_asyncio import AsyncIOMotorClient


async def main():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["stock_verification"]
    users = await db.users.find({}).to_list(length=10)
    for u in users:
        print(f"Username: {u.get('username')}, Role: {u.get('role')}")
    if not users:
        print("NO USERS IN DATABASE")


asyncio.run(main())
