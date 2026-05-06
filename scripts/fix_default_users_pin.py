import asyncio
import logging
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from backend.utils.auth_utils import get_pin_hash  # noqa: E402
from backend.utils.crypto_utils import get_pin_lookup_hash  # noqa: E402
from backend.config import settings  # noqa: E402


async def fix_pins():
    logger.info("Connecting to MongoDB...")
    client = AsyncIOMotorClient(settings.MONGO_URL)
    db = client[settings.DB_NAME]

    default_pin = os.getenv("SEED_DEFAULT_PIN", "").strip()
    if len(default_pin) != 4 or not default_pin.isdigit():
        raise RuntimeError("SEED_DEFAULT_PIN must be set to exactly 4 numeric digits.")

    users_config = {"staff1": default_pin, "supervisor": default_pin, "admin": default_pin}

    for username, pin in users_config.items():
        logger.info(f"Checking user: {username}")
        user = await db.users.find_one({"username": username})

        if not user:
            logger.warning(f"User {username} not found!")
            continue

        # Always update to ensure correct PIN hashes
        pin_hash = get_pin_hash(pin)
        pin_lookup_hash = get_pin_lookup_hash(pin)

        result = await db.users.update_one(
            {"username": username},
            {"$set": {"pin_hash": pin_hash, "pin_lookup_hash": pin_lookup_hash}},
        )

        if result.modified_count > 0:
            logger.info(f"✓ Updated PIN for {username}")
        else:
            logger.info(f"- {username} already has correct PIN/no changes needed")

    logger.info("Fix complete!")


if __name__ == "__main__":
    asyncio.run(fix_pins())
