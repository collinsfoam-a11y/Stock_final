import logging
from datetime import datetime, timezone

from backend.utils.api_utils import sanitize_for_logging
from backend.utils.auth_utils import get_password_hash, get_password_hash_metadata
from backend.core.lifespan import db

logger = logging.getLogger("stock-verify")

def _password_fields(password: str) -> dict[str, str]:
    hashed_password = get_password_hash(password)
    return {"hashed_password": hashed_password, **get_password_hash_metadata(hashed_password)}

async def init_default_users() -> None:
    """Create default users if they don't exist"""
    try:
        # Check for staff1
        staff_exists = await db.users.find_one({"username": "staff1"})
        if not staff_exists:
            await db.users.insert_one(
                {
                    "username": "staff1",
                    **_password_fields("staff123"),
                    "full_name": "Staff Member",
                    "role": "staff",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: staff1")

        # Check for supervisor
        supervisor_exists = await db.users.find_one({"username": "supervisor"})
        if not supervisor_exists:
            await db.users.insert_one(
                {
                    "username": "supervisor",
                    **_password_fields("super123"),
                    "full_name": "Supervisor",
                    "role": "supervisor",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: supervisor")

        # Check for admin
        admin_exists = await db.users.find_one({"username": "admin"})
        if not admin_exists:
            await db.users.insert_one(
                {
                    "username": "admin",
                    **_password_fields("admin123"),
                    "full_name": "Administrator",
                    "role": "admin",
                    "is_active": True,
                    "permissions": [],
                    "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            )
            logger.info("Default user created: admin")
    except Exception as e:
        logger.error(
            "Error creating default users: %s",
            sanitize_for_logging(str(e), 200),
        )
        raise

async def init_mock_erp_data() -> None:
    """Populate local mock ERP data when the collection is empty."""
    count = await db.erp_items.count_documents({})
    if count == 0:
        mock_items = [
            {
                "item_code": "ITEM001",
                "item_name": "Rice Bag 25kg",
                "barcode": "1234567890123",
                "stock_qty": 150.0,
                "mrp": 1200.0,
                "category": "Food",
                "warehouse": "Main",
                "image_url": "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=200",
            },
            {
                "item_code": "ITEM002",
                "item_name": "Cooking Oil 5L",
                "barcode": "1234567890124",
                "stock_qty": 80.0,
                "mrp": 650.0,
                "category": "Food",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM003",
                "item_name": "Sugar 1kg",
                "barcode": "1234567890125",
                "stock_qty": 200.0,
                "mrp": 50.0,
                "category": "Food",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM004",
                "item_name": "Tea Powder 250g",
                "barcode": "1234567890126",
                "stock_qty": 95.0,
                "mrp": 180.0,
                "category": "Beverages",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM005",
                "item_name": "Soap Bar",
                "barcode": "1234567890127",
                "stock_qty": 300.0,
                "mrp": 25.0,
                "category": "Personal Care",
                "warehouse": "Main",
            },
            {
                "item_code": "ITEM006",
                "item_name": "Shampoo 200ml",
                "barcode": "1234567890128",
                "stock_qty": 120.0,
                "mrp": 150.0,
                "category": "Personal Care",
                "warehouse": "Main",
            },
        ]
        await db.erp_items.insert_many(mock_items)
        logger.info("Initialized mock ERP data with %d items", len(mock_items))
