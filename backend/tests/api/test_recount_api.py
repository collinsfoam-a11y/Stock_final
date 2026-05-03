import pytest
from fastapi import HTTPException

from backend.api import recount_api


class _FakeLifecycle:
    async def create_recount_request(self, *, recount_doc, actor):
        doc = dict(recount_doc)
        doc["_id"] = "rec-1"
        doc["id"] = "rec-1"
        return doc


class _FakeNotifications:
    async def notify_recount_assigned(self, **_kwargs):
        return None


class _FakeRecountService:
    def __init__(self, count_line):
        self._count_line = count_line
        self.lifecycle = _FakeLifecycle()
        self.notifications = _FakeNotifications()

    async def get_count_line(self, _count_line_id):
        return dict(self._count_line)


@pytest.mark.asyncio
async def test_create_recount_request_accepts_rejected_approval_status() -> None:
    count_line = {
        "id": "line-1",
        "status": "pending_approval",
        "approval_status": "REJECTED",
        "item_name": "Item 1",
        "item_code": "IT-1",
        "barcode": "123456",
        "session_id": "sess-1",
        "erp_qty": 2,
        "counted_qty": 1,
        "variance": -1,
        "counted_by": "staff1",
        "recount_iteration": 0,
    }
    request = recount_api.RecountCreateRequest(
        count_line_id="line-1",
        reason="Mismatch",
    )

    response = await recount_api.create_recount_request(
        request=request,
        current_user={"username": "supervisor1"},
        recount_service=_FakeRecountService(count_line),
    )

    assert response.count_line_id == "line-1"
    assert response.status == "pending"
    assert response.item_code == "IT-1"


@pytest.mark.asyncio
async def test_create_recount_request_rejects_non_rejected_lines() -> None:
    count_line = {
        "id": "line-2",
        "status": "pending",
        "approval_status": "NEEDS_REVIEW",
        "item_name": "Item 2",
        "session_id": "sess-2",
    }
    request = recount_api.RecountCreateRequest(
        count_line_id="line-2",
        reason="Mismatch",
    )

    with pytest.raises(HTTPException) as exc:
        await recount_api.create_recount_request(
            request=request,
            current_user={"username": "supervisor1"},
            recount_service=_FakeRecountService(count_line),
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Can only create recount from rejected count line"


@pytest.mark.asyncio
async def test_recount_complete_endpoint_is_removed(
    async_client,
    authenticated_headers,
) -> None:
    registered_complete_routes = []
    from backend.app_factory import app

    for route in app.routes:
        if getattr(route, "path", "") == "/api/recount/{recount_id}/complete":
            registered_complete_routes.append(route)

    assert not registered_complete_routes

    response = await async_client.post(
        "/api/recount/recount-legacy/complete",
        json={"result_qty": 5, "notes": "legacy completion call"},
        headers=authenticated_headers,
    )
    assert response.status_code in {404, 405}
    assert response.json().get("detail") != "Endpoint removed"
