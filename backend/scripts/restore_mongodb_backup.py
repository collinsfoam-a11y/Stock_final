#!/usr/bin/env python3
"""
Restore MongoDB from JSON backup files
Restores collections from exported JSON files
"""

import asyncio
import json
import sys
from pathlib import Path

from bson import json_util
from motor.motor_asyncio import AsyncIOMotorClient

# Database name - check config
DB_NAME = "stock_verification"  # Default from config.py
GOVERNED_COLLECTIONS = {
    "count_lines",
    "sessions",
    "verification_sessions",
    "recount_requests",
    "session_snapshots",
    "unknown_items",
}


async def restore_collection(client, db_name: str, collection_name: str, json_file: Path):
    """Restore a single collection from JSON file"""
    try:
        if collection_name in GOVERNED_COLLECTIONS:
            print(
                f"   ⛔ Restore blocked for governed collection '{collection_name}'. "
                "Use canonical domain services."
            )
            return 0

        db = client[db_name]
        collection = db[collection_name]

        print(f"📦 Restoring collection: {collection_name}...")

        # Read JSON file (MongoDB Extended JSON format)
        with open(json_file, encoding="utf-8") as f:
            # Use bson.json_util to parse MongoDB Extended JSON ($oid, $date, etc.)
            data = json.load(f, object_hook=json_util.object_hook)

        if not data:
            print(f"   ⚠️  No data in {collection_name}")
            return 0

        # Clear existing collection
        count_before = await collection.count_documents({})
        if count_before > 0:
            print(f"   🗑️  Clearing {count_before} existing documents...")
            await collection.delete_many({})

        # Insert documents
        if isinstance(data, list):
            if len(data) > 0:
                result = await collection.insert_many(data)
                print(f"   ✅ Restored {len(result.inserted_ids)} documents")
                return len(result.inserted_ids)
            else:
                print(f"   ⚠️  Empty list in {collection_name}")
                return 0
        else:
            # Single document
            result = await collection.insert_one(data)
            print("   ✅ Restored 1 document")
            return 1

    except Exception as e:
        print(f"   ❌ Error restoring {collection_name}: {e}")
        import traceback

        traceback.print_exc()
        return 0


async def restore_backup(backup_dir: Path, db_name: str = DB_NAME):
    """Restore all collections from backup directory"""
    try:
        # Connect to MongoDB
        client = AsyncIOMotorClient("mongodb://localhost:27017")

        # Test connection
        await client.admin.command("ping")
        print("✅ MongoDB connection successful")
        print(f"📊 Database: {db_name}")
        print("")

        # Find all JSON files
        json_files = list(backup_dir.glob("*.json"))

        # Filter out metadata and restore script
        collection_files = [
            f for f in json_files if f.name not in ["_backup_metadata.json", "restore_backup.py"]
        ]

        if not collection_files:
            print("❌ No collection files found in backup directory")
            return False

        print(f"📁 Found {len(collection_files)} collections to restore:")
        for f in collection_files:
            print(f"   - {f.name}")
        print("")

        # Restore each collection
        total_restored = 0
        for json_file in collection_files:
            collection_name = json_file.stem  # Remove .json extension
            count = await restore_collection(client, db_name, collection_name, json_file)
            total_restored += count

        print("")
        print(f"✅ Restore complete! Total documents restored: {total_restored}")

        # Verify
        db = client[db_name]
        collections = await db.list_collection_names()
        print(f"\n📊 Collections in database: {len(collections)}")
        for coll_name in sorted(collections):
            count = await db[coll_name].count_documents({})
            print(f"   - {coll_name}: {count} documents")

        client.close()
        return True

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Restore MongoDB from JSON backup")
    parser.add_argument(
        "--backup-dir",
        type=str,
        default="mongodb_backup_temp/mongodb_backup_2025-11-12_031405",
        help="Path to backup directory",
    )
    parser.add_argument("--db-name", type=str, default=DB_NAME, help="Database name to restore to")

    args = parser.parse_args()

    backup_path = Path(args.backup_dir)
    if not backup_path.exists():
        print(f"❌ Backup directory not found: {backup_path}")
        sys.exit(1)

    print("🔄 Starting MongoDB Restore...")
    print(f"📁 Backup Directory: {backup_path}")
    print(f"💾 Database: {args.db_name}")
    print("")

    success = asyncio.run(restore_backup(backup_path, args.db_name))

    sys.exit(0 if success else 1)
