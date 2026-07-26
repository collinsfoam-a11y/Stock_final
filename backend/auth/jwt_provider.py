from datetime import datetime, timezone
from typing import Any

from authlib.jose import JsonWebToken
from authlib.jose import jwt as _jwt
from authlib.jose.errors import ExpiredTokenError, JoseError

UTC = timezone.utc

# Clock-skew tolerance for time-based claim validation (exp/nbf). Devices on
# the LAN (tablets, Pi nodes) can drift by a few seconds; without leeway that
# drift surfaces as spurious "token expired" logouts.
CLOCK_SKEW_LEEWAY_SECONDS = 30.0


class ExpiredSignatureError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


def _ensure_timestamp(exp: Any) -> float | None:
    if exp is None:
        return None
    if isinstance(exp, (int, float)):
        return float(exp)
    if isinstance(exp, datetime):
        if exp.tzinfo is None:
            return exp.replace(tzinfo=UTC).timestamp()
        return exp.timestamp()
    try:
        return float(exp)
    except Exception:
        return None


def encode(payload: dict[str, Any], key: str, algorithm: str = "HS256") -> str:
    header = {"alg": algorithm}
    token = _jwt.encode(header, payload, key)
    if isinstance(token, bytes):
        return token.decode("utf-8")
    return str(token)


def _matches_audience(claim_audience: Any, expected_audience: str) -> bool:
    if isinstance(claim_audience, str):
        return claim_audience == expected_audience
    if isinstance(claim_audience, (list, tuple, set)):
        return expected_audience in claim_audience
    return False


def decode(
    token: str,
    key: str,
    algorithms: list[str] | None = None,
    *,
    issuer: str | None = None,
    audience: str | None = None,
) -> dict[str, Any]:
    SUPPORTED_ALGORITHMS = ["HS256", "HS384", "HS512"]
    if algorithms:
        invalid_algs = [alg for alg in algorithms if alg not in SUPPORTED_ALGORITHMS]
        if invalid_algs:
            raise InvalidTokenError(f"Unsupported algorithm(s): {invalid_algs}")
    try:
        # H9 fix: Pass algorithms to underlying library to enforce algorithm restriction
        allowed_algs = algorithms or SUPPORTED_ALGORITHMS
        decoder = JsonWebToken(allowed_algs)
        claims = decoder.decode(token, key)

        now = datetime.now(UTC).timestamp()

        # A time claim that is present but not parseable as a timestamp is
        # malformed and must be rejected. Treating it as "absent" would let a
        # crafted token silently bypass the exp/nbf checks. An absent claim
        # (key not in payload) is still allowed and simply skips its check.
        if "exp" in claims:
            exp_ts = _ensure_timestamp(claims.get("exp"))
            if exp_ts is None:
                raise InvalidTokenError("Malformed 'exp' claim")
            if now > exp_ts + CLOCK_SKEW_LEEWAY_SECONDS:
                raise ExpiredTokenError("token is expired")

        if "nbf" in claims:
            nbf_ts = _ensure_timestamp(claims.get("nbf"))
            if nbf_ts is None:
                raise InvalidTokenError("Malformed 'nbf' claim")
            if now < nbf_ts - CLOCK_SKEW_LEEWAY_SECONDS:
                raise InvalidTokenError("Token not yet valid (nbf)")

        if issuer is not None and claims.get("iss") != issuer:
            raise InvalidTokenError("Invalid issuer")

        if audience is not None and not _matches_audience(claims.get("aud"), audience):
            raise InvalidTokenError("Invalid audience")
        return dict(claims)
    except ExpiredTokenError as exc:
        raise ExpiredSignatureError(str(exc)) from exc
    except InvalidTokenError:
        raise
    except JoseError as exc:
        raise InvalidTokenError(str(exc)) from exc
    except Exception as exc:
        raise InvalidTokenError(str(exc)) from exc


class _JWTCompat:
    encode = staticmethod(encode)
    decode = staticmethod(decode)
    ExpiredSignatureError = ExpiredSignatureError
    InvalidTokenError = InvalidTokenError


jwt = _JWTCompat()
