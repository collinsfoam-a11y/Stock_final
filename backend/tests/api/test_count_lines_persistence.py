import os
import hashlib
import json
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
async def test_add_quantity_clears_stale_approval_state(async_client, test_db):
    session_id = "sess_add_qty_reset"
    line_id = "line_add_qty_reset"

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
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM001",
            "barcode": "530101",
            "item_name": "Test Item",
            "stock_qty": 1.0,
            "mrp": 10.0,
            "category": "E2E",
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "barcode": "530101",
            "item_name": "Test Item",
            "counted_qty": 1.0,
            "erp_qty": 1.0,
            "variance": 0.0,
            "mrp_erp": 10.0,
            "mrp_counted": 10.0,
            "financial_impact": 0.0,
            "counted_by": "staff1",
            "counted_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "status": "approved",
            "approval_status": "APPROVED",
            "approved_by": "system",
            "approved_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "verified": True,
            "verified_by": "supervisor",
            "verified_at": datetime.now(timezone.utc).replace(tzinfo=None),
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
    assert updated_line["counted_qty"] == 4.0
    assert updated_line["variance"] == 3.0
    assert updated_line["status"] == "pending"
    assert updated_line["approval_status"] == "NEEDS_REVIEW"
    assert updated_line["requires_supervisor_approval"] is True
    assert updated_line["approved_by"] is None
    assert updated_line["approved_at"] is None
    assert updated_line["verified"] is False
    assert updated_line["verified_by"] is None
    assert updated_line["verified_at"] is None


@pytest.mark.asyncio
async def test_create_count_line_rejects_snapshot_integrity_mismatch(async_client, test_db):
    session_id = "sess_snapshot_guard"
    snapshot_items = [
        {
            "item_code": "ITEM001",
            "stock_qty": 5.0,
            "warehouse": "Main",
            "source_data": {
                "barcode": "530102",
                "item_name": "Snapshot Guard Item",
                "mrp": 10.0,
            },
        }
    ]
    snapshot_hash = hashlib.sha256(
        json.dumps(snapshot_items, sort_keys=True, default=str).encode()
    ).hexdigest()

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "snapshot_hash": "tampered-hash",
            "snapshot_items_ref": "snapshot-guard-1",
        }
    )
    await test_db.session_snapshots.insert_one(
        {
            "id": "snapshot-guard-1",
            "session_id": session_id,
            "warehouse": "Main",
            "snapshot_hash": snapshot_hash,
            "items": snapshot_items,
            "item_count": 1,
            "config_version_id": "cfg-1",
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEM001",
            "barcode": "530102",
            "item_name": "Snapshot Guard Item",
            "stock_qty": 5.0,
            "mrp": 10.0,
            "category": "E2E",
        }
    )

    headers = _make_auth_headers("staff1", "staff")
    resp = await async_client.post(
        "/api/count-lines",
        json={
            "session_id": session_id,
            "item_code": "ITEM001",
            "barcode": "530102",
            "counted_qty": 5.0,
        },
        headers=headers,
    )

    assert resp.status_code == 409
    assert "snapshot integrity" in str(resp.json()["detail"]).lower()


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
async def test_approve_count_line_clears_rejection_metadata(async_client, test_db):
    session_id = "sess_approve_transition"
    line_id = "line_approve_transition"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": line_id,
            "session_id": session_id,
            "item_code": "ITEM001",
            "item_name": "Approve Transition Item",
            "counted_qty": 2.0,
            "erp_qty": 1.0,
            "variance": 1.0,
            "counted_by": "staff1",
            "counted_at": now,
            "status": "rejected",
            "approval_status": "REJECTED",
            "assigned_to": "staff1",
            "recount_requested_at": now,
            "recount_requested_by": "supervisor",
            "rejected_at": now,
            "rejected_by": "supervisor",
            "rejection_reason": "Need recount",
            "verified": False,
        }
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")
    approve_resp = await async_client.put(
        f"/api/count-lines/{line_id}/approve",
        json={"notes": "Reviewed and accepted"},
        headers=supervisor_headers,
    )

    assert approve_resp.status_code == 200, approve_resp.text

    approved_line = await test_db.count_lines.find_one({"id": line_id})
    assert approved_line is not None
    assert approved_line["status"] == "approved"
    assert approved_line["approval_status"] == "APPROVED"
    assert approved_line["approved_by"] == "supervisor"
    assert approved_line["approved_at"] is not None
    assert approved_line["approval_note"] == "Reviewed and accepted"
    assert approved_line["assigned_to"] is None
    assert approved_line["recount_requested_at"] is None
    assert approved_line["recount_requested_by"] is None
    assert approved_line["rejected_at"] is None
    assert approved_line["rejected_by"] is None
    assert approved_line["rejection_reason"] is None


