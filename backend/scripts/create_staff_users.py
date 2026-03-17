import asyncio
import logging
import sys
import os
from datetime import datetime, timezone
from typing import List

# Add root directory to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from backend.config import settings
from backend.db.runtime import lifespan_db
from backend.utils.auth_utils import get_password_hash

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def create_users(usernames: List[str], password: str):
    logger.info(f"Connecting to MongoDB at {settings.MONGO_URL}")
    
    async with lifespan_db(settings.MONGO_URL, settings.DB_NAME) as (client, db):
        hashed_password = get_password_hash(password)
        
        for username in usernames:
            existing_user = await db.users.find_one({"username": username})
            if existing_user:
                logger.info(f"User '{username}' already exists. Skipping.")
                continue
            
            user_doc = {
                "username": username,
                "hashed_password": hashed_password,
                "full_name": f"Staff User {username[-1]}",
                "role": "staff",
                "employee_id": f"EMP{username[-1]}",
                "phone": f"987654321{username[-1]}",
                "is_active": True,
                "permissions": [],
                "created_at": datetime.now(timezone.utc),
            }
            
            result = await db.users.insert_one(user_doc)
            logger.info(f"Created user '{username}' with ID: {result.inserted_id}")

if __name__ == "__main__":
    users_to_create = ["staff2", "staff3", "staff4", "staff5"]
    password_to_set = "staff123"
    
    asyncio.run(create_users(users_to_create, password_to_set))
