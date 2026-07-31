import asyncio
import os
import sys

sys.path.append(os.path.abspath("/Users/noufi1/stk_final/Stock_final"))
from backend.config import settings
from backend.db.runtime import lifespan_db
from backend.utils.auth_utils import get_password_hash

async def update_passwords():
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME) as (client, db):
        hashed_password = get_password_hash("staff123")
        result = await db.users.update_many(
            {}, 
            {"$set": {"hashed_password": hashed_password}}
        )
        print(f"Updated {result.modified_count} users to use password 'staff123'")

asyncio.run(update_passwords())
