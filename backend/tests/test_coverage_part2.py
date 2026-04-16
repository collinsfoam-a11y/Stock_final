import pytest
import os
import importlib
from datetime import timedelta
from unittest.mock import patch
from fastapi import HTTPException
from backend.utils.result import Result, Either, result_function, UnwrapError
from backend.utils.result import handle_result as result_handle_result
from backend.utils.api_utils import result_to_response
from backend.utils.auth_utils import create_access_token

# --- Tests for api_utils.py ---


@pytest.mark.asyncio
async def test_result_to_response_decorator():
    """Test result_to_response decorator"""

    # Test success path
    @result_to_response(success_status=201)
    async def success_func():
        return Result.ok({"id": 1})

    resp = await success_func()
    assert resp["success"] is True
    assert resp["data"] == {"id": 1}
    # Check if status code handling is implicit or explicit in return?
    # handle_result returns a dict, not Response object directly usually,
    # but the decorator might expect it to return dict.
    # Let's check handle_result implementation: it returns dict.

    # Test failure path (Result.fail)
    @result_to_response()
    async def fail_func():
        return Result.fail(ValueError("oops"))

    try:
        await fail_func()
        assert False, "Should raise HTTPException"
    except HTTPException as e:
        assert e.status_code == 500

    # Test exception raised
    @result_to_response()
    async def exception_func():
        raise ValueError("boom")

    try:
        await exception_func()
        assert False, "Should raise HTTPException"
    except HTTPException as e:
        assert e.status_code == 500


# --- Tests for result.py ---


def test_result_methods_comprehensive():
    """Test map, unwrap, unwrap_or, to_either, to_optional"""

    # map
    res = Result.ok(10)
    mapped = res.map(lambda x: x * 2)
    assert mapped.unwrap() == 20

    err = Result.fail(ValueError("e"))
    mapped_err = err.map(lambda x: x * 2)
    assert mapped_err.is_err

    # unwrap_or
    assert Result.ok(5).unwrap_or(0) == 5
    assert Result.fail("e").unwrap_or(0) == 0

    # to_optional
    assert Result.ok("v").to_optional() == "v"
    assert Result.fail("e").to_optional() is None

    # to_either
    e_ok = Result.ok("right").to_either()
    assert isinstance(e_ok, Either)
    assert e_ok.is_right
    assert e_ok._value == "right"

    e_err = Result.fail("left").to_either()
    assert e_err.is_left
    assert e_err._value == "left"


def test_result_context_manager():
    """Test Result as context manager"""
    # Success case
    with Result.ok("val") as r:
        assert r.unwrap() == "val"

    # Error case - should raise error if unwrapped?
    # The context manager implementation:
    # __enter__ returns self.
    # __exit__ checks if exc_val is UnwrapError and reraises inner error.

    try:
        with Result.fail(ValueError("inner")) as r:
            r.unwrap()
    except ValueError as e:
        assert str(e) == "inner"
    except UnwrapError:
        assert False, "Should have unwrapped the UnwrapError"


def test_either_methods():
    """Test Either methods"""
    # Right
    r = Either.right(10)
    assert r.is_right
    assert not r.is_left
    assert r.map(lambda x: x + 1)._value == 11
    assert r.map_left(lambda x: x).is_right
    assert r.get_or_else(0) == 10
    assert r.fold(lambda left_val: "left", lambda right_val: "right") == "right"

    # Left
    left_result = Either.left("err")
    assert left_result.is_left
    assert not left_result.is_right
    assert left_result.map(lambda x: x).is_left
    assert left_result.map_left(lambda x: x + "!")._value == "err!"
    assert left_result.get_or_else("default") == "default"
    assert left_result.fold(lambda left_val: "left", lambda right_val: "right") == "left"


def test_result_function_decorator():
    """Test result_function decorator"""

    @result_function(ValueError)
    def div(a, b):
        if b == 0:
            raise ValueError("zero")
        return a / b

    # Success
    res = div(10, 2)
    assert isinstance(res, Result)
    assert res.is_ok
    assert res.unwrap() == 5.0

    # Failure
    res = div(10, 0)
    assert isinstance(res, Result)
    assert res.is_err
    assert isinstance(res._error, ValueError)


# --- Tests for auth_utils.py production init ---


def test_auth_utils_production_init():
    """Test auth_utils initialization in production mode"""
    import backend.utils.auth_utils

    # Mock settings to avoid validation errors
    with (
        patch("backend.config.settings.JWT_SECRET", "secret"),
        patch("backend.config.settings.JWT_ALGORITHM", "HS256"),
    ):
        # Case 1: Production with Argon2 (simulate success)
        with patch.dict(os.environ, {"TESTING": "false"}):
            with patch("passlib.context.CryptContext") as MockContext:
                with patch("bcrypt.hashpw"):  # ensure bcrypt check passes
                    with patch("bcrypt.checkpw"):
                        importlib.reload(backend.utils.auth_utils)
                        # Check if CryptContext was called with argon2
                        calls = MockContext.call_args_list
                        # It might be called multiple times if logic is complex,
                        # but we look for the one with argon2
                        found_argon2 = False
                        for call in calls:
                            if "schemes" in call.kwargs and "argon2" in call.kwargs["schemes"]:
                                found_argon2 = True
                        assert found_argon2, "Should initialize with argon2 in production"

        # Case 2: Production but bcrypt check fails (simulate exception)
        with patch.dict(os.environ, {"TESTING": "false"}):
            with patch("passlib.context.CryptContext") as MockContext:
                with patch("bcrypt.hashpw", side_effect=Exception("No bcrypt")):
                    # This triggers the inner except block
                    importlib.reload(backend.utils.auth_utils)
                    # Should verify fallback to bcrypt-only
                    # The code: pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
                    found_bcrypt_only = False
                    for call in calls:  # calls are accumulated on the mock? No, new mock context?
                        # Ah, MockContext is the class.
                        pass

                    # Check calls on MockContext
                    calls = MockContext.call_args_list
                    # Should see call with schemes=['bcrypt']
                    found_bcrypt_only = any(
                        call.kwargs.get("schemes") == ["bcrypt"] for call in calls
                    )
                    assert found_bcrypt_only, "Should fallback to bcrypt-only if check fails"

    # Restore module to testing state for other tests
    with patch.dict(os.environ, {"TESTING": "true"}):
        importlib.reload(backend.utils.auth_utils)


# --- Additional Tests for result.py (internal handle_result) ---


def test_result_internal_handle_result():
    """Test the handle_result function defined inside result.py"""
    # Success
    res = Result.ok("data")
    resp = result_handle_result(res)
    assert resp["success"] is True
    assert resp["data"] == "data"

    # Error with status code
    err = ValueError("bad")
    try:
        result_handle_result(Result.fail(err))
    except HTTPException as e:
        # It raises HTTPException
        assert e.status_code in [400, 422, 500]

    # Error with 500 (unexpected)
    try:
        result_handle_result(Result.fail(Exception("boom")))
    except HTTPException as e:
        assert e.status_code == 500


# --- Additional Tests for auth_utils.py ---


def test_create_access_token():
    """Test create_access_token function"""
    data = {"sub": "user1"}

    # Test with default settings
    token = create_access_token(data)
    assert isinstance(token, str)
    assert len(token) > 0

    # Test with explicit expiry
    delta = timedelta(minutes=5)
    token2 = create_access_token(data, expires_delta=delta)
    assert isinstance(token2, str)

    # Test with custom key/algo
    token3 = create_access_token(data, secret_key="custom", algorithm="HS256")
    assert isinstance(token3, str)
