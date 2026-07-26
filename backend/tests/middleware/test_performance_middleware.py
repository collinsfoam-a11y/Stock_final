from unittest.mock import AsyncMock

import pytest

from backend.middleware.performance_middleware import PerformanceMiddleware


@pytest.mark.asyncio
async def test_performance_middleware_awaits_request_tracking():
    monitoring = AsyncMock()

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"{}", "more_body": False})

    middleware = PerformanceMiddleware(app, monitoring)
    sent_messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent_messages.append(message)

    await middleware(
        {
            "type": "http",
            "path": "/api/test",
            "method": "GET",
            "headers": [(b"x-request-id", b"req-123")],
        },
        receive,
        send,
    )

    monitoring.track_request.assert_awaited_once()
    assert monitoring.track_request.await_args.kwargs["endpoint"] == "/api/test"
    assert monitoring.track_request.await_args.kwargs["method"] == "GET"
    assert sent_messages[0]["type"] == "http.response.start"


@pytest.mark.asyncio
async def test_performance_middleware_awaits_error_tracking():
    monitoring = AsyncMock()

    async def app(scope, receive, send):
        raise RuntimeError("boom")

    middleware = PerformanceMiddleware(app, monitoring)

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        return None

    with pytest.raises(RuntimeError, match="boom"):
        await middleware(
            {
                "type": "http",
                "path": "/api/test",
                "method": "GET",
                "headers": [],
            },
            receive,
            send,
        )

    monitoring.track_error.assert_awaited_once()
    assert monitoring.track_error.await_args.kwargs["endpoint"] == "/api/test"
