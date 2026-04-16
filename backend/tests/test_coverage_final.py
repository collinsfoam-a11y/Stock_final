import pytest
import os
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from backend.utils.result import (
    Result,
    handle_result,
    result_to_response as result_decorator,
)
from backend.utils.api_utils import handle_result as api_handle_result
from backend.utils.api_utils import sanitize_for_logging, create_safe_error_response
from backend.exceptions import (
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    NotFoundError,
    RateLimitError,
)

# --- result.py coverage ---


def test_result_initialization_errors():
    """Test invalid Result initializations"""
    # Test line 84: Cannot create Ok(None)
    with pytest.raises(ValueError, match=r"Cannot create Ok\(None\)"):
        Result.ok(None)

    # Test line 94: Cannot create Fail(None)
    with pytest.raises(ValueError, match=r"Cannot create Fail\(None\)"):
        Result.fail(None)


@pytest.mark.asyncio
async def test_result_decorator_coverage():
    """Test the result_to_response decorator defined in result.py"""

    # Success case
    @result_decorator(success_status=201)
    async def success():
        return Result.ok("data")

    res = await success()
    assert res["success"] is True
    assert res["data"] == "data"

    # Exception case
    @result_decorator()
    async def fail_exc():
        raise ValueError("boom")

    try:
        await fail_exc()
    except HTTPException as e:
        assert e.status_code == 400
        assert e.detail["error"]["message"] == "boom"


def test_result_fail_with_context():
    """Test Result.fail with context injection (lines 98-100)"""
    err = ValueError("base error")
    ctx = {"extra_info": "123"}
    res = Result.fail(err, context=ctx)
    assert res.is_err
    assert getattr(res._error, "extra_info") == "123"


def test_result_from_callable_generic_exception():
    """Test from_callable catching unexpected exceptions (lines 120-122)"""
    # To hit line 120-122, we need to raise an exception that is NOT caught by error_type
    # but error_type defaults to Exception.
    # So we pass a specific error_type, but raise something else?
    # But from_callable catches error_type as e -> fail(e).
    # Then it has `except Exception as e`.
    # So if we say error_type=ValueError, but it raises TypeError, it should hit the generic block.

    def raise_type_error():
        raise TypeError("unexpected")

    res = Result.from_callable(raise_type_error, error_type=ValueError)
    assert res.is_err
    assert isinstance(res._error, ValueError)  # It wraps it in error_type
    assert "Unexpected error: unexpected" in str(res._error)


def test_result_map_exceptions():
    """Test exceptions inside map operations (lines 153-155, 163-165)"""
    # map exception
    res = Result.ok(1)

    def map_fail(x):
        raise ValueError("map failed")

    mapped = res.map(map_fail)
    assert mapped.is_err
    assert str(mapped._error) == "map failed"

    # map_error exception
    res = Result.fail(ValueError("original"))

    def map_err_fail(x):
        raise TypeError("map_error failed")

    mapped_err = res.map_error(map_err_fail)
    assert mapped_err.is_err
    assert isinstance(mapped_err._error, TypeError)
    assert str(mapped_err._error) == "map_error failed"


def test_result_chaining_exceptions():
    """Test exceptions in and_then / or_else (lines 170-176, 183-185)"""
    # and_then exception
    res = Result.ok(1)

    def and_then_fail(x):
        raise ValueError("and_then failed")

    chained = res.and_then(and_then_fail)
    assert chained.is_err
    assert str(chained._error) == "and_then failed"

    # or_else exception
    res = Result.fail(ValueError("original"))

    def or_else_fail(e):
        raise TypeError("or_else failed")

    chained_err = res.or_else(or_else_fail)
    assert chained_err.is_err
    assert isinstance(chained_err._error, TypeError)


def test_result_match():
    """Test match method (lines 190-192)"""
    # Success match
    assert Result.ok(1).match(lambda x: x + 1, lambda e: 0) == 2
    # Error match
    assert Result.fail(ValueError("e")).match(lambda x: x + 1, lambda e: 0) == 0


def test_result_log_error():
    """Test log_error (lines 196-198)"""
    logger = MagicMock()
    Result.fail(ValueError("oops")).log_error(logger, "Error occurred")
    logger.error.assert_called_once()
    assert "Error occurred" in logger.error.call_args[0][0]

    logger.reset_mock()
    Result.ok(1).log_error(logger, "Should not log")
    logger.error.assert_not_called()


def test_result_handle_result_weird_state():
    """Test handle_result with missing error attribute (lines 346-347)"""
    # Create a result that claims to be failure but has no error
    # We have to hack this because the class prevents it
    res = Result.fail(ValueError("x"))
    object.__setattr__(res, "_error", None)

    # Now verify handle_result handles it
    try:
        handle_result(res)
    except HTTPException as e:
        assert e.status_code == 500
        assert e.detail["error"]["message"] == "An unexpected error occurred"


