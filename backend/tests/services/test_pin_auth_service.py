"""
Tests for PINAuthService.
Covers: set_pin, verify_pin, disable_pin, get_pin_status, _validate_pin_format
"""

import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, call
from backend.services.pin_auth_service import PINAuthService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_db(pin_record=None):
    """Build a minimal mock DB with a pin_authentication collection."""
    db = MagicMock()
    collection = MagicMock()
    collection.find_one = AsyncMock(return_value=pin_record)
    collection.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    collection.create_index = AsyncMock(return_value=None)
    db.pin_authentication = collection
    return db


# ---------------------------------------------------------------------------
# _validate_pin_format
# ---------------------------------------------------------------------------

class TestValidatePinFormat:
    def _service(self):
        return PINAuthService(MagicMock())

    def test_valid_4_digit_pin(self):
        assert self._service()._validate_pin_format("1234") is True

    def test_valid_6_digit_pin(self):
        assert self._service()._validate_pin_format("123456") is True

    def test_valid_5_digit_pin(self):
        assert self._service()._validate_pin_format("12345") is True

    def test_too_short(self):
        assert self._service()._validate_pin_format("123") is False

    def test_too_long(self):
        assert self._service()._validate_pin_format("1234567") is False

    def test_non_digit(self):
        assert self._service()._validate_pin_format("12ab") is False

    def test_empty(self):
        assert self._service()._validate_pin_format("") is False

    def test_not_string(self):
        assert self._service()._validate_pin_format(1234) is False  # type: ignore


# ---------------------------------------------------------------------------
# set_pin
# ---------------------------------------------------------------------------

class TestSetPin:
    @pytest.mark.asyncio
    async def test_set_pin_success(self):
        db = _make_db()
        service = PINAuthService(db)
        result = await service.set_pin("user1", "1234")
        assert result is True
        db.pin_authentication.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_set_pin_invalid_format_raises(self):
        db = _make_db()
        service = PINAuthService(db)
        result = await service.set_pin("user1", "12")  # too short
        assert result is False

    @pytest.mark.asyncio
    async def test_set_pin_stores_hash(self):
        db = _make_db()
        service = PINAuthService(db)
        await service.set_pin("user1", "4567")
        call_args = db.pin_authentication.update_one.call_args
        set_data = call_args[0][1]["$set"]
        assert "pin_hash" in set_data
        assert set_data["enabled"] is True
        assert set_data["failed_attempts"] == 0

    @pytest.mark.asyncio
    async def test_set_pin_db_error_returns_false(self):
        db = _make_db()
        db.pin_authentication.update_one = AsyncMock(side_effect=Exception("DB error"))
        service = PINAuthService(db)
        result = await service.set_pin("user1", "1234")
        assert result is False


# ---------------------------------------------------------------------------
# verify_pin
# ---------------------------------------------------------------------------

class TestVerifyPin:
    def _pin_record(self, pin="1234", enabled=True, failed=0, locked_until=None):
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["argon2"], deprecated="auto")
        return {
            "user_id": "user1",
            "pin_hash": ctx.hash(pin),
            "enabled": enabled,
            "failed_attempts": failed,
            "locked_until": locked_until,
        }

    @pytest.mark.asyncio
    async def test_verify_correct_pin(self):
        record = self._pin_record(pin="1234")
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is True

    @pytest.mark.asyncio
    async def test_verify_wrong_pin(self):
        record = self._pin_record(pin="1234")
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "9999")
        assert result is False

    @pytest.mark.asyncio
    async def test_verify_no_record_returns_false(self):
        db = _make_db(pin_record=None)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is False

    @pytest.mark.asyncio
    async def test_verify_disabled_pin_returns_false(self):
        record = self._pin_record(pin="1234", enabled=False)
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is False

    @pytest.mark.asyncio
    async def test_verify_locked_account_returns_false(self):
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10)
        record = self._pin_record(pin="1234", locked_until=future)
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is False

    @pytest.mark.asyncio
    async def test_verify_expired_lock_allows_login(self):
        past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
        record = self._pin_record(pin="1234", locked_until=past)
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is True

    @pytest.mark.asyncio
    async def test_max_attempts_locks_account(self):
        record = self._pin_record(pin="1234", failed=2)  # one away from lock
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "9999")
        assert result is False
        # Check that locked_until was set
        update_calls = db.pin_authentication.update_one.call_args_list
        set_data = update_calls[-1][0][1]["$set"]
        assert "locked_until" in set_data

    @pytest.mark.asyncio
    async def test_db_error_returns_false(self):
        db = MagicMock()
        db.pin_authentication.find_one = AsyncMock(side_effect=Exception("DB error"))
        service = PINAuthService(db)
        result = await service.verify_pin("user1", "1234")
        assert result is False


# ---------------------------------------------------------------------------
# disable_pin
# ---------------------------------------------------------------------------

class TestDisablePin:
    @pytest.mark.asyncio
    async def test_disable_pin_success(self):
        db = _make_db()
        service = PINAuthService(db)
        result = await service.disable_pin("user1")
        assert result is True
        call_args = db.pin_authentication.update_one.call_args
        assert call_args[0][1]["$set"]["enabled"] is False

    @pytest.mark.asyncio
    async def test_disable_pin_db_error_returns_false(self):
        db = _make_db()
        db.pin_authentication.update_one = AsyncMock(side_effect=Exception("DB error"))
        service = PINAuthService(db)
        result = await service.disable_pin("user1")
        assert result is False


# ---------------------------------------------------------------------------
# get_pin_status
# ---------------------------------------------------------------------------

class TestGetPinStatus:
    @pytest.mark.asyncio
    async def test_no_record_returns_not_set(self):
        db = _make_db(pin_record=None)
        service = PINAuthService(db)
        status = await service.get_pin_status("user1")
        assert status["enabled"] is False
        assert status["status"] == "not_set"

    @pytest.mark.asyncio
    async def test_active_pin_status(self):
        record = {
            "user_id": "user1",
            "pin_hash": "hash",
            "enabled": True,
            "failed_attempts": 0,
            "locked_until": None,
        }
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        status = await service.get_pin_status("user1")
        assert status["enabled"] is True
        assert status["status"] == "active"

    @pytest.mark.asyncio
    async def test_locked_pin_status(self):
        future = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10)
        record = {
            "user_id": "user1",
            "pin_hash": "hash",
            "enabled": True,
            "failed_attempts": 3,
            "locked_until": future,
        }
        db = _make_db(pin_record=record)
        service = PINAuthService(db)
        status = await service.get_pin_status("user1")
        assert status["status"] == "locked"
        assert status["locked_until"] == future

    @pytest.mark.asyncio
    async def test_db_error_returns_error_status(self):
        db = MagicMock()
        db.pin_authentication.find_one = AsyncMock(side_effect=Exception("DB error"))
        service = PINAuthService(db)
        status = await service.get_pin_status("user1")
        assert status["status"] == "error"


# ---------------------------------------------------------------------------
# initialize
# ---------------------------------------------------------------------------

class TestInitialize:
    @pytest.mark.asyncio
    async def test_initialize_creates_indexes(self):
        db = _make_db()
        service = PINAuthService(db)
        await service.initialize()
        assert db.pin_authentication.create_index.call_count == 3

    @pytest.mark.asyncio
    async def test_initialize_handles_error(self):
        db = _make_db()
        db.pin_authentication.create_index = AsyncMock(side_effect=Exception("Index error"))
        service = PINAuthService(db)
        # Should not raise
        await service.initialize()
