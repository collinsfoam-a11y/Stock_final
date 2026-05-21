from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from backend.auth.jwt_provider import jwt
from backend.services.refresh_token import RefreshTokenService
from backend.tests.utils.in_memory_db import InMemoryDatabase


def test_create_refresh_token_uses_unique_jti_for_same_payload():
    service = RefreshTokenService(
        db=MagicMock(),
        secret_key="test-secret",
        algorithm="HS256",
    )

    first_token = service.create_refresh_token({"sub": "admin1", "role": "admin"})
    second_token = service.create_refresh_token({"sub": "admin1", "role": "admin"})

    assert first_token != second_token

    first_payload = jwt.decode(first_token, "test-secret", algorithms=["HS256"])
    second_payload = jwt.decode(second_token, "test-secret", algorithms=["HS256"])

    assert first_payload["type"] == "refresh"
    assert second_payload["type"] == "refresh"
    assert first_payload["sub"] == "admin1"
    assert second_payload["sub"] == "admin1"
    assert first_payload["jti"] != second_payload["jti"]


@pytest.mark.asyncio
async def test_cleanup_expired_tokens_handles_mixed_timezone_datetimes():
    db = InMemoryDatabase()
    service = RefreshTokenService(
        db=db,
        secret_key="test-secret",
        algorithm="HS256",
    )
    now = datetime.now(timezone.utc)

    await db.refresh_tokens.insert_many(
        [
            {
                "token_hash": "expired-aware",
                "username": "staff1",
                "expires_at": now - timedelta(days=1),
                "revoked": False,
            },
            {
                "token_hash": "revoked-after-grace",
                "username": "staff1",
                "expires_at": now + timedelta(days=1),
                "revoked": True,
                "grace_until": now - timedelta(seconds=1),
            },
            {
                "token_hash": "active-aware",
                "username": "staff1",
                "expires_at": now + timedelta(days=1),
                "revoked": False,
            },
        ]
    )

    await service._cleanup_expired_tokens()

    assert await db.refresh_tokens.find_one({"token_hash": "expired-aware"}) is None
    assert await db.refresh_tokens.find_one({"token_hash": "revoked-after-grace"}) is None
    assert await db.refresh_tokens.find_one({"token_hash": "active-aware"}) is not None
