from unittest.mock import patch

import pytest
from httpx import AsyncClient

from backend.exceptions import (
    ERPInvalidResponseError,
    ERPItemNotFoundError,
    ERPRefreshInProgressError,
    SQLConnectionTimeoutError,
    SQLUnavailableError,
)


@pytest.mark.asyncio
async def test_exception_handler_sanitized_404(async_client: AsyncClient, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch(
        "backend.services.item_refresh_service.item_refresh_service.refresh_single_item_by_identifier",
        side_effect=ERPItemNotFoundError("SECRET_CODE_123"),
    ):
        response = await async_client.post(
            "/api/v2/erp/items/SECRET_CODE_123/refresh", headers=headers
        )

        assert response.status_code == 404
        data = response.json()
        assert data["error"] == "ERP_ITEM_NOT_FOUND"
        assert data["message"] == "ERP Item not found: SECRET_CODE_123"
        # Ensure it does not leak raw exception str
        assert "Traceback" not in response.text


@pytest.mark.asyncio
async def test_exception_handler_sanitized_409(async_client: AsyncClient, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch(
        "backend.services.item_refresh_service.item_refresh_service.refresh_single_item_by_identifier",
        side_effect=ERPRefreshInProgressError(retry_after=3),
    ):
        response = await async_client.post("/api/v2/erp/items/BAR_LOCKED/refresh", headers=headers)

        assert response.status_code == 409
        assert response.headers.get("Retry-After") == "3"
        data = response.json()
        assert data["error"] == "ERP_REFRESH_IN_PROGRESS"
        assert data["detail"]["error_code"] == "ERP_REFRESH_IN_PROGRESS"


@pytest.mark.asyncio
async def test_exception_handler_sanitized_503(async_client: AsyncClient, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch(
        "backend.services.item_refresh_service.item_refresh_service.refresh_single_item_by_identifier",
        side_effect=SQLUnavailableError("SQL connection pool exhausted"),
    ):
        response = await async_client.post("/api/v2/erp/items/BAR_503/refresh", headers=headers)

        assert response.status_code == 503
        data = response.json()
        assert data["error"] == "SQL_SERVER_UNAVAILABLE"
        assert data["message"] == "SQL connection pool exhausted"


@pytest.mark.asyncio
async def test_exception_handler_sanitized_504(async_client: AsyncClient, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch(
        "backend.services.item_refresh_service.item_refresh_service.refresh_single_item_by_identifier",
        side_effect=SQLConnectionTimeoutError("Query timed out after 5.0s"),
    ):
        response = await async_client.post("/api/v2/erp/items/BAR_504/refresh", headers=headers)

        assert response.status_code == 504
        data = response.json()
        assert data["error"] == "SQL_SERVER_TIMEOUT"


@pytest.mark.asyncio
async def test_exception_handler_sanitized_502(async_client: AsyncClient, make_auth_headers):
    headers = make_auth_headers("staff1", "staff")

    with patch(
        "backend.services.item_refresh_service.item_refresh_service.refresh_single_item_by_identifier",
        side_effect=ERPInvalidResponseError("Invalid JSON from ERP"),
    ):
        response = await async_client.post("/api/v2/erp/items/BAR_502/refresh", headers=headers)

        assert response.status_code == 502
        data = response.json()
        assert data["error"] == "ERP_INVALID_RESPONSE"