@pytest.mark.asyncio
async def test_bulk_approve_count_lines_marks_verified(async_client, test_db):
    session_id = "sess_bulk_approve_transition"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
        }
    )

    await test_db.count_lines.insert_many(
        [
            {
                "id": "bulk-approve-1",
                "session_id": session_id,
                "item_code": "ITEM001",
                "item_name": "Bulk Approve One",
                "counted_qty": 2.0,
                "erp_qty": 1.0,
                "variance": 1.0,
                "counted_by": "staff1",
                "counted_at": now,
                "status": "rejected",
                "approval_status": "REJECTED",
                "assigned_to": "staff1",
                "recount_requested_at": now,
                "recount_requested_by": "supervisor",
                "rejected_at": now,
                "rejected_by": "supervisor",
                "verified": False,
            },
            {
                "id": "bulk-approve-2",
                "session_id": session_id,
                "item_code": "ITEM002",
                "item_name": "Bulk Approve Two",
                "counted_qty": 3.0,
                "erp_qty": 1.0,
                "variance": 2.0,
                "counted_by": "staff1",
                "counted_at": now,
                "status": "pending",
                "approval_status": "NEEDS_REVIEW",
                "verified": False,
            },
        ]
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")
    approve_resp = await async_client.post(
        "/api/count-lines/bulk/approve",
        json={"count_line_ids": ["bulk-approve-1", "bulk-approve-2"], "notes": "Bulk accepted"},
        headers=supervisor_headers,
    )

    assert approve_resp.status_code == 200, approve_resp.text

    for line_id in ("bulk-approve-1", "bulk-approve-2"):
        approved_line = await test_db.count_lines.find_one({"id": line_id})
        assert approved_line is not None
        assert approved_line["status"] == "approved"
        assert approved_line["approval_status"] == "APPROVED"
        assert approved_line["approved_by"] == "supervisor"
        assert approved_line["approval_note"] == "Bulk accepted"
        assert approved_line["verified"] is True
        assert approved_line["verified_by"] == "supervisor"
        assert approved_line["verified_at"] is not None
        assert approved_line.get("assigned_to") is None
        assert approved_line.get("recount_requested_at") is None
        assert approved_line.get("recount_requested_by") is None
        assert approved_line.get("rejected_at") is None
        assert approved_line.get("rejected_by") is None


@pytest.mark.asyncio
async def test_bulk_reject_count_lines_clears_stale_approval_metadata(async_client, test_db):
    session_id = "sess_bulk_reject_transition"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
        }
    )

    await test_db.count_lines.insert_one(
        {
            "id": "bulk-reject-1",
            "session_id": session_id,
            "item_code": "ITEM003",
            "item_name": "Bulk Reject One",
            "counted_qty": 5.0,
            "erp_qty": 1.0,
            "variance": 4.0,
            "counted_by": "staff1",
            "counted_at": now,
            "status": "approved",
            "approval_status": "APPROVED",
            "approved_by": "supervisor",
            "approved_at": now,
            "approval_note": "Old approval",
            "verified": True,
            "verified_by": "supervisor",
            "verified_at": now,
        }
    )

    supervisor_headers = _make_auth_headers("supervisor", "supervisor")
    reject_resp = await async_client.post(
        "/api/count-lines/bulk/reject",
        json={"count_line_ids": ["bulk-reject-1"], "notes": "Bulk rejection"},
        headers=supervisor_headers,
    )

    assert reject_resp.status_code == 200, reject_resp.text

    rejected_line = await test_db.count_lines.find_one({"id": "bulk-reject-1"})
    assert rejected_line is not None
    assert rejected_line["status"] == "rejected"
    assert rejected_line["approval_status"] == "REJECTED"
    assert rejected_line["approved_by"] is None
    assert rejected_line["approved_at"] is None
    assert rejected_line["approval_note"] is None
    assert rejected_line["verified"] is False
    assert rejected_line["verified_by"] is None
    assert rejected_line["verified_at"] is None
    assert rejected_line["rejected_by"] == "supervisor"
    assert rejected_line["rejected_at"] is not None
    assert rejected_line["rejection_reason"] == "Bulk rejection"
    assert rejected_line.get("assigned_to") is None
    assert rejected_line.get("recount_requested_at") is None
    assert rejected_line.get("recount_requested_by") is None


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


