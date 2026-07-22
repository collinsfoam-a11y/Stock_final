"""Unit tests for the JWT provider's decode-time claim validation.

Focuses on the time-claim hardening: clock-skew leeway, not-before (`nbf`)
enforcement, and rejection of present-but-malformed `exp`/`nbf` claims (so a
crafted token cannot bypass a check by making the claim unparseable).
"""

import time

import pytest

from backend.auth.jwt_provider import (
    CLOCK_SKEW_LEEWAY_SECONDS,
    ExpiredSignatureError,
    InvalidTokenError,
    decode,
    encode,
)

KEY = "unit-test-signing-key"


def _tok(payload):
    return encode(payload, KEY)


def test_valid_token_without_time_claims_is_accepted():
    assert decode(_tok({"sub": "user-1"}), KEY)["sub"] == "user-1"


def test_valid_exp_and_nbf_are_accepted():
    now = int(time.time())
    claims = decode(_tok({"sub": "u", "exp": now + 60, "nbf": now - 5}), KEY)
    assert claims["sub"] == "u"


def test_expired_token_raises_expired():
    with pytest.raises(ExpiredSignatureError):
        decode(_tok({"sub": "u", "exp": int(time.time()) - 3600}), KEY)


def test_future_nbf_is_rejected():
    with pytest.raises(InvalidTokenError):
        decode(_tok({"sub": "u", "nbf": int(time.time()) + 3600}), KEY)


def test_malformed_nbf_is_rejected():
    # Regression: a present-but-unparseable nbf must not silently skip the
    # not-before check (would otherwise bypass the hardening).
    with pytest.raises(InvalidTokenError):
        decode(_tok({"sub": "u", "nbf": "not-a-timestamp"}), KEY)


def test_malformed_exp_is_rejected():
    with pytest.raises(InvalidTokenError):
        decode(_tok({"sub": "u", "exp": "not-a-timestamp"}), KEY)


def test_exp_within_leeway_is_still_valid():
    # Expired by less than the allowed clock-skew leeway -> still accepted.
    just_expired = int(time.time()) - int(CLOCK_SKEW_LEEWAY_SECONDS / 2)
    assert decode(_tok({"sub": "u", "exp": just_expired}), KEY)["sub"] == "u"


def test_nbf_within_leeway_is_still_valid():
    # Not-yet-valid by less than the leeway -> still accepted.
    near_future = int(time.time()) + int(CLOCK_SKEW_LEEWAY_SECONDS / 2)
    assert decode(_tok({"sub": "u", "nbf": near_future}), KEY)["sub"] == "u"


def test_unsupported_algorithm_is_rejected():
    with pytest.raises(InvalidTokenError):
        decode(_tok({"sub": "u"}), KEY, algorithms=["none"])


def test_wrong_key_is_rejected():
    with pytest.raises(InvalidTokenError):
        decode(_tok({"sub": "u"}), "a-different-key")
