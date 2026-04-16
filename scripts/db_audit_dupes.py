"""
Database Duplication Audit Utility
Identifies duplicate barcodes, item codes, and overlapping count lines in MongoDB.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()


async def audit_duplicates():
    mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    db_name = os.getenv("MONGODB_DB_NAME", "stock_verify")

    print(f"Connecting to {mongo_uri} (DB: {db_name})...")
    client = AsyncIOMotorClient(mongo_uri)
    db = client[db_name]

    print("\n--- Auditing ERP Items for Duplicates ---")

    # 1. Duplicate Barcodes
    pipeline = [
        {"$match": {"barcode": {"$ne": ""}}},
        {"$group": {"_id": "$barcode", "count": {"$sum": 1}, "docs": {"$push": "$item_code"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]

    barcode_dupes = await db.erp_items.aggregate(pipeline).to_list(None)
    if barcode_dupes:
        print(f"ERROR: Found {len(barcode_dupes)} duplicate barcodes!")
        for dupe in barcode_dupes:
            print(f"  Barcode [{dupe['_id']}] used by items: {dupe['docs']}")
    else:
        print("✓ No duplicate barcodes found in ERP items.")

    # 2. Duplicate Item Codes
    pipeline = [
        {"$group": {"_id": "$item_code", "count": {"$sum": 1}, "barcodes": {"$push": "$barcode"}}},
        {"$match": {"count": {"$gt": 1}}},
    ]

    code_dupes = await db.erp_items.aggregate(pipeline).to_list(None)
    if code_dupes:
        print(f"ERROR: Found {len(code_dupes)} duplicate item codes!")
        for dupe in code_dupes:
            print(
                f"  Item Code [{dupe['_id']}] used {dupe['count']} times with barcodes: {dupe['barcodes']}"
            )
    else:
        print("✓ No duplicate item codes found.")

    print("\n--- Auditing Count Lines for Overlaps ---")
    # Same item counted in same session/location twice in separate lines
    pipeline = [
        {
            "$group": {
                "_id": {
                    "session": "$session_id",
                    "item": "$item_code",
                    "floor": "$floor_no",
                    "rack": "$rack_no",
                },
                "count": {"$sum": 1},
                "total_qty": {"$sum": "$counted_qty"},
                "ids": {"$push": {"$toString": "$_id"}},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
    ]

    overlaps = await db.count_lines.aggregate(pipeline).to_list(None)
    if overlaps:
        print(f"WARNING: Found {len(overlaps)} overlapping count lines!")
        for o in overlaps:
            loc = f"Floor: {o['_id']['floor']}, Rack: {o['_id']['rack']}"
            print(
                f"  Item [{o['_id']['item']}] in session [{o['_id']['session']}] at {loc} has {o['count']} separate lines. Total Qty: {o['total_qty']}"
            )
    else:
        print("✓ No overlapping count lines found.")

    client.close()
    print("\nAudit Complete.")


if __name__ == "__main__":
    asyncio.run(audit_duplicates())
