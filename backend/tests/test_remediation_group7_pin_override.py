"""
FIX GROUP 7 — Regression tests: Supervisor override token security.

Validates:
  - Expired token → fail
  - Wrong user → fail
  - Missing token → fail
  - Valid token → pass (single-use)
  - Reuse of consumed token → fail
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.pin_auth_service import (
    OVERRIDE_REQUIRED_ACTIONS,
    PINAuthService,
    _sign_token,
)


@pytest.fixture(autouse=True)
def override_token_secret(monkeypatch):
    """Ensure OVERRIDE_TOKEN_SECRET is set for all tests in this module."""
    monkeypatch.setenv("OVERRIDE_TOKEN_SECRET", "test-secret-do-not-use-in-production")


def _make_db() -> MagicMock:
    db = MagicMock()
    db.pin_authentication = MagicMock()
    db.supervisor_override_tokens = MagicMock()
    db.pin_authentication.find_one = AsyncMock(
        return_value={
            "user_id": "supervisor1",
            "pin_hash": "$argon2id$v=19$m=65536,t=3,p=4$...",
            "enabled": True,
            "failed_attempts": 0,
        }
    )
    db.pin_authentication.update_one = AsyncMock(return_value=None)
    db.supervisor_override_tokens.insert_one = AsyncMock(return_value=None)
    db.supervisor_override_tokens.find_one = AsyncMock(return_value=None)
    db.supervisor_override_tokens.update_one = AsyncMock(return_value=MagicMock(modified_count=0))
    return db


@pytest.mark.asyncio
async def test_missing_token_raises():
    db = _make_db()
    service = PINAuthService(db)

    with pytest.raises(PermissionError, match="required"):
        await service.validate_override_token("", "supervisor1", "approve")


@pytest.mark.asyncio
async def test_malformed_token_raises():
    db = _make_db()
    service = PINAuthService(db)

    with pytest.raises(PermissionError, match="Malformed"):
        await service.validate_override_token("no-dot-separator", "supervisor1", "approve")


@pytest.mark.asyncio
async def test_invalid_signature_raises():
    db = _make_db()
    service = PINAuthService(db)

    # Build a token with a bad signature
    bad_token = "raw_token_abc.badsignature"
    with pytest.raises(PermissionError, match="signature invalid"):
        await service.validate_override_token(bad_token, "supervisor1", "approve")


@pytest.mark.asyncio
async def test_expired_token_raises():
    db = _make_db()
    service = PINAuthService(db)

    # Create a correctly signed but expired token
    raw = "raw_token_expire"
    sig = _sign_token(f"{raw}:supervisor1:approve")
    token = f"{raw}.{sig}"

    db.supervisor_override_tokens.find_one = AsyncMock(
        return_value={
            "token": token,
            "user_id": "supervisor1",
            "action": "approve",
            "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1),
            "used": False,
        }
    )

    with pytest.raises(PermissionError, match="expired"):
        await service.validate_override_token(token, "supervisor1", "approve")


@pytest.mark.asyncio
async def test_wrong_user_raises():
    db = _make_db()
    service = PINAuthService(db)

    raw = "raw_token_user"
    sig = _sign_token(f"{raw}:wrong_user:approve")
    token = f"{raw}.{sig}"

    db.supervisor_override_tokens.find_one = AsyncMock(
        return_value={
            "token": token,
            "user_id": "supervisor1",  # different
            "action": "approve",
            "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5),
            "used": False,
        }
    )

    with pytest.raises(PermissionError):
        # Signature won't match because we built it for wrong_user
        await service.validate_override_token(token, "wrong_user", "approve")


@pytest.mark.asyncio
async def test_already_used_token_raises():
    db = _make_db()
    service = PINAuthService(db)

    raw = "raw_token_used"
    sig = _sign_token(f"{raw}:supervisor1:approve")
    token = f"{raw}.{sig}"

    db.supervisor_override_tokens.find_one = AsyncMock(
        return_value={
            "token": token,
            "user_id": "supervisor1",
            "action": "approve",
            "expires_at": datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=5),
            "used": True,
        }
    )

    with pytest.raises(PermissionError, match="already been used"):
        await service.validate_override_token(token, "supervisor1", "approve")


@pytest.mark.asyncio
async def test_valid_token_passes_and_is_consumed():
    db = _make_db()
    service = PINAuthService(db)

    raw = "raw_token_valid"
    sig = _sign_token(f"{raw}:supervisor1:approve")
    token = f"{raw}.{sig}"

    # Atomic update_one succeeds for a valid token
    db.supervisor_override_tokens.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

    result = await service.validate_override_token(token, "supervisor1", "approve")
    assert result is True

    # Token must have been atomically consumed
    update_call = db.supervisor_override_tokens.update_one.call_args
    assert update_call.args[1]["$set"]["used"] is True


@pytest.mark.asyncio
async def test_unknown_action_raises():
    db = _make_db()
    service = PINAuthService(db)

    # Patch verify_pin to succeed
    service.verify_pin = AsyncMock(return_value=True)

    with pytest.raises(ValueError, match="Unknown privileged action"):
        await service.generate_override_token("supervisor1", "1234", "fly_to_moon")


def test_all_required_actions_are_defined():
    required = {
        "approve",
        "reject",
        "force_close",
        "variance_override",
        "recount_approve",
        "inventory_adjust",
    }
    missing = required - OVERRIDE_REQUIRED_ACTIONS
    assert not missing, f"Actions missing from OVERRIDE_REQUIRED_ACTIONS: {missing}"
