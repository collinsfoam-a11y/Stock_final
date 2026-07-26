import asyncio

from backend.core.database import db
from backend.services.sql_verification_service import sql_verification_service


async def test():
    item = await db.erp_items.find_one({"item_code": "530198"})
    print("Initial Mongo:", item.get("stock_qty"), item.get("sql_verified_qty"))

    res = await sql_verification_service.verify_item_quantity("530198")
    print("SQL Verification Result:", res)

    item = await db.erp_items.find_one({"item_code": "530198"})
    print("Post-verify Mongo:", item.get("stock_qty"), item.get("sql_verified_qty"))


if __name__ == "__main__":
    asyncio.run(test())
