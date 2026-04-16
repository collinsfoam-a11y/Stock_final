import os
from datetime import datetime, timezone

import pytest


def _make_auth_headers(username: str, role: str) -> dict[str, str]:
    from backend.auth.jwt_provider import encode

    jwt_secret = os.getenv("JWT_SECRET")
    jwt_algorithm = os.getenv("JWT_ALGORITHM")
    if not jwt_secret or not jwt_algorithm:
        raise RuntimeError("JWT_SECRET/JWT_ALGORITHM are required for tests")

    token = encode({"sub": username, "role": role}, jwt_secret, algorithm=jwt_algorithm)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_add_quantity_updates_count_line_and_session_totals(async_client, test_db):
    session_id = "sess_add_qty"
    line_id = "line_add_qty"

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "total_variance": 0.0,
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Test Item",
            "counted_qty": 2.0,
            "erp_qty": 1.0,
            "variance": 1.0,
            "mrp_erp": 10.0,
            "mrp_counted": 10.0,
            "financial_impact": 0.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    headers = _make_auth_headers("staff1", "staff")
    resp = await async_client.patch(
        f"/api/count-lines/{line_id}/add-quantity",
        json={"additional_qty": 3.0},
        headers=headers,
    )
    assert resp.status_code == 200

    updated_line = await test_db.count_lines.find_one({"id": line_id})
    assert updated_line is not None
    assert updated_line["counted_qty"] == 5.0
    assert updated_line["variance"] == 4.0  # 5 - erp_qty(1)

    updated_session = await test_db.sessions.find_one({"id": session_id})
    assert updated_session is not None
    # canonical totals are recomputed from the current count_lines state
    assert updated_session["total_variance"] == 4.0


@pytest.mark.asyncio
async def test_verify_and_unverify_persist_flags(async_client, test_db):
    session_id = "sess_verify"
    line_id = "line_verify"

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Test Item",
            "counted_qty": 2.0,
            "erp_qty": 1.0,
            "variance": 1.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "verified": False,
            "verified_by": None,
            "verified_at": None,
        }
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")

    verify_resp = await async_client.put(
        f"/api/count-lines/{line_id}/verify",
        headers=supervisor_headers,
    )
    assert verify_resp.status_code == 200

    verified_line = await test_db.count_lines.find_one({"id": line_id})
    assert verified_line is not None
    assert verified_line["verified"] is True
    assert verified_line["verified_by"] == "supervisor"
    assert verified_line["verified_at"] is not None

    unverify_resp = await async_client.put(
        f"/api/count-lines/{line_id}/unverify",
        headers=supervisor_headers,
    )
    assert unverify_resp.status_code == 200

    unverified_line = await test_db.count_lines.find_one({"id": line_id})
    assert unverified_line is not None
    assert unverified_line["verified"] is False
    assert unverified_line["verified_by"] is None
    assert unverified_line["verified_at"] is None


@pytest.mark.asyncio
async def test_verify_rejects_zero_variance_lines(async_client, test_db):
    session_id = "sess_zero_variance_verify"
    line_id = "line_zero_variance_verify"

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Exact Match Item",
            "counted_qty": 1.0,
            "erp_qty": 1.0,
            "variance": 0.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "status": "pending",
            "verified": False,
            "verified_by": None,
            "verified_at": None,
        }
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")

    verify_resp = await async_client.put(
        f"/api/count-lines/{line_id}/verify",
        headers=supervisor_headers,
    )

    assert verify_resp.status_code == 409
    assert "variance" in str(verify_resp.json()["detail"]).lower()


@pytest.mark.asyncio
async def test_session_count_lines_treat_legacy_zero_variance_pending_as_review_complete(
    async_client, test_db
):
    session_id = "sess_legacy_zero_variance"
    line_id = "line_legacy_zero_variance"

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Legacy Exact Match Item",
            "counted_qty": 1.0,
            "erp_qty": 1.0,
            "variance": 0.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "status": "pending",
            "approval_status": "PENDING",
            "verified": False,
        }
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")

    verified_resp = await async_client.get(
        f"/api/count-lines/session/{session_id}?verified=true",
        headers=supervisor_headers,
    )
    unverified_resp = await async_client.get(
        f"/api/count-lines/session/{session_id}?verified=false",
        headers=supervisor_headers,
    )

    assert verified_resp.status_code == 200
    assert unverified_resp.status_code == 200
    verified_items = verified_resp.json()["items"]
    unverified_items = unverified_resp.json()["items"]
    assert len(verified_items) == 1
    assert verified_items[0]["id"] == line_id
    assert verified_items[0]["status"] == "approved"
    assert unverified_items == []


@pytest.mark.asyncio
async def test_put_update_count_line_recalculates_variance(async_client, test_db):
    session_id = "sess_put_update"
    line_id = "line_put_update"

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "total_variance": 0.0,
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Test Item",
            "counted_qty": 2.0,
            "erp_qty": 1.0,
            "variance": 1.0,
            "mrp_erp": 10.0,
            "mrp_counted": 10.0,
            "financial_impact": 0.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )

    headers = _make_auth_headers("staff1", "staff")
    resp = await async_client.put(
        f"/api/count-lines/{line_id}",
        json={"counted_qty": 10.0},
        headers=headers,
    )
    assert resp.status_code == 200

    updated_line = await test_db.count_lines.find_one({"id": line_id})
    assert updated_line is not None
    assert updated_line["counted_qty"] == 10.0
    assert updated_line["variance"] == 9.0  # 10 - erp_qty(1)

    updated_session = await test_db.sessions.find_one({"id": session_id})
    assert updated_session is not None
    # canonical totals are recomputed from the current count_lines state
    assert updated_session["total_variance"] == 9.0
