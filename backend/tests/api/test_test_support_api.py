import pytest
from fastapi import status
from httpx import AsyncClient

from backend.api.test_support_api import (
    TEST_SUPPORT_HEADER,
    TEST_SUPPORT_HEADER_VALUE,
)
from backend.auth.dependencies import get_current_user
from backend.server import app


def _admin_user() -> dict:
    return {
        "_id": "admin-id",
        "username": "admin",
        "role": "admin",
        "full_name": "Administrator",
        "is_active": True,
        "permissions": [],
    }


def _staff_user() -> dict:
    return {
        "_id": "staff-id",
        "username": "staff1",
        "role": "staff",
        "full_name": "Staff Member",
        "is_active": True,
        "permissions": [],
    }


def _support_headers() -> dict[str, str]:
    return {TEST_SUPPORT_HEADER: TEST_SUPPORT_HEADER_VALUE}


TEST_RUN_ID = "testrun_business_e2e_001"


@pytest.mark.asyncio
async def test_test_support_requires_admin(async_client: AsyncClient):
    app.dependency_overrides[get_current_user] = lambda: _staff_user()

    response = await async_client.post(
        "/api/test-support/erp-items",
        headers=_support_headers(),
        json={
            "item_code": "E2E_DENIED_CASE",
            "barcode": "510001",
            "item_name": "Denied Fixture",
            "stock_qty": 5,
            "test_run_id": TEST_RUN_ID,
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Admin access required"


@pytest.mark.asyncio
async def test_test_support_requires_header(async_client: AsyncClient):
    app.dependency_overrides[get_current_user] = lambda: _admin_user()

    response = await async_client.post(
        "/api/test-support/erp-items",
        json={
            "item_code": "E2E_MISSING_HEADER",
            "barcode": "510002",
            "item_name": "Missing Header Fixture",
            "stock_qty": 5,
            "test_run_id": TEST_RUN_ID,
        },
    )

    assert response.status_code == status.HTTP_403_FORBIDDEN
    assert response.json()["detail"] == "Missing test-support header"


@pytest.mark.asyncio
async def test_test_support_upserts_variance_and_cleans_up(async_client: AsyncClient):
    app.dependency_overrides[get_current_user] = lambda: _admin_user()

    item_code = "E2E_FIXTURE_VARIANCE"
    session_id = "fixture-session-1"

    create_response = await async_client.post(
        "/api/test-support/erp-items",
        headers=_support_headers(),
        json={
            "item_code": item_code,
            "barcode": "510003",
            "item_name": "Fixture Variance Item",
            "stock_qty": 10,
            "warehouse": "e2e-main",
            "floor": "E2E-F1",
            "rack": "E2E-R1",
            "test_run_id": TEST_RUN_ID,
        },
    )
    assert create_response.status_code == status.HTTP_200_OK
    created_payload = create_response.json()
    assert created_payload["item"]["item_code"] == item_code
    assert created_payload["item"]["stock_qty"] == 10.0

    patch_response = await async_client.patch(
        f"/api/test-support/erp-items/{item_code}",
        headers=_support_headers(),
        json={"stock_qty": 14, "mrp": 9.5, "test_run_id": TEST_RUN_ID},
    )
    assert patch_response.status_code == status.HTTP_200_OK
    patched_payload = patch_response.json()
    assert patched_payload["item"]["stock_qty"] == 14.0
    assert patched_payload["item"]["mrp"] == 9.5

    variance_response = await async_client.post(
        "/api/test-support/item-variances",
        headers=_support_headers(),
        json={
            "item_code": item_code,
            "item_name": "Fixture Variance Item",
            "system_qty": 14,
            "verified_qty": 11,
            "warehouse": "e2e-main",
            "floor": "E2E-F1",
            "rack": "E2E-R1",
            "session_id": session_id,
            "count_line_id": "fixture-count-line-1",
            "test_run_id": TEST_RUN_ID,
        },
    )
    assert variance_response.status_code == status.HTTP_200_OK
    variance_payload = variance_response.json()
    assert variance_payload["variance"]["variance"] == -3.0
    assert variance_payload["variance"]["session_id"] == session_id

    cleanup_response = await async_client.post(
        "/api/test-support/cleanup",
        headers=_support_headers(),
        json={
            "item_codes": [item_code],
            "session_ids": [session_id],
            "count_line_ids": ["fixture-count-line-1"],
            "test_run_id": TEST_RUN_ID,
        },
    )
    assert cleanup_response.status_code == status.HTTP_200_OK
    cleanup_payload = cleanup_response.json()
    assert cleanup_payload["deleted"]["erp_items"] == 1
    assert cleanup_payload["deleted"]["item_variances"] == 1
    assert cleanup_payload["deleted"]["verification_logs"] == 1


@pytest.mark.asyncio
async def test_test_support_inspect_reports_scoped_backend_state(async_client: AsyncClient):
    app.dependency_overrides[get_current_user] = lambda: _admin_user()

    item_code = "E2E_FIXTURE_INSPECT"
    session_id = "fixture-session-inspect"

    create_response = await async_client.post(
        "/api/test-support/erp-items",
        headers=_support_headers(),
        json={
            "item_code": item_code,
            "barcode": "510004",
            "item_name": "Fixture Inspect Item",
            "stock_qty": 9,
            "warehouse": "e2e-main",
            "floor": "E2E-F1",
            "rack": "E2E-R1",
            "test_run_id": TEST_RUN_ID,
        },
    )
    assert create_response.status_code == status.HTTP_200_OK

    inspect_response = await async_client.post(
        "/api/test-support/inspect",
        headers=_support_headers(),
        json={
            "item_codes": [item_code],
            "session_ids": [session_id],
            "test_run_id": TEST_RUN_ID,
        },
    )
    assert inspect_response.status_code == status.HTTP_200_OK
    inspect_payload = inspect_response.json()
    assert inspect_payload["test_run_id"] == TEST_RUN_ID
    assert inspect_payload["state"]["primary_erp_item"]["item_code"] == item_code
