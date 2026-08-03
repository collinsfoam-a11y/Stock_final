"""Tests for the global exception handlers registered in backend.app.factory.

These handlers sanitize error details to prevent information leakage.
The tests build a minimal FastAPI app and register only the handlers under test.
"""

from backend.app.factory import (
    _generic_exception_handler,
    _http_exception_handler,
    _validation_exception_handler,
)
from backend.error_messages import get_error_by_code
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import BaseModel

_LEAKY_TRACE = "Traceback (most recent call last): File /Users/secret/internal.py"
_LEAKY_SQL = "SQL Server Connection Timeout: internal host db.internal:1433"
_LEAKY_CONN = "internal connection string: mongodb://user:s3cret@db:27017"


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.get("/raise-http-5xx")
    async def raise_http_5xx():
        raise HTTPException(status_code=500, detail=_LEAKY_TRACE)

    @app.get("/raise-http-5xx-with-headers")
    async def raise_http_5xx_with_headers():
        raise HTTPException(
            status_code=503,
            detail=_LEAKY_SQL,
            headers={"Retry-After": "30"},
        )

    @app.get("/raise-http-4xx-dict")
    async def raise_http_4xx_dict():
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": {"code": "NOT_FOUND", "message": "Observation not found"},
            },
        )

    @app.get("/raise-http-4xx-string")
    async def raise_http_4xx_string():
        raise HTTPException(status_code=400, detail="Invalid queue type")

    @app.get("/raise-http-429-headers")
    async def raise_http_429_headers():
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": "5"},
        )

    class _StrictBody(BaseModel):
        name: str

    @app.post("/validation-error")
    async def validation_error(body: _StrictBody):
        return {"name": body.name}

    @app.get("/unhandled-runtime-error")
    async def unhandled_runtime_error():
        raise RuntimeError(_LEAKY_CONN)

    app.add_exception_handler(HTTPException, _http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, _generic_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)  # type: ignore[arg-type]
    return app


def test_5xx_http_exception_detail_is_sanitized():
    client = TestClient(_build_app())
    resp = client.get("/raise-http-5xx")
    assert resp.status_code == 500
    body = resp.json()
    error_info = get_error_by_code(500)
    assert body["detail"] == error_info["message"]
    assert "Traceback" not in resp.text
    assert "internal.py" not in resp.text
    assert "/Users/secret" not in resp.text


def test_5xx_http_exception_sanitizes_and_preserves_headers():
    client = TestClient(_build_app())
    resp = client.get("/raise-http-5xx-with-headers")
    assert resp.status_code == 503
    body = resp.json()
    error_info = get_error_by_code(503)
    assert body["detail"] == error_info["message"]
    assert "SQL Server" not in resp.text
    assert "db.internal" not in resp.text
    assert "Connection Timeout" not in resp.text
    assert resp.headers.get("retry-after") == "30"


def test_4xx_http_exception_with_dict_detail_passes_through_verbatim():
    client = TestClient(_build_app())
    resp = client.get("/raise-http-4xx-dict")
    assert resp.status_code == 404
    body = resp.json()
    assert body["detail"] == {
        "success": False,
        "error": {"code": "NOT_FOUND", "message": "Observation not found"},
    }


def test_4xx_http_exception_with_string_detail_is_sanitized():
    client = TestClient(_build_app())
    resp = client.get("/raise-http-4xx-string")
    assert resp.status_code == 400
    body = resp.json()
    assert body["detail"] == "Invalid input. Please check your data and try again."
    assert "Invalid queue type" not in resp.text


def test_4xx_http_exception_preserves_retry_after_header():
    client = TestClient(_build_app())
    resp = client.get("/raise-http-429-headers")
    assert resp.status_code == 429
    body = resp.json()
    assert body["detail"] == "Too many requests. Please wait a moment and try again."
    assert resp.headers.get("retry-after") == "5"


def test_request_validation_error_returns_generic_message_and_masks_errors():
    client = TestClient(_build_app())
    resp = client.post("/validation-error", json={})
    assert resp.status_code == 422
    body = resp.json()
    assert body["detail"] == (
        "Invalid request. Please check your input and try again."
    )
    assert "errors" not in body
    assert "missing" not in resp.text.lower()


def test_unhandled_exception_returns_generic_500_without_leaking_message():
    client = TestClient(_build_app(), raise_server_exceptions=False)
    resp = client.get("/unhandled-runtime-error")
    assert resp.status_code == 500
    body = resp.json()
    error_info = get_error_by_code(500)
    assert body["detail"] == error_info["message"]
    assert "s3cret" not in resp.text
    assert "mongodb://" not in resp.text
    assert "RuntimeError" not in resp.text
