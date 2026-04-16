"""
Script to verify Multi-Location Reconciliation Logic.
"""

from datetime import timezone

import sys
import asyncio
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import uuid

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from backend.config import settings

MONGODB_URL = settings.MONGO_URL
DB_NAME = settings.DB_NAME


# Mock Depends
class MockUser:
    def __init__(self):
        self.username = "test_verifier"
        self.role = "supervisor"

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        return getattr(self, key)


async def run_verification():
    print("--- Starting Reconciliation Logic Verification ---", flush=True)

    # 1. Setup DB Connection
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[DB_NAME]

    session_id = str(uuid.uuid4())
    item_code = "TEST_ITEM_MULTI_" + str(uuid.uuid4())[:8]

    try:
        # 2. Setup Data
        print(f"Creating Test Session: {session_id}", flush=True)
        await db.sessions.insert_one(
            {
                "id": session_id,
                "status": "ACTIVE",
                "created_at": str(datetime.now(timezone.utc).replace(tzinfo=None)),
            }
        )

        print(f"Creating Test Item: {item_code} (Stock: 10)", flush=True)
        await db.erp_items.insert_one(
            {
                "item_code": item_code,
                "item_name": "Test Item Multi Loc",
                "barcode": "99999999",
                "stock_qty": 10.0,
                "mrp": 100.0,
            }
        )

        # 3. Simulate Counts
        # Location A: 6 items (Variance -4 if calculated individually)
        print("Simulating Count: Location A (Qty: 6)", flush=True)
        await db.count_lines.insert_one(
            {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "item_code": item_code,
                "counted_qty": 6.0,
                "floor_no": "Floor1",
                "rack_no": "RackA",
                "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        # Location B: 4 items (Variance -6 if calculated individually)
        print("Simulating Count: Location B (Qty: 4)", flush=True)
        await db.count_lines.insert_one(
            {
                "id": str(uuid.uuid4()),
                "session_id": session_id,
                "item_code": item_code,
                "counted_qty": 4.0,
                "floor_no": "Floor1",
                "rack_no": "RackB",
                "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        # 4. Run Reconciliation
        print("\n--- Calling Reconciliation API ---", flush=True)

        # We call the function directly to test logic (bypassing HTTP layer for speed/simplicity)
        # But we need to mock internal get_db call or ensure it uses our DB
        # The api uses `backend.db.runtime.get_db`. Ideally we should use TestClient.
        # However, let's use TestClient for cleaner integration test.

    except Exception as e:
        print(f"Setup Error: {e}")
        return

    # Using HTTP Test Client
    from fastapi.testclient import TestClient
    from backend.server import app
    from backend.auth.dependencies import get_current_user

    # Override auth to skip login
    app.dependency_overrides[get_current_user] = lambda: {"username": "test_user", "role": "admin"}

    with TestClient(app) as client:
        url = f"/api/v2/reconciliation/session/{session_id}/summary"
        response = client.get(url)

        if response.status_code != 200:
            print(f"API Failed: {response.status_code} - {response.text}")
            return

        data = response.json()
        print(f"API Response Status: {response.status_code}")

        # 5. Verify Results
        items = data.get("items", [])
        if not items:
            print("FAILURE: No items returned in summary")

        target_item = next((i for i in items if i["item_code"] == item_code), None)

        if target_item:
            print(f"\nItem Summary for {item_code}:")
            print(f"Total Counted: {target_item['total_counted']} (Expected: 10.0)")
            print(f"System Stock: {target_item['system_stock']} (Expected: 10.0)")
            print(f"Variance: {target_item['variance']} (Expected: 0.0)")
            print(f"Status: {target_item['status']} (Expected: MATCH)")

            if target_item["total_counted"] == 10.0 and target_item["variance"] == 0.0:
                print("\nSUCCESS: Multi-location counts aggregated correctly!")
            else:
                print("\nFAILURE: Aggregation incorrect.")
        else:
            print("FAILURE: Target item not found in response.")

    # Cleanup
    print("\nCleaning up test data...", flush=True)
    await db.sessions.delete_one({"id": session_id})
    await db.erp_items.delete_one({"item_code": item_code})
    await db.count_lines.delete_many({"session_id": session_id})


if __name__ == "__main__":
    from datetime import datetime

    asyncio.run(run_verification())
