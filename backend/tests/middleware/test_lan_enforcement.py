import pytest
from backend.middleware.lan_enforcement import (
    LANEnforcementMiddleware,
    resolve_lan_client_ip,
)
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.responses import JSONResponse

# Setup a dummy app for testing
app = FastAPI()
app.add_middleware(LANEnforcementMiddleware)


@app.get("/test")
async def test_route():
    return {"message": "success"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


client = TestClient(app)


# TestLANEnforcement class removed as it is redundant and problematic with TestClient
# The logic is fully covered by the async unit tests below (test_middleware_logic_*)


# Redefining to use unit testing of the dispatch method for precise control
@pytest.mark.asyncio
async def test_middleware_logic_allow_private():
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    # Mock Request
    scope = {
        "type": "http",
        "client": ("192.168.1.50", 12345),
        "path": "/test",
        "headers": [],
    }
    request = Request(scope)

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_middleware_logic_allow_loopback():
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    scope = {
        "type": "http",
        "client": ("127.0.0.1", 12345),
        "path": "/test",
        "headers": [],
    }
    request = Request(scope)

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_middleware_logic_block_public():
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    # 8.8.8.8 is a public IP
    scope = {
        "type": "http",
        "client": ("8.8.8.8", 12345),
        "path": "/test",
        "headers": [],
    }
    request = Request(scope)

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 403
    body = import_json_body(response)
    assert body["code"] == "NETWORK_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_middleware_allow_health_check_from_public():
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    # Public IP accessing health check
    scope = {
        "type": "http",
        "client": ("8.8.8.8", 12345),
        "path": "/health",
        "headers": [],
    }
    request = Request(scope)

    response = await middleware.dispatch(request, call_next)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_proxy_forwarded_public_client_is_blocked():
    """Behind a private-IP reverse proxy, a forwarded PUBLIC client is rejected.

    Regression: previously the middleware trusted request.client.host (the
    proxy's private IP) and allowed all proxied traffic, defeating LAN-only.
    """
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    scope = {
        "type": "http",
        "client": ("172.18.0.5", 12345),  # nginx on the docker network (private)
        "path": "/test",
        "headers": [(b"x-forwarded-for", b"8.8.8.8")],  # real client is public
    }
    response = await middleware.dispatch(Request(scope), call_next)
    assert response.status_code == 403
    assert import_json_body(response)["code"] == "NETWORK_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_proxy_forwarded_lan_client_is_allowed():
    """Behind a private-IP reverse proxy, a forwarded LAN client is allowed."""
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    scope = {
        "type": "http",
        "client": ("172.18.0.5", 12345),
        "path": "/test",
        "headers": [(b"x-forwarded-for", b"192.168.1.50, 172.18.0.5")],
    }
    response = await middleware.dispatch(Request(scope), call_next)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_direct_public_client_cannot_spoof_xff():
    """A directly-connecting PUBLIC client cannot bypass via a forged XFF.

    Because the direct peer is public, XFF is ignored and the public peer is
    evaluated (and rejected).
    """
    middleware = LANEnforcementMiddleware(app)

    async def call_next(request):
        return JSONResponse({"status": "ok"})

    scope = {
        "type": "http",
        "client": ("8.8.8.8", 12345),  # public direct peer
        "path": "/test",
        "headers": [(b"x-forwarded-for", b"192.168.1.50")],  # forged LAN claim
    }
    response = await middleware.dispatch(Request(scope), call_next)
    assert response.status_code == 403


def test_resolve_lan_client_ip_trusts_xff_only_from_private_peer():
    # Private peer (our proxy) -> trust left-most XFF entry.
    proxied = Request(
        {
            "type": "http",
            "client": ("10.0.0.2", 1),
            "path": "/test",
            "headers": [(b"x-forwarded-for", b"203.0.113.9, 10.0.0.2")],
        }
    )
    assert resolve_lan_client_ip(proxied) == "203.0.113.9"

    # Public peer -> ignore XFF, return the direct (public) address.
    # (8.8.8.8 is unambiguously public across Python versions; note that the
    # RFC 5737 doc ranges like 203.0.113.0/24 are classified private in 3.11+.)
    direct_public = Request(
        {
            "type": "http",
            "client": ("8.8.8.8", 1),
            "path": "/test",
            "headers": [(b"x-forwarded-for", b"192.168.0.1")],
        }
    )
    assert resolve_lan_client_ip(direct_public) == "8.8.8.8"

    # Private peer, no XFF -> direct LAN client.
    direct_lan = Request(
        {"type": "http", "client": ("192.168.1.10", 1), "path": "/test", "headers": []}
    )
    assert resolve_lan_client_ip(direct_lan) == "192.168.1.10"


def import_json_body(response):
    import json

    return json.loads(response.body.decode())
