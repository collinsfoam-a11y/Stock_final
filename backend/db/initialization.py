import logging
from datetime import datetime, timezone

from backend.services.pin_auth_service import PINAuthService
from backend.utils.auth_utils import get_password_hash, get_pin_hash

logger = logging.getLogger(__name__)


async def init_default_users(db):
    """Create default users if they don't exist, and ensure they have PINs set up."""
    try:
        from backend.utils.crypto_utils import get_pin_lookup_hash

        # Default PIN for all users
        default_pin = "1234"
        pin_hash = get_pin_hash(default_pin)
        pin_lookup_hash = get_pin_lookup_hash(default_pin)

        # Check for staff1
        staff_exists = await db.users.find_one({"username": "staff1"})
        if not staff_exists:
            result = await db.users.insert_one(
                {
                    "username": "staff1",
                    "hashed_password": get_password_hash("staff123"),
                    "pin_hash": pin_hash,
                    "pin_lookup_hash": pin_lookup_hash,
                    "full_name": "Staff Member",
                    "role": "staff",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            pin_service = PINAuthService(db)
            await pin_service.set_pin(str(result.inserted_id), default_pin)
            logger.info("Default user created: staff1")
        else:
            # Ensure staff1 has PIN set
            if "pin_hash" not in staff_exists:
                await db.users.update_one(
                    {"username": "staff1"},
                    {"$set": {"pin_hash": pin_hash, "pin_lookup_hash": pin_lookup_hash}},
                )
                logger.info("Added PIN to existing user: staff1")

        # Check for supervisor
        supervisor_exists = await db.users.find_one({"username": "supervisor"})
        if not supervisor_exists:
            result = await db.users.insert_one(
                {
                    "username": "supervisor",
                    "hashed_password": get_password_hash("super123"),
                    "pin_hash": pin_hash,
                    "pin_lookup_hash": pin_lookup_hash,
                    "full_name": "Supervisor",
                    "role": "supervisor",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            pin_service = PINAuthService(db)
            await pin_service.set_pin(str(result.inserted_id), default_pin)
            logger.info("Default user created: supervisor")
        else:
            # Ensure supervisor has PIN set
            if "pin_hash" not in supervisor_exists:
                await db.users.update_one(
                    {"username": "supervisor"},
                    {"$set": {"pin_hash": pin_hash, "pin_lookup_hash": pin_lookup_hash}},
                )
                logger.info("Added PIN to existing user: supervisor")

        # Check for admin
        admin_exists = await db.users.find_one({"username": "admin"})
        if not admin_exists:
            result = await db.users.insert_one(
                {
                    "username": "admin",
                    "hashed_password": get_password_hash("admin123"),
                    "pin_hash": pin_hash,
                    "pin_lookup_hash": pin_lookup_hash,
                    "full_name": "Administrator",
                    "role": "admin",
                    "is_active": True,
                    "permissions": ["all"],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            pin_service = PINAuthService(db)
            await pin_service.set_pin(str(result.inserted_id), default_pin)
            logger.info("Default user created: admin")
        else:
            # Ensure admin has PIN set
            if "pin_hash" not in admin_exists:
                await db.users.update_one(
                    {"username": "admin"},
                    {"$set": {"pin_hash": pin_hash, "pin_lookup_hash": pin_lookup_hash}},
                )
                logger.info("Added PIN to existing user: admin")

    except Exception as e:
        logger.error(f"Error creating default users: {str(e)}")
        raise


