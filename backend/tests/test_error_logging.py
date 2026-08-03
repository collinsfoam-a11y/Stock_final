"""
Tests for error logging feature
"""

from datetime import datetime

import pytest

from backend.services.error_log import ErrorLogService


@pytest.mark.asyncio
async def test_error_log_service_writes_document(test_db):
    service = ErrorLogService(test_db)  # type: ignore[arg-type]

    error_id = await service.log_error(
        ValueError("boom"),
        error_type="ValueError",
        endpoint="/api/test",
        method="GET",
        user="tester",
        role="staff",
        ip_address="127.0.0.1",
        user_agent="pytest",
        request_data={"x": "1"},
        context={"feature": "error-log"},
    )

    assert error_id

    doc = await test_db.error_logs.find_one({"_id": error_id})
    assert doc is not None
    assert doc["error_type"] == "ValueError"
    assert doc["error_message"] == "boom"
    assert doc["endpoint"] == "/api/test"
    assert doc["method"] == "GET"
    assert doc["user"] == "tester"
    assert doc["role"] == "staff"
    assert doc["resolved"] is False
    assert isinstance(doc["timestamp"], datetime)


@pytest.mark.asyncio
async def test_log_http_error_stores_severity_and_code(test_db):
    service = ErrorLogService(test_db)  # type: ignore[arg-type]

    error_id = await service.log_http_error(
        status_code=404,
        endpoint="/api/missing",
        method="GET",
        user="tester",
    )

    doc = await test_db.error_logs.find_one({"_id": error_id})
    assert doc is not None
    assert doc["error_type"] == "HTTP_ERROR"
    assert doc["severity"] == "warning"
    assert doc["error_code"] == "HTTP_404"
    assert doc["endpoint"] == "/api/missing"


@pytest.mark.asyncio
async def test_get_errors_filters_by_severity(test_db):
    service = ErrorLogService(test_db)  # type: ignore[arg-type]

    await service.log_http_error(
        status_code=404,
        endpoint="/api/missing",
        method="GET",
    )
    await service.log_http_error(
        status_code=500,
        endpoint="/api/fail",
        method="POST",
    )

    errors = await service.get_recent_errors(severity="error", days_back=7)
    assert len(errors) == 1
    assert errors[0]["error_type"] == "HTTP_ERROR"
