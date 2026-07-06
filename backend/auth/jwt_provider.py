from datetime import datetime, timezone
from typing import Any, Optional

import jwt as pyjwt

UTC = timezone.utc

class ExpiredSignatureError(Exception):
    pass

class InvalidTokenError(Exception):
    pass

def encode(payload: dict[str, Any], key: str, algorithm: str = "HS256") -> str:
    return pyjwt.encode(payload, key, algorithm=algorithm)

def decode(
    token: str,
    key: str,
    algorithms: Optional[list[str]] = None,
    *,
    issuer: Optional[str] = None,
    audience: Optional[str] = None,
) -> dict[str, Any]:
    SUPPORTED_ALGORITHMS = ["HS256", "HS384", "HS512"]
    if algorithms:
        invalid_algs = [alg for alg in algorithms if alg not in SUPPORTED_ALGORITHMS]
        if invalid_algs:
            raise InvalidTokenError(f"Unsupported algorithm(s): {invalid_algs}")
    allowed_algs = algorithms or SUPPORTED_ALGORITHMS

    try:
        options = {}
        if audience is None:
            options["verify_aud"] = False

        claims = pyjwt.decode(
            token,
            key,
            algorithms=allowed_algs,
            issuer=issuer,
            audience=audience,
            options=options,
        )
        return claims
    except pyjwt.ExpiredSignatureError as exc:
        raise ExpiredSignatureError(str(exc))
    except pyjwt.InvalidTokenError as exc:
        raise InvalidTokenError(str(exc))
    except Exception as exc:
        raise InvalidTokenError(str(exc))

class _JWTCompat:
    encode = staticmethod(encode)
    decode = staticmethod(decode)
    ExpiredSignatureError = ExpiredSignatureError
    InvalidTokenError = InvalidTokenError

jwt = _JWTCompat()
