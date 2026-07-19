#!/usr/bin/env python3
"""
Supervisor Flow Testing Script
Tests supervisor workflows including session review, variance review, and bulk approvals.
"""

import sys
import uuid
import httpx
import asyncio

BASE_URL = "http://localhost:8001"
USER = "supervisor"
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
        print("  SUPERVISOR FLOW TEST SUITE")
        print("=" * 70)

        # 1. Login
        resp = await client.post("/api/auth/login", json={"username": USER, "password": PASS})
        login_ok = resp.status_code == 200
        if not login_ok:
            log_result("Supervisor login", False, resp.text)
            return False
            
        data = resp.json()["data"]
        token = data["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        log_result("1. Supervisor login", True)

        # 2. Check role
        role_ok = data["user"]["role"] == "supervisor"
        log_result("2. Check role is supervisor", role_ok)

        # 3. Create Session
        uid_sess = str(uuid.uuid4())[:8]
        resp = await client.post("/api/sessions/", headers=headers, json={
            "warehouse": f"Test Warehouse {uid_sess}",
            "type": "STANDARD",
            "location_type": "rack",
            "location_name": f"Test Rack Sup {uid_sess}"
        })
        create_ok = resp.status_code in (200, 201)
        session_id = None
        if create_ok:
            sd = resp.json()
            session_id = sd.get("data", {}).get("id") or sd.get("id") or sd.get("_id")
        log_result("3. Create session", create_ok, resp.text if not create_ok else "")

        # 4. Create Count Line
        cl_id = None
        if session_id:
            uid = str(uuid.uuid4())[:8]
            resp = await client.post("/api/count-lines", headers=headers, json={
                "session_id": session_id,
                "item_code": "ITEM001",
                "counted_qty": 50, # Variance (stock_qty is 100)
                "barcode": "510001",
                "rack_no": f"A1-{uid}",
                "idempotency_key": str(uuid.uuid4()),
                "variance_reason": "Missing from shelf"
            })
            cl_ok = resp.status_code in (200, 201)
            if cl_ok:
                cd = resp.json()
                cl_id = cd.get("data", {}).get("id") or cd.get("id") or cd.get("_id")
            log_result("4. Create count line with variance", cl_ok, resp.text if not cl_ok else "")

        # 5. Review Dashboard (Watchtower)
        resp = await client.get("/api/sessions/active", headers=headers)
        active_ok = resp.status_code == 200
        log_result("5. Get active sessions (Watchtower)", active_ok, resp.text if not active_ok else "")

        # 6. Bulk Approve
        if cl_id:
            resp = await client.post("/api/count-lines/bulk/approve", headers=headers, json={
                "count_line_ids": [cl_id]
            })
            approve_ok = resp.status_code == 200
            log_result("6. Bulk approve count line", approve_ok, resp.text if not approve_ok else "")
        else:
            log_result("6. Bulk approve count line", False, "No count line created")

        # 7. Finalize Session (Not allowed for supervisor typically, but let's check)
        if session_id:
            resp = await client.post(f"/api/sessions/{session_id}/finalize", headers=headers)
            fin_ok = resp.status_code in (401, 403, 409)  # Admin only!
            log_result("7. Finalize session blocked for supervisor", fin_ok, str(resp.status_code))

        # 8. Check Admin Dashboard is blocked
        resp = await client.get("/api/admin/dashboard/summary", headers=headers)
        log_result("8. Admin dashboard blocked", resp.status_code in (401, 403), str(resp.status_code))

    passed = sum(1 for r in results if r["passed"])
    print(f"\n  Total: {len(results)} | ✅ Passed: {passed} | ❌ Failed: {len(results)-passed}\n")
    return passed == len(results)

if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
