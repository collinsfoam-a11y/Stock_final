import pytest
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.requests import Request
from starlette.responses import JSONResponse

from backend.app.factory import (
    _generic_exception_handler,
    _http_exception_handler,
    _sanitize_detail,
    _validation_exception_handler,
)


@pytest.fixture
def mock_request():
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [],
    }
    return Request(scope)


# =============================
# HTTPException Handler Tests
# =============================

@pytest.mark.asyncio
async def test_http_exception_handler_400_dict(mock_request):
    """Verify 4xx HTTPException with dict detail passes through"""
    exc = HTTPException(
        400, detail={"code": "INVALID_PIN", "message": "Wrong PIN"}
    )
    response = await _http_exception_handler(mock_request, exc)
    
    assert response.status_code == 400
    assert response.body == b'{"detail":{"code":"INVALID_PIN","message":"Wrong PIN"}}'
    assert isinstance(response, JSONResponse)


@pytest.mark.asyncio
async def test_http_exception_handler_404_string(mock_request):
    """Verify 4xx HTTPException with string detail is sanitized"""
    exc = HTTPException(404, detail="Item not found")
    response = await _http_exception_handler(mock_request, exc)
    
    assert response.status_code == 404
    assert response.body == b'{"detail":"Resource not found. Please check the URL or contact support.","code":"RES_001","category":"resource"}'
    assert isinstance(response, JSONResponse)


@pytest.mark.asyncio
async def test_http_exception_handler_headers(mock_request):
    """Verify custom headers are propagated"""
    headers = {"Retry-After": "5"}
    exc = HTTPException(429, detail="Rate limit exceeded", headers=headers)
    response = await _http_exception_handler(mock_request, exc)
    
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "5"
    assert b"Too many requests" in response.body


@pytest.mark.asyncio
async def test_http_exception_handler_headers_none(mock_request):
    """Verify None headers don't break JSONResponse"""
    exc = HTTPException(401, detail="Unauthorized")
    exc.headers = None
    response = await _http_exception_handler(mock_request, exc)
    
    assert response.status_code == 401
    assert "detail" in response.body.decode()


# =============================
# Validation Exception Tests
# =============================

@pytest.mark.asyncio
async def test_validation_exception_handler_masking(mock_request):
    """Verify validation errors mask raw schema"""
    exc = RequestValidationError(
        errors=[{"loc": ["body", "pin"], "msg": "Field required"}]
    )
    response = await _validation_exception_handler(mock_request, exc)
    
    assert response.status_code == 422
    assert response.body == b'{"detail":"Invalid request. Please check your input and try again."}'
    assert "Field required" not in str(response.body)
    assert "pin" not in str(response.body)


# =============================
# Generic Exception Tests
# =============================

@pytest.mark.asyncio
async def test_generic_exception_handler_500(mock_request, caplog):
    """Verify 5xx errors return generic message without details"""
    exc = Exception("Database timeout")
    response = await _generic_exception_handler(mock_request, exc)
    
    assert response.status_code == 500
    assert response.body == b'{"detail":"An internal server error occurred. Please try again later or contact support.","code":"SRV_001","category":"server"}'
    assert "Database timeout" not in str(response.body)
    
    # Verify server-side logging
    assert any(
        "Unhandled exception" in record.getMessage()
        for record in caplog.records
    )


@pytest.mark.asyncio
async def test_generic_exception_handler_governance_fingerprint(mock_request):
    """Verify governance fingerprint doesn't leak in responses"""
    from backend.config.governance import GOVERNANCE_FINGERPRINT
    
    exc = Exception("Governance violation")
    response = await _generic_exception_handler(mock_request, exc)
    
    max_variance = str(GOVERNANCE_FINGERPRINT["max_variance"])
    max_latency_ms = str(GOVERNANCE_FINGERPRINT["max_latency_ms"])
    
    assert max_variance not in str(response.body)
    assert max_latency_ms not in str(response.body)


# =============================
# Utility Function Tests
# =============================

def test_sanitize_detail_dead_parameter():
    """Verify _sanitize_detail returns the mapped message for a status code"""
    result = _sanitize_detail(400, "test")
    assert result == "Invalid input. Please check your data and try again."

    result = _sanitize_detail(500, "test")
    assert result == "An internal server error occurred. Please try again later or contact support."
