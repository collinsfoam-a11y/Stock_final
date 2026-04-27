from __future__ import annotations

from datetime import datetime, timezone

import pytest
from backend.auth.jwt_provider import encode
from backend.services.feature_flags import BL_V2_COMPARE, BL_V2_GLOBAL_DISABLE, FeatureState


def _auth_headers(username: str, role: str) -> dict[str, str]:
    token = encode(
        {"sub": username, "role": role},
        "test-jwt-secret-key-for-testing-only",
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


async def _insert_flag(
    test_db,
    key: str,
    *,
    state: FeatureState = FeatureState.DISABLED,
    scope_overrides: dict[str, dict[str, bool]] | None = None,
) -> None:
    await test_db["feature_flags"].insert_one(
        {
            "key": key,
            "name": key,
            "state": state.value,
            "enabled": state == FeatureState.ENABLED,
            "scope_overrides": scope_overrides or {},
            "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
        }
    )


def _session_doc(session_id: str, **overrides):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    document = {
        "id": session_id,
        "session_id": session_id,
        "warehouse": "WH-1",
        "staff_user": "staff1",
        "staff_name": "Staff Member",
        "status": "OPEN",
        "type": "STANDARD",
        "started_at": now,
        "last_heartbeat": now,
    }
    document.update(overrides)
    return document


def _count_line_doc(line_id: str, session_id: str, **overrides):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    document = {
        "id": line_id,
        "session_id": session_id,
        "item_code": "ITEM-1",
        "item_name": "Item 1",
        "counted_qty": 2.0,
        "erp_qty": 2.0,
        "variance": 0.0,
        "mrp_erp": 100.0,
        "mrp_counted": 100.0,
        "financial_impact": 0.0,
        "status": "pending",
        "approval_status": "PENDING",
        "counted_by": "staff1",
        "created_by": "staff1",
        "counted_at": now,
        "updated_at": now,
    }
    document.update(overrides)
    return document


@pytest.mark.asyncio
async def test_session_create_pins_new_sessions(async_client, authenticated_headers, test_db):
    response = await async_client.post(
        "/api/sessions/",
        json={"warehouse": "WH-1", "type": "STANDARD"},
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["logic_version"] == "v1"
    assert body["logic_scope_source"] == "global"

    stored = await test_db.sessions.find_one({"id": body["id"]})
    assert stored["logic_version"] == "v1"
    assert stored["logic_scope_source"] == "global"


@pytest.mark.asyncio
async def test_legacy_session_is_pinned_on_first_count_line_mutation(
    async_client, authenticated_headers, test_db
):
    await test_db.sessions.insert_one(_session_doc("sess-legacy-count"))
    await test_db.count_lines.insert_one(_count_line_doc("line-legacy-count", "sess-legacy-count"))

    response = await async_client.patch(
        "/api/count-lines/line-legacy-count/add-quantity",
        json={"additional_qty": 1},
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    session = await test_db.sessions.find_one({"id": "sess-legacy-count"})
    assert session["logic_version"] == "v1"
    assert session["logic_scope_source"] == "global"


@pytest.mark.asyncio
async def test_pinning_is_idempotent_when_flags_change(
    async_client, authenticated_headers, test_db
):
    await _insert_flag(
        test_db,
        BL_V2_COMPARE,
        state=FeatureState.DISABLED,
        scope_overrides={"warehouse": {"WH-1": True}},
    )
    await test_db.sessions.insert_one(
        _session_doc("sess-pinned", logic_version="v1", logic_scope_source="global")
    )
    await test_db.count_lines.insert_one(_count_line_doc("line-pinned", "sess-pinned"))

    response = await async_client.patch(
        "/api/count-lines/line-pinned/add-quantity",
        json={"additional_qty": 1},
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    session = await test_db.sessions.find_one({"id": "sess-pinned"})
    assert session["logic_version"] == "v1"
    assert session["logic_scope_source"] == "global"


@pytest.mark.asyncio
async def test_invalid_partial_pin_is_rejected(async_client, authenticated_headers, test_db):
    await test_db.sessions.insert_one(_session_doc("sess-invalid-pin", logic_version="v1"))
    await test_db.count_lines.insert_one(_count_line_doc("line-invalid-pin", "sess-invalid-pin"))

    response = await async_client.patch(
        "/api/count-lines/line-invalid-pin/add-quantity",
        json={"additional_qty": 1},
        headers=authenticated_headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "missing pin on subsequent write"


@pytest.mark.asyncio
async def test_kill_switch_forces_runtime_v1_without_rewriting_stored_pin(
    async_client, authenticated_headers, test_db
):
    await _insert_flag(test_db, BL_V2_GLOBAL_DISABLE, state=FeatureState.ENABLED)
    await test_db.sessions.insert_one(
        _session_doc("sess-kill", logic_version="v2", logic_scope_source="user_id")
    )
    await test_db.count_lines.insert_one(_count_line_doc("line-kill", "sess-kill"))

    response = await async_client.patch(
        "/api/count-lines/line-kill/add-quantity",
        json={"additional_qty": 1},
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    session = await test_db.sessions.find_one({"id": "sess-kill"})
    assert session["logic_version"] == "v2"
    assert session["logic_scope_source"] == "user_id"


@pytest.mark.asyncio
async def test_recount_request_pins_legacy_session(async_client, test_db):
    await test_db.sessions.insert_one(_session_doc("sess-recount"))
    await test_db.count_lines.insert_one(
        _count_line_doc(
            "line-recount",
            "sess-recount",
            status="rejected",
            approval_status="REJECTED",
        )
    )

    response = await async_client.post(
        "/api/recount/request",
        json={
            "count_line_id": "line-recount",
            "reason": "Need recount",
            "priority": "medium",
        },
        headers=_auth_headers("supervisor", "supervisor"),
    )

    assert response.status_code == 200
    session = await test_db.sessions.find_one({"id": "sess-recount"})
    assert session["logic_version"] == "v1"
    assert session["logic_scope_source"] == "global"


@pytest.mark.asyncio
async def test_legacy_sync_count_line_pins_existing_session(
    async_client, authenticated_headers, test_db
):
    await test_db.sessions.insert_one(_session_doc("sess-sync"))

    response = await async_client.post(
        "/api/sync/batch",
        json={
            "operations": [
                {
                    "id": "op-count",
                    "type": "count_line",
                    "timestamp": "2026-04-27T10:00:00Z",
                    "data": {
                        "_id": "offline-line-1",
                        "id": "offline-line-1",
                        "session_id": "sess-sync",
                        "item_code": "ITEM-1",
                        "counted_qty": 4,
                    },
                }
            ]
        },
        headers=authenticated_headers,
    )

    assert response.status_code == 200
    session = await test_db.sessions.find_one({"id": "sess-sync"})
    assert session["logic_version"] == "v1"
    assert session["logic_scope_source"] == "global"
