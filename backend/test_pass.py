import os

if os.getenv("ENVIRONMENT", "development").lower() in {"production", "staging"}:
    raise RuntimeError("test_pass.py cannot run in production or staging environments")

import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.append("..")
from backend.utils.auth_utils import get_password_hash, get_pin_hash


async def main():
    client = AsyncIOMotorClient("mongodb://127.0.0.1:27017")
    db = client["stock_verification"]

    # FORCE RESET to known defaults
    await db.users.update_one(
        {"username": "admin"},
        {
            "$set": {
                "hashed_password": get_password_hash("admin123"),
                "pin_hash": get_pin_hash("1234"),
            }
        },
    )
    await db.users.update_one(
        {"username": "supervisor"},
        {
            "$set": {
                "hashed_password": get_password_hash("super123"),
                "pin_hash": get_pin_hash("1234"),
            }
        },
    )
    print("Passwords force reset to admin123 / super123.")
    print("PINs force reset to 1234.")


asyncio.run(main())