def test_result_handle_result_mapped_errors():
    """Test handle_result with mapped errors (line 335, 379)"""
    # Mocking _get_status_code map indirectly via error name

    # AuthenticationError -> 401
    class AuthenticationError(Exception):
        pass

    try:
        handle_result(Result.fail(AuthenticationError("auth fail")))
    except HTTPException as e:
        assert e.status_code == 401

    # AuthorizationError -> 403
    class AuthorizationError(Exception):
        pass

    try:
        handle_result(Result.fail(AuthorizationError("authz fail")))
    except HTTPException as e:
        assert e.status_code == 403

    # ValidationError -> 422
    class ValidationError(Exception):
        pass

    try:
        handle_result(Result.fail(ValidationError("invalid")))
    except HTTPException as e:
        assert e.status_code == 422

    # NotFoundError -> 404
    class NotFoundError(Exception):
        pass

    try:
        handle_result(Result.fail(NotFoundError("missing")))
    except HTTPException as e:
        assert e.status_code == 404

    # RateLimitExceededError -> 429
    class RateLimitExceededError(Exception):
        pass

    try:
        handle_result(Result.fail(RateLimitExceededError("slow down")))
    except HTTPException as e:
        assert e.status_code == 429


# --- api_utils.py coverage ---


def test_api_handle_result_legacy_fallback():
    """Test api_utils.handle_result legacy fallback (lines 108-110)"""
    # AuthenticationError
    try:
        api_handle_result(Result.fail(AuthenticationError("auth")))
    except HTTPException as e:
        assert e.status_code == 401

    # AuthorizationError
    try:
        api_handle_result(Result.fail(AuthorizationError("authz")))
    except HTTPException as e:
        assert e.status_code == 403

    # ValidationError (line 122)
    try:
        api_handle_result(Result.fail(ValidationError("valid")))
    except HTTPException as e:
        assert e.status_code == 422

    # NotFoundError (line 134)
    try:
        api_handle_result(Result.fail(NotFoundError("found")))
    except HTTPException as e:
        assert e.status_code == 404

    # RateLimitError (line 146)
    try:
        api_handle_result(Result.fail(RateLimitError("limit")))
    except HTTPException as e:
        assert e.status_code == 429


def test_sanitize_logging():
    """Test sanitize_for_logging edge cases"""
    assert sanitize_for_logging(None) == ""
    assert sanitize_for_logging("clean") == "clean"
    assert sanitize_for_logging("dirty\nnewline") == "dirtynewline"
    assert sanitize_for_logging("injection<script>") == "injectionscript"


def test_create_safe_error_response():
    """Test create_safe_error_response logging"""
    with patch("backend.utils.api_utils.logger") as mock_logger:
        create_safe_error_response(500, "msg", log_details="detailed info")
        mock_logger.error.assert_called()
        assert "detailed info" in mock_logger.error.call_args[0][0]


# --- auth_utils.py coverage ---


def test_auth_utils_bcrypt_fallbacks():
    """Test auth_utils bcrypt fallback failures"""
    from backend.utils.auth_utils import _verify_bcrypt_fallback

    # ImportError (line 99)
    with patch.dict("sys.modules", {"bcrypt": None}):
        assert _verify_bcrypt_fallback(b"pass", "hash") is False

    # Exception (line 102)
    with patch("bcrypt.checkpw", side_effect=Exception("oops")):
        assert _verify_bcrypt_fallback(b"pass", "hash") is False

    # Non-string hash (line 96)
    assert _verify_bcrypt_fallback(b"pass", 123) is False


def test_auth_utils_argon2_init_failure():
    """Test argon2 init failure (lines 43-45)"""
    # We need to simulate exception during CryptContext init
    # This runs at module level, so we need to reload the module
    import backend.utils.auth_utils
    import importlib

    with patch("passlib.context.CryptContext", side_effect=Exception("Init failed")):
        # The module catches this and falls back to bcrypt-only
        # But wait, the catch block calls CryptContext AGAIN.
        # So we need side_effect to fail first time, succeed second time?
        # Or just fail both times? If it fails both times, the module might crash?
        # Lines 43-45:
        # except Exception as e:
        #    logger.warning(...)
        #    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

        # So we need to mock CryptContext to raise on first call, return valid on second.

        mock_cc = MagicMock()
        side_effect = [Exception("Argon2 fail"), mock_cc]

        with patch("passlib.context.CryptContext", side_effect=side_effect) as mock_init:
            with patch.dict(os.environ, {"TESTING": "false"}):
                importlib.reload(backend.utils.auth_utils)

                # Verify it was called twice
                assert mock_init.call_count == 2
                # Verify fallback log or behavior (optional)
