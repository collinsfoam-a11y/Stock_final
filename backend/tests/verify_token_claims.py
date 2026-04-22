import secrets
from datetime import datetime, timezone

from backend.auth.jwt_provider import jwt
from backend.utils.auth_utils import create_access_token


def test_access_token_claims():
    # Test data
    data = {"sub": "testuser", "role": "staff"}
    secret_key = secrets.token_urlsafe(32)
    algorithm = "HS256"

    # Generate token
    token = create_access_token(data=data, secret_key=secret_key, algorithm=algorithm)

    # Decode token with verification to inspect payload
    payload = jwt.decode(token, secret_key, algorithms=[algorithm])

    # Verify claims
    assert payload["sub"] == "testuser"
    assert payload["role"] == "staff"
    assert payload["type"] == "access"
    assert "exp" in payload

    # Verify expiration is in the future
    exp = payload["exp"]
    exp_timestamp = exp.timestamp() if hasattr(exp, "timestamp") else float(exp)
    assert exp_timestamp > datetime.now(timezone.utc).replace(tzinfo=None).timestamp()


if __name__ == "__main__":
    test_access_token_claims()
    print("Test passed!")
