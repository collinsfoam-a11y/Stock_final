#!/usr/bin/env python3
"""
Restore MongoDB from JSON backup files
Restores collections from exported JSON files
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from bson import json_util
from motor.motor_asyncio import AsyncIOMotorClient

# Database name - check config
DB_NAME = os.getenv("DB_NAME") or os.getenv("MONGODB_DB_NAME") or "stock_verification"
GOVERNED_COLLECTIONS = {
    "count_lines",
    "sessions",
    "verification_sessions",
    "recount_requests",
    "session_snapshots",
    "unknown_items",
    "manual_items",
}


async def restore_collection(
    client, db_name: str, collection_name: str, json_file: Path, *, execute: bool = False
):
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

        restore_count = len(data) if isinstance(data, list) else 1
        count_before = await collection.count_documents({})
        if not execute:
            print(
                "   🔎 DRY RUN: would clear "
                f"{count_before} existing documents and restore {restore_count} documents"
            )
            return 0

        # Clear existing collection
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


async def restore_backup(backup_dir: Path, db_name: str = DB_NAME, *, execute: bool = False):
    """Restore all collections from backup directory"""
    try:
        # Connect to MongoDB
        mongo_url = (
            os.getenv("MONGO_URL")
            or os.getenv("MONGODB_URI")
            or os.getenv("MONGODB_URL")
            or "mongodb://localhost:27017"
        )
        client = AsyncIOMotorClient(mongo_url)

        # Test connection
        await client.admin.command("ping")
        print("✅ MongoDB connection successful")
        print(f"📊 Database: {db_name}")
        if not execute:
            print("🔎 DRY RUN: no collections will be cleared or restored. Pass --execute to mutate.")
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
            count = await restore_collection(
                client, db_name, collection_name, json_file, execute=execute
            )
            total_restored += count

        print("")
        if execute:
            print(f"✅ Restore complete! Total documents restored: {total_restored}")
        else:
            print("✅ Dry run complete! Total documents restored: 0")

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
    parser.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Clear and restore non-governed collections. Requires prior approval logging under "
            "AGENTS.md checkpoint rules."
        ),
    )

    args = parser.parse_args()

    backup_path = Path(args.backup_dir)
    if not backup_path.exists():
        print(f"❌ Backup directory not found: {backup_path}")
        sys.exit(1)

    print("🔄 Starting MongoDB Restore...")
    print(f"📁 Backup Directory: {backup_path}")
    print(f"💾 Database: {args.db_name}")
    if not args.execute:
        print("🔎 Mode: DRY RUN")
    else:
        print("⚠️  Mode: EXECUTE - this will clear and restore non-governed collections")
    print("")

    success = asyncio.run(restore_backup(backup_path, args.db_name, execute=args.execute))

    sys.exit(0 if success else 1)
