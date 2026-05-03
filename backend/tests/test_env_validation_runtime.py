from __future__ import annotations

import pytest

from backend.utils.env_validation import validate_environment


def _set_base_env(monkeypatch, *, environment: str = "production") -> None:
    monkeypatch.setenv("ENVIRONMENT", environment)
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017/test")
    monkeypatch.setenv("DB_NAME", "stock_verification_test")
    monkeypatch.setenv(
        "JWT_SECRET",
        "test-jwt-secret-key-for-validation-1234567890",
    )
    monkeypatch.setenv(
        "JWT_REFRESH_SECRET",
        "test-jwt-refresh-secret-key-for-validation-0987654321",
    )
    monkeypatch.setenv(
        "PIN_SALT",
        "test-pin-salt-for-validation-1234567890",
    )


def test_validate_environment_requires_explicit_cors_in_production(monkeypatch):
    _set_base_env(monkeypatch, environment="production")
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.setenv("SKIP_RUNTIME_DB_VALIDATION", "true")

    with pytest.raises(ValueError, match="CORS_ALLOW_ORIGINS is required"):
        validate_environment()


def test_validate_environment_rejects_cors_wildcard_in_production(monkeypatch):
    _set_base_env(monkeypatch, environment="production")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "*")
    monkeypatch.setenv("SKIP_RUNTIME_DB_VALIDATION", "true")

    with pytest.raises(ValueError, match="cannot include '\\*'"):
        validate_environment()


def test_validate_environment_checks_mongo_replica_set(monkeypatch):
    _set_base_env(monkeypatch, environment="staging")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://app.example.com")
    monkeypatch.delenv("SKIP_RUNTIME_DB_VALIDATION", raising=False)
    monkeypatch.delenv("TESTING", raising=False)

    class _FailingMongoClient:
        def __init__(self, *_args, **_kwargs):
            raise RuntimeError("replica set not initialized")

    import pymongo

    monkeypatch.setattr(pymongo, "MongoClient", _FailingMongoClient)

    with pytest.raises(
        ValueError, match="MongoDB runtime validation failed \\(connection/replica set\\)"
    ):
        validate_environment()


def test_validate_environment_passes_with_replica_set_and_cors(monkeypatch):
    _set_base_env(monkeypatch, environment="production")
    monkeypatch.setenv(
        "CORS_ALLOW_ORIGINS",
        "https://app.example.com,https://ops.example.com",
    )
    monkeypatch.delenv("SKIP_RUNTIME_DB_VALIDATION", raising=False)
    monkeypatch.delenv("TESTING", raising=False)

    class _FakeAdmin:
        def command(self, name):
            if name == "ping":
                return {"ok": 1.0}
            if name == "replSetGetStatus":
                return {"ok": 1.0, "set": "rs0"}
            raise RuntimeError(f"unexpected command: {name}")

    class _FakeMongoClient:
        def __init__(self, *_args, **_kwargs):
            self.admin = _FakeAdmin()

        def close(self):
            return None

    import pymongo

    monkeypatch.setattr(pymongo, "MongoClient", _FakeMongoClient)

    validate_environment()