@pytest.mark.asyncio
async def test_batch_create_count_lines_uses_governed_creation(async_client, test_db):
    session_id = "sess_batch_governed"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
            "total_variance": 0.0,
        }
    )
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEMBATCH1",
            "barcode": "531001",
            "item_name": "Batch Governed Item",
            "stock_qty": 1.0,
            "mrp": 10.0,
            "category": "E2E",
        }
    )

    headers = _make_auth_headers("staff1", "staff")
    resp = await async_client.post(
        "/api/count-lines/batch",
        json={
            "session_id": session_id,
            "lines": [
                {
                    "session_id": session_id,
                    "item_code": "ITEMBATCH1",
                    "barcode": "531001",
                    "counted_qty": 3.0,
                    "floor_no": "F1",
                    "rack_no": "R1",
                    "correction_reason": {
                        "code": "COUNT_ADJUSTMENT",
                        "description": "Batch-created variance requires review",
                    },
                }
            ],
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    created = await test_db.count_lines.find_one({"session_id": session_id, "item_code": "ITEMBATCH1"})
    assert created is not None
    assert created["counted_qty"] == 3.0
    assert created["variance"] == 2.0
    assert created["approval_status"] == "NEEDS_REVIEW"
    assert created["status"] == "pending"
    assert created["requires_supervisor_approval"] is True
    assert "LARGE_VARIANCE" in (created.get("risk_flags") or [])


@pytest.mark.asyncio
async def test_merge_count_lines_recalculates_target_governance(async_client, test_db):
    session_id = "sess_merge_governed"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
            "total_variance": 0.0,
        }
    )
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEMMERGE1",
            "barcode": "531002",
            "item_name": "Merge Governed Item",
            "stock_qty": 1.0,
            "mrp": 10.0,
            "category": "E2E",
        }
    )
    await test_db.count_lines.insert_many(
        [
            {
                "id": "merge-target",
                "session_id": session_id,
                "item_code": "ITEMMERGE1",
                "barcode": "531002",
                "item_name": "Merge Governed Item",
                "counted_qty": 1.0,
                "erp_qty": 1.0,
                "baseline_hash": "baseline-1",
                "variance": 0.0,
                "mrp_erp": 10.0,
                "mrp_counted": 10.0,
                "status": "approved",
                "approval_status": "APPROVED",
                "verified": True,
                "counted_by": "staff1",
                "counted_at": now,
                "floor_no": "F1",
                "rack_no": "R1",
            },
            {
                "id": "merge-source",
                "session_id": session_id,
                "item_code": "ITEMMERGE1",
                "barcode": "531002",
                "item_name": "Merge Governed Item",
                "counted_qty": 2.0,
                "erp_qty": 1.0,
                "baseline_hash": "baseline-1",
                "variance": 1.0,
                "mrp_erp": 10.0,
                "mrp_counted": 10.0,
                "status": "pending",
                "approval_status": "NEEDS_REVIEW",
                "verified": False,
                "counted_by": "staff1",
                "counted_at": now,
                "floor_no": "F1",
                "rack_no": "R1",
            },
        ]
    )

    headers = _make_auth_headers("supervisor", "supervisor")
    resp = await async_client.post(
        "/api/count-lines/merge",
        json={
            "target_line_id": "merge-target",
            "source_line_ids": ["merge-source"],
            "keep_target_qty": True,
        },
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    target = await test_db.count_lines.find_one({"id": "merge-target"})
    assert target is not None
    assert target["counted_qty"] == 3.0
    assert target["variance"] == 2.0
    assert target["approval_status"] == "NEEDS_REVIEW"
    assert target["status"] == "pending"
    assert target["verified"] is False


@pytest.mark.asyncio
async def test_complete_recount_request_clears_rejected_state(async_client, test_db):
    session_id = "sess_recount_complete"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": now,
        }
    )
    await test_db.erp_items.insert_one(
        {
            "item_code": "ITEMRECOUNT1",
            "barcode": "531003",
            "item_name": "Recount Governed Item",
            "stock_qty": 1.0,
            "mrp": 10.0,
            "category": "E2E",
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "recount-line-1",
            "session_id": session_id,
            "item_code": "ITEMRECOUNT1",
            "barcode": "531003",
            "item_name": "Recount Governed Item",
            "counted_qty": 5.0,
            "erp_qty": 1.0,
            "baseline_hash": "baseline-1",
            "variance": 4.0,
            "mrp_erp": 10.0,
            "mrp_counted": 10.0,
            "status": "rejected",
            "approval_status": "REJECTED",
            "assigned_to": "staff1",
            "recount_requested_at": now,
            "recount_requested_by": "supervisor",
            "rejected_at": now,
            "rejected_by": "supervisor",
            "counted_by": "staff1",
            "counted_at": now,
        }
    )
    recount_id = await test_db.recount_requests.insert_one(
        {
            "session_id": session_id,
            "count_line_id": "recount-line-1",
            "item_name": "Recount Governed Item",
            "item_code": "ITEMRECOUNT1",
            "barcode": "531003",
            "reason": "Need recount",
            "created_by": "supervisor",
            "status": "assigned",
            "assigned_to": "staff1",
            "created_at": now,
            "updated_at": now,
        }
    )

    headers = _make_auth_headers("staff1", "staff")
    resp = await async_client.post(
        f"/api/recount/{recount_id.inserted_id}/complete",
        json={"result_qty": 1.0, "notes": "Resolved on recount"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    updated = await test_db.count_lines.find_one({"id": "recount-line-1"})
    assert updated is not None
    assert updated["counted_qty"] == 1.0
    assert updated["variance"] == 0.0
    assert updated["approval_status"] == "APPROVED"
    assert updated["status"] == "approved"
    assert updated["assigned_to"] is None
    assert updated["rejected_at"] is None
    assert updated["rejected_by"] is None
    assert updated["recount_requested_at"] is None
    assert updated["recount_requested_by"] is None
