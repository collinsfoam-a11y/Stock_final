import pytest

from backend.api import sync_management_api
from backend.utils.result import Fail, Ok


class _FakeChangeDetectionService:
    async def sync_now(self):
        return Ok({"items_updated": 4, "status": "success"})

    def get_stats(self):
        return {"running": False, "enabled": True}


@pytest.mark.asyncio
async def test_trigger_change_sync_runs_service_when_available():
    previous = sync_management_api._change_detection_service
    sync_management_api.set_change_detection_service(_FakeChangeDetectionService())
    try:
        response = await sync_management_api.trigger_change_sync(current_user={"role": "admin"})
    finally:
        sync_management_api.set_change_detection_service(previous)

    assert response["success"] is True
    assert response["data"]["items_updated"] == 4


@pytest.mark.asyncio
async def test_trigger_erp_sync_runs_service_when_available():
    class _FakeErpSyncService:
        async def sync_now(self):
            return {"items_synced": 9, "status": "success"}

    previous = sync_management_api._erp_sync_service
    sync_management_api.set_erp_sync_service(_FakeErpSyncService())
    try:
        response = await sync_management_api.trigger_erp_sync(current_user={"role": "admin"})
    finally:
        sync_management_api.set_erp_sync_service(previous)

    assert response["success"] is True
    assert response["data"]["items_synced"] == 9


@pytest.mark.asyncio
async def test_trigger_change_sync_returns_error_when_sync_fails():
    class _FailingChangeDetectionService:
        async def sync_now(self):
            return Fail(RuntimeError("SQL Server connection not established"))

    previous = sync_management_api._change_detection_service
    sync_management_api.set_change_detection_service(_FailingChangeDetectionService())
    try:
        response = await sync_management_api.trigger_change_sync(current_user={"role": "admin"})
    finally:
        sync_management_api.set_change_detection_service(previous)

    assert response["success"] is False
    assert "SQL Server connection not established" in response["error"]
