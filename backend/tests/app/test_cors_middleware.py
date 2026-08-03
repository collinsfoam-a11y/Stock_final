from backend.app.middleware import register_middleware
from fastapi import FastAPI
from fastapi.testclient import TestClient


class _Settings:
    ENVIRONMENT = "development"
    ALLOWED_HOSTS = ""
    CORS_ALLOW_ORIGINS = "http://127.0.0.1:8082"
    CORS_DEV_ORIGINS = ""
    ENABLE_LAN_ENFORCEMENT = False


class _Logger:
    def info(self, *_args, **_kwargs):
        return None

    def warning(self, *_args, **_kwargs):
        return None


def test_session_create_preflight_allows_idempotency_header():
    app = FastAPI()

    @app.post("/api/sessions")
    async def create_session():
        return {"ok": True}

    register_middleware(app, settings=_Settings(), logger=_Logger())
    client = TestClient(app)

    response = client.options(
        "/api/sessions",
        headers={
            "Origin": "http://127.0.0.1:8082",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": ("authorization,content-type,x-idempotency-key"),
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:8082"
    assert "x-idempotency-key" in response.headers["access-control-allow-headers"].lower()
