import secrets
from datetime import datetime, timezone

from backend.auth.jwt_provider import jwt
from backend.utils.auth_utils import create_access_token


def test_access_token_claims():
    # Test data
    data = {"sub": "testuser", "role": "staff"}
    # Use a secure secret
    secret_key = secrets.token_urlsafe(32)
    algorithm = "HS256"

    # Generate token
    token = create_access_token(data=data, secret_key=secret_key, algorithm=algorithm)

    # Decode token with verification to inspect payload
    # This explicitly verifies the signature using the secret and algorithm
    payload = jwt.decode(token, secret_key, algorithms=[algorithm])

    # Verify claims
    assert payload["sub"] == "testuser"
    assert payload["role"] == "staff"
    assert payload["type"] == "access"
    assert "exp" in payload

    # Verify expiration is in the future
    exp = payload["exp"]
    # Handle both timestamp and datetime-like objects if necessary
    exp_timestamp = exp if isinstance(exp, (int, float)) else exp.timestamp()
    assert exp_timestamp > datetime.now(timezone.utc).timestamp()


if __name__ == "__main__":
    test_access_token_claims()
    print("Test passed!")
