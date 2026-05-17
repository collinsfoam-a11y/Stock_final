import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient

from backend.services.governance_guard import install_db_write_guards, raise_forbidden_direct_write

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.stock_verification
install_db_write_guards(db)


async def check_sujata():
    collections = await db.list_collection_names()
    print(f"Collections: {collections}")

    print("\n--- Checking erp_items for SUJ001 ---")
    item = await db.erp_items.find_one({"item_code": "SUJ001"})
    print(f"ERP Item: {item}")

    if "verification_records" in collections:
        print("\n--- Checking Verification Records ---")
        async for rec in db.verification_records.find({"item_code": "SUJ001"}):
            print(f"Record: {rec}")

    if "count_lines" in collections:
        print("\n--- Dumping All Count Lines ---")
        async for line in db.count_lines.find({}):
            print(f"Count Line: {line}")

    if "verification_sessions" in collections:
        print("\n--- Dumping All Verification Sessions ---")
        async for vs in db.verification_sessions.find({}):
            print(f"Verif Session: {vs}")

    print("\n--- Dumping All Sessions ---")
    session_id = None
    async for session in db.sessions.find({}):
        print(f"Session: {session}")
        session_id = session.get("id")

    if session_id:
        print("\n--- Manual injection is disabled by governance policy ---")
        raise_forbidden_direct_write("scripts.verify_sujata_db.manual_count_line_injection")
    else:
        print("No active session found to inject into.")


if __name__ == "__main__":
    asyncio.run(check_sujata())
