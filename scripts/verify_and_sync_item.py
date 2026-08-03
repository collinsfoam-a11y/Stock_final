import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import pyodbc
import os
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()


async def verify_item_sync(barcode):
    print(f"--- Verifying Item Barcode: {barcode} ---")

    # 1. MongoDB Connection & Lookup
    try:
        mongo_client = AsyncIOMotorClient("mongodb://localhost:27017")
        db = mongo_client.stock_verification
        item = await db.erp_items.find_one({"barcode": barcode})

        if not item:
            print(f"ERROR: Item with barcode {barcode} not found in MongoDB.")
            return

        item_code = item.get("item_code")
        mongo_qty = item.get("stock_qty", 0.0)
        item_name = item.get("item_name")
        print(f"MongoDB Found: {item_name} ({item_code}) | Qty: {mongo_qty}")

    except Exception as e:
        print(f"ERROR: MongoDB Connection/Lookup failed: {e}")
        return

    # 2. SQL Server Connection & Lookup
    sql_qty = None
    try:
        conn_str = os.getenv("ERP_CONN_STR")
        if not conn_str:
            print("ERROR: ERP_CONN_STR not found in .env")
            return

        conn = pyodbc.connect(conn_str, timeout=5)
        cursor = conn.cursor()

        # Simplified query for stock verification
        query = "SELECT TOP 1 StockQty FROM StockTable WHERE ItemCode = ?"
        cursor.execute(query, (item_code,))
        row = cursor.fetchone()

        if row:
            sql_qty = float(row[0])
            print(f"SQL Server Found Qty: {sql_qty}")
        else:
            print(f"WARNING: Item {item_code} not found in SQL Server.")
            return

    except Exception as e:
        print(f"ERROR: SQL Server Connection/Lookup failed: {e}")
        return

    # 3. Compare and Update
    if mongo_qty != sql_qty:
        print(f"MISMATCH DETECTED: MongoDB({mongo_qty}) != SQL({sql_qty})")
        try:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            result = await db.erp_items.update_one(
                {"barcode": barcode},
                {
                    "$set": {
                        "stock_qty": sql_qty,
                        "last_sync_at": now,
                        "sync_log": f"Manual reconcile at {now.isoformat()} from {mongo_qty} to {sql_qty}",
                    }
                },
            )
            if result.modified_count > 0:
                print(f"SUCCESS: MongoDB updated to {sql_qty} at {now}")
            else:
                print("WARNING: No document was modified in MongoDB.")
        except Exception as e:
            print(f"ERROR: Failed to update MongoDB: {e}")
    else:
        print("MATCH: Quantities are identical. No update needed.")


if __name__ == "__main__":
    asyncio.run(verify_item_sync("522905"))
