#!/usr/bin/env python3
"""
Admin Flow Testing Script
Tests admin workflows including dashboard access, session finalization, and user management blocks.
"""

import sys
import uuid
import httpx
import asyncio

BASE_URL = "http://localhost:8001"
USER = "admin"
PASS = "admin123"

results = []

def log_result(test_name: str, passed: bool, detail: str = ""):
    status = "✅ PASS" if passed else "❌ FAIL"
    results.append({"test": test_name, "passed": passed, "detail": detail})
    print(f"  {status} | {test_name}")
    if detail and not passed:
        print(f"         └─ {detail[:200]}")

async def run_all_tests():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        print("\n" + "=" * 70)
        print("  ADMIN FLOW TEST SUITE")
        print("=" * 70)

        # 1. Login
        resp = await client.post("/api/auth/login", json={"username": USER, "password": PASS})
        login_ok = resp.status_code == 200
        if not login_ok:
            log_result("Admin login", False, resp.text)
            return False
            
        data = resp.json()["data"]
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        log_result("1. Admin login", True)

        # 2. Check role
        role_ok = data["user"]["role"] == "admin"
        log_result("2. Check role is admin", role_ok)

        # 3. Create Session
        resp = await client.post("/api/sessions/", headers=headers, json={
            "warehouse": f"Test Warehouse Admin {str(uuid.uuid4())[:8]}",
            "type": "STANDARD",
            "location_type": "rack",
            "location_name": "Test Rack Admin"
        })
        create_ok = resp.status_code in (200, 201)
        session_id = None
        if create_ok:
            sd = resp.json()
            session_id = sd.get("data", {}).get("id") or sd.get("id") or sd.get("_id")
        log_result("3. Create session", create_ok, resp.text if not create_ok else "")

        # 4. Change Session Status to RECONCILE
        if session_id:
            resp = await client.put(f"/api/sessions/{session_id}/status?status=RECONCILE", headers=headers)
            rec_ok = resp.status_code == 200
            log_result("4. Change session status to RECONCILE", rec_ok, resp.text if not rec_ok else "")
        else:
            log_result("4. Change session status to RECONCILE", False, "No session ID")

        # 5. Finalize Session (Admin only)
        if session_id:
            resp = await client.post(f"/api/sessions/{session_id}/finalize", headers=headers)
            fin_ok = resp.status_code == 200
            log_result("5. Finalize session", fin_ok, resp.text if not fin_ok else "")
        else:
            log_result("5. Finalize session", False, "No session ID")

        # 6. Admin Dashboard Access
        resp = await client.get("/api/admin/dashboard/summary", headers=headers)
        dash_ok = resp.status_code == 200
        log_result("6. Access Admin Dashboard", dash_ok, resp.text if not dash_ok else "")

        # 7. Sync Trigger (Admin only)
        resp = await client.post("/api/sync/trigger", headers=headers)
        sync_ok = resp.status_code == 200
        log_result("7. Trigger Sync", sync_ok, resp.text if not sync_ok else "")

    passed = sum(1 for r in results if r["passed"])
    print(f"\n  Total: {len(results)} | ✅ Passed: {passed} | ❌ Failed: {len(results)-passed}\n")
    return passed == len(results)

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
