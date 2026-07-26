"""Tests for auth utilities and result types"""

import pytest
from datetime import timedelta


class TestPasswordHashing:
    """Test password hashing functions"""

    def test_verify_password_correct(self):
        """Test verifying a correct password"""
        from utils.auth_utils import get_password_hash, verify_password

        password = "testpassword123"
        hashed = get_password_hash(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Test verifying an incorrect password"""
        from utils.auth_utils import get_password_hash, verify_password

        password = "testpassword123"
        wrong_password = "wrongpassword"
        hashed = get_password_hash(password)

        assert verify_password(wrong_password, hashed) is False

    def test_hash_password_returns_string(self):
        """Test that get_password_hash returns a string"""
        from utils.auth_utils import get_password_hash

        result = get_password_hash("testpassword")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_different_hashes_for_same_password(self):
        """Test that same password produces different hashes (salt)"""
        from utils.auth_utils import get_password_hash, verify_password

        password = "testpassword"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)

        # Same password should produce different hashes due to unique salt
        assert hash1 != hash2
        # But both should verify correctly
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True


class TestJWTUtilities:
    """Test JWT token utilities"""

    def test_create_access_token(self):
        """Test creating an access token"""
        from utils.auth_utils import create_access_token

        data = {"sub": "testuser"}
        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_access_token_with_expiry(self):
        """Test creating an access token with custom expiry"""
        from utils.auth_utils import create_access_token

        data = {"sub": "testuser"}
        expires_delta = timedelta(minutes=30)
        token = create_access_token(data, expires_delta=expires_delta)

        assert isinstance(token, str)
        assert len(token) > 0


class TestResultType:
    """Test the Result type for functional error handling"""

    def test_result_success(self):
        """Test creating a successful result"""
        from utils.result_types import Result

        result = Result.success("test_value")
        assert result.is_success is True
        assert result.is_error is False
        assert result.unwrap() == "test_value"

    def test_result_error(self):
        """Test creating an error result"""
        from utils.result_types import Result

        error = ValueError("test error")
        result = Result.error(error)
        assert result.is_error is True
        assert result.is_success is False

    def test_result_unwrap_or(self):
        """Test unwrap_or method"""
        from utils.result_types import Result

        success_result = Result.success("value")
        error_result = Result.error(ValueError("error"))

        assert success_result.unwrap_or("default") == "value"
        assert error_result.unwrap_or("default") == "default"

    def test_result_map(self):
        """Test map method"""
        from utils.result_types import Result

        result = Result.success(5)
        mapped = result.map(lambda x: x * 2)

        assert mapped.is_success is True
        assert mapped.unwrap() == 10

    def test_result_and_then(self):
        """Test and_then method (flatMap)"""
        from utils.result_types import Result

        result = Result.success(5)
        chained = result.and_then(lambda x: Result.success(x * 2))

        assert chained.is_success is True
        assert chained.unwrap() == 10

    def test_result_match(self):
        """Test match method for pattern matching"""
        from utils.result_types import Result

        success_result = Result.success("success")
        error_result = Result.error(ValueError("error"))

        success_match = success_result.match(lambda v: f"got: {v}", lambda e, msg: f"error: {msg}")
        error_match = error_result.match(lambda v: f"got: {v}", lambda e, msg: f"error: {msg}")

        assert success_match == "got: success"
        assert error_match == "error: error"

    def test_result_to_tuple(self):
        """Test to_tuple method"""
        from utils.result_types import Result

        success_result = Result.success("value")
        error_result = Result.error(ValueError("error"))

        success_tuple = success_result.to_tuple()
        error_tuple = error_result.to_tuple()

        assert success_tuple[0] is True
        assert success_tuple[1] == "value"
        assert success_tuple[2] is None

        # For error tuple, just check the structure since ValueError objects don't compare equal
        assert error_tuple[0] is False
        assert error_tuple[1] is None
        assert isinstance(error_tuple[2], ValueError)

    def test_result_str_repr(self):
        """Test string representation of Result"""
        from utils.result_types import Result

        success_result = Result.success("test")
        error_result = Result.error(ValueError("test error"))

        assert "success" in str(success_result)
        assert "error" in str(error_result)

    def test_result_unwrap_error_raises(self):
        """Test that unwrap on error result raises exception"""
        from utils.result_types import Result

        error_result = Result.error(ValueError("test error"))
        with pytest.raises(ValueError):
            error_result.unwrap()

    def test_result_unwrap_or_else(self):
        """Test unwrap_or_else method"""
        from utils.result_types import Result

        success_result = Result.success(5)
        error_result = Result.error(ValueError("error"))

        success_value = success_result.unwrap_or_else(lambda e: len(str(e)))
        error_value = error_result.unwrap_or_else(lambda e: len(str(e)))

        assert success_value == 5
        assert error_value == 5  # len("error") = 5

    def test_result_map_error_raises(self):
        """Test map method when function raises exception"""
        from utils.result_types import Result

        success_result = Result.success(5)

        # Function that raises an exception
        def bad_fn(x):
            raise RuntimeError("oops")

        mapped = success_result.map(bad_fn)
        assert mapped.is_error is True

    def test_result_map_error(self):
        """Test map_error method"""
        from utils.result_types import Result

        error_result = Result.error(ValueError("original"))
        mapped = error_result.map_error(lambda e: TypeError(f"wrapped: {e}"))

        assert mapped.is_error is True
        assert isinstance(mapped._error, TypeError)
        assert "wrapped" in str(mapped._error)

    def test_result_or_else(self):
        """Test or_else method for error recovery"""
        from utils.result_types import Result

        error_result = Result.error(ValueError("error"))
        recovered = error_result.or_else(lambda e: Result.success("recovered"))

        assert recovered.is_success is True
        assert recovered.unwrap() == "recovered"
