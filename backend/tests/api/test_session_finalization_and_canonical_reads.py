from datetime import datetime, timezone

import pytest


def _make_auth_headers(username: str, role: str) -> dict[str, str]:
    from backend.auth.jwt_provider import encode

    token = encode(
        {"sub": username, "role": role},
        "test-jwt-secret-key-for-testing-only",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


async def _create_user(test_db, username: str, role: str, *, full_name: str) -> None:
    await test_db.users.delete_many({"username": username})
    await test_db.users.insert_one(
        {
            "username": username,
            "role": role,
            "full_name": full_name,
            "is_active": True,
        }
    )


@pytest.mark.asyncio
async def test_get_session_detail_uses_canonical_sessions_and_count_lines(async_client, test_db):
    session_id = "sess-canonical-detail"
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": started_at,
            "last_heartbeat": started_at,
            "total_variance": 2.0,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "line-1",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "counted_qty": 5.0,
            "variance": 2.0,
            "status": "locked",
            "verified": True,
            "counted_by": "staff1",
            "counted_at": started_at,
        }
    )

    response = await async_client.get(
        f"/api/sessions/{session_id}",
        headers=_make_auth_headers("staff1", "staff"),
    )
    assert response.status_code == 200

    data = response.json()
    assert data["id"] == session_id
    assert data["warehouse"] == "Main Warehouse"
    assert data["staff_name"] == "Staff Member"
    assert data["item_count"] == 1
    assert data["verified_count"] == 1
    assert data["total_items"] == 1
    assert data["total_variance"] == 2.0


@pytest.mark.asyncio
async def test_get_session_detail_counts_legacy_zero_variance_pending_as_verified(
    async_client, test_db
):
    session_id = "sess-canonical-legacy-zero"
    started_at = datetime.now(timezone.utc).replace(tzinfo=None)

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "OPEN",
            "type": "STANDARD",
            "started_at": started_at,
            "last_heartbeat": started_at,
            "total_variance": 0.0,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "line-legacy-zero",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "counted_qty": 5.0,
            "variance": 0.0,
            "status": "pending",
            "approval_status": "PENDING",
            "verified": False,
            "counted_by": "staff1",
            "counted_at": started_at,
        }
    )

    response = await async_client.get(
        f"/api/sessions/{session_id}",
        headers=_make_auth_headers("staff1", "staff"),
    )
    assert response.status_code == 200

    data = response.json()
    assert data["verified_count"] == 1


@pytest.mark.asyncio
async def test_finalize_session_locks_canonical_count_lines(async_client, test_db):
    session_id = "sess-finalize-ok"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await _create_user(test_db, "staff1", "staff", full_name="Staff Member")
    await _create_user(test_db, "supervisor1", "supervisor", full_name="Supervisor User")

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
            "reconciled_at": now,
            "total_variance": 1.0,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "line-finalize-1",
            "session_id": session_id,
            "item_code": "ITEM-1",
            "item_name": "Item 1",
            "counted_qty": 5.0,
            "variance": 1.0,
            "status": "pending",
            "approval_status": "PENDING",
            "verified": False,
            "counted_by": "staff1",
            "counted_at": now,
        }
    )

    response = await async_client.post(
        f"/api/sessions/{session_id}/finalize",
        json={"note": "Supervisor signoff"},
        headers=_make_auth_headers("supervisor1", "supervisor"),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "COMPLETED"

    session = await test_db.sessions.find_one({"id": session_id})
    assert session is not None
    assert session["status"] == "COMPLETED"
    assert session["finalization_status"] == "FINALIZED"
    assert session["finalized_by"] == "supervisor1"
    assert session["finalized_at"] is not None

    line = await test_db.count_lines.find_one({"id": "line-finalize-1"})
    assert line is not None
    assert line["status"] == "locked"
    assert line["approval_status"] == "APPROVED"
    assert line["verified"] is True
    assert line["finalized_by"] == "supervisor1"
    assert line["finalized_at"] is not None


@pytest.mark.asyncio
async def test_finalize_session_rejects_unresolved_lines(async_client, test_db):
    session_id = "sess-finalize-blocked"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await _create_user(test_db, "staff1", "staff", full_name="Staff Member")
    await _create_user(test_db, "supervisor1", "supervisor", full_name="Supervisor User")

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "ACTIVE",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
            "reconciled_at": now,
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "line-blocked",
            "session_id": session_id,
            "item_code": "ITEM-2",
            "item_name": "Item 2",
            "counted_qty": 3.0,
            "variance": 1.0,
            "status": "pending",
            "approval_status": "NEEDS_REVIEW",
            "verified": False,
            "counted_by": "staff1",
            "counted_at": now,
        }
    )

    response = await async_client.post(
        f"/api/sessions/{session_id}/finalize",
        headers=_make_auth_headers("supervisor1", "supervisor"),
    )
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["blocking_count"] == 1


@pytest.mark.asyncio
async def test_finalized_count_lines_are_immutable(async_client, test_db):
    session_id = "sess-immutable"
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    await _create_user(test_db, "staff1", "staff", full_name="Staff Member")
    await _create_user(test_db, "supervisor1", "supervisor", full_name="Supervisor User")

    await test_db.sessions.insert_one(
        {
            "id": session_id,
            "session_id": session_id,
            "warehouse": "Main Warehouse",
            "staff_user": "staff1",
            "staff_name": "Staff Member",
            "status": "COMPLETED",
            "type": "STANDARD",
            "started_at": now,
            "last_heartbeat": now,
            "completed_at": now,
            "closed_at": now,
            "finalized_at": now,
            "finalized_by": "supervisor1",
            "finalization_status": "FINALIZED",
        }
    )
    await test_db.count_lines.insert_one(
        {
            "id": "line-immutable",
            "session_id": session_id,
            "item_code": "ITEM-3",
            "item_name": "Item 3",
            "counted_qty": 4.0,
            "variance": 0.0,
            "status": "locked",
            "approval_status": "APPROVED",
            "verified": True,
            "counted_by": "staff1",
            "counted_at": now,
            "finalized_at": now,
        }
    )

    response = await async_client.patch(
        "/api/count-lines/line-immutable/add-quantity",
        json={"additional_qty": 1},
        headers=_make_auth_headers("staff1", "staff"),
    )
    assert response.status_code == 409
