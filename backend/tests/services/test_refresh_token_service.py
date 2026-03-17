from unittest.mock import MagicMock

from backend.auth.jwt_provider import jwt
from backend.services.refresh_token import RefreshTokenService


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
