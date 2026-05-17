import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


async def check_erp_items():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client.stock_verification
    count = await db.erp_items.count_documents({})
    print(f"Total ERP items in MongoDB: {count}")

    # Check if we have some live-queried data
    try:
        from backend.config import settings
        from backend.sql_server_connector import SQLServerConnector

        sql = SQLServerConnector()
        # Note: connect() is called internally by health check or we can call it here
        is_connected = await asyncio.to_thread(
            sql.connect,
            settings.SQL_SERVER_HOST,
            settings.SQL_SERVER_PORT,
            settings.SQL_SERVER_DATABASE,
            settings.SQL_SERVER_USER,
            settings.SQL_SERVER_PASSWORD,
        )
        print(f"Direct SQL connection: {'SUCCESS' if is_connected else 'FAILED'}")
    except Exception as e:
        print(f"Direct SQL connection check failed: {e}")


if __name__ == "__main__":
    asyncio.run(check_erp_items())
