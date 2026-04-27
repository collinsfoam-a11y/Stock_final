from unittest.mock import AsyncMock

import pytest

from backend.sql_server_connector import (
    DatabaseConnectionError,
    DatabaseQueryError,
    ERPQueryParameterError,
    ERPReadOnlyViolation,
)
from backend.tests.utils.in_memory_db import setup_server_with_in_memory_db


@pytest.mark.asyncio
@pytest.mark.governance
@pytest.mark.parametrize(
    ("raised_error", "expected_code", "expected_status"),
    [
        (DatabaseConnectionError("db down"), "SQL_CONNECTION_ERROR", 503),
        (ERPReadOnlyViolation("blocked"), "ERP_READ_ONLY_VIOLATION", 400),
        (ERPQueryParameterError("unsafe"), "ERP_QUERY_PARAMETER_ERROR", 400),
        (DatabaseQueryError("query failed"), "ERP_QUERY_ERROR", 500),
    ],
)
async def test_verify_item_quantity_fail_fast_error_mapping(
    monkeypatch,
    raised_error,
    expected_code,
    expected_status,
):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    from backend.services.sql_verification_service import sql_verification_service

    monkeypatch.setattr(
        sql_verification_service,
        "_get_sql_quantity",
        AsyncMock(side_effect=raised_error),
    )

    response = await sql_verification_service.verify_item_quantity("ITEM-FAIL-FAST")

    assert response["success"] is False
    assert response["error_code"] == expected_code
    assert response["status_code"] == expected_status


@pytest.mark.asyncio
@pytest.mark.governance
async def test_verify_item_quantity_connection_keyword_fallback_mapping(monkeypatch):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    from backend.services.sql_verification_service import sql_verification_service

    monkeypatch.setattr(
        sql_verification_service,
        "_get_sql_quantity",
        AsyncMock(side_effect=RuntimeError("sql server reconnect timeout")),
    )

    response = await sql_verification_service.verify_item_quantity("ITEM-CONNECTION-FALLBACK")

    assert response["success"] is False
    assert response["error_code"] == "SQL_CONNECTION_ERROR"
    assert response["status_code"] == 503


@pytest.mark.governance
def test_error_response_uses_catalog_defaults():
    from backend.services.sql_verification_service import sql_verification_service

    response = sql_verification_service._error_response(
        error_code="SQL_CONNECTION_ERROR",
        item_code="ITEM-CATALOG",
    )

    assert response["message"] == "ERP system is temporarily unavailable. Please try again later."
    assert response["status_code"] == 503
    assert response["box_status"] == "SQL_FAILURE"


@pytest.mark.asyncio
@pytest.mark.governance
async def test_get_verification_status_uses_custom_not_found_message(monkeypatch):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    from backend.services.sql_verification_service import sql_verification_service

    response = await sql_verification_service.get_verification_status("ITEM-NOT-THERE")

    assert response["success"] is False
    assert response["error_code"] == "ITEM_NOT_FOUND"
    assert response["message"] == "Item not found"
    assert response["status_code"] == 404


@pytest.mark.asyncio
@pytest.mark.governance
async def test_get_verification_status_uses_custom_internal_error_message(monkeypatch):
    db = setup_server_with_in_memory_db(monkeypatch)

    import backend.services.sql_verification_service as svs

    monkeypatch.setattr(svs, "db", db)

    original_find_one = db.erp_items.find_one

    async def boom(*args, **kwargs):
        raise RuntimeError("unexpected db failure")

    db.erp_items.find_one = boom

    from backend.services.sql_verification_service import sql_verification_service

    response = await sql_verification_service.get_verification_status("ITEM-STATUS-ERROR")

    assert response["success"] is False
    assert response["error_code"] == "VERIFICATION_INTERNAL_ERROR"
    assert response["message"] == "Failed to get verification status."
    assert response["status_code"] == 500

    db.erp_items.find_one = original_find_one
