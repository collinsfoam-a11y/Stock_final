"""
PIN Authentication Service
Handles PIN-based login for staff/quick access.
FIX GROUP 7: Adds signed override-token flow so PIN verification is
cryptographically bound to the privileged action being authorised.
"""

import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from passlib.context import CryptContext

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# Privileged actions that require a supervisor override token.
OVERRIDE_REQUIRED_ACTIONS: frozenset[str] = frozenset(
    {
        "approve",
        "reject",
        "force_close",
        "variance_override",
        "recount_approve",
        "inventory_adjust",
    }
)

_OVERRIDE_TOKEN_TTL_SECONDS = 300  # 5 minutes


def _derive_signing_key() -> bytes:
    """Derive a per-deployment signing key from the environment secret."""
    secret = os.environ.get("OVERRIDE_TOKEN_SECRET")
    if not secret:
        raise RuntimeError(
            "OVERRIDE_TOKEN_SECRET environment variable is not set. "
            "Refusing to sign override tokens with an insecure default."
        )
    return hashlib.sha256(secret.encode()).digest()


def _sign_token(payload: str) -> str:
    key = _derive_signing_key()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


class PINAuthService:
    """Service for PIN-based authentication"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.pin_authentication
        self.override_collection = db.supervisor_override_tokens
        self.max_attempts = 3
        self.lockout_duration = 15  # minutes

    async def initialize(self):
        """Initialize indexes"""
        try:
            await self.collection.create_index("user_id", unique=True)
            await self.collection.create_index("last_used")
            await self.collection.create_index("locked_until")
            await self.override_collection.create_index("token", unique=True)
            await self.override_collection.create_index(
                "expires_at", expireAfterSeconds=0
            )
            logger.info("PIN authentication indexes created")
        except Exception as e:
            logger.error(f"Error creating PIN indexes: {e}")

    async def set_pin(self, user_id: str, pin: str) -> bool:
        """
        Set or update PIN for a user

        Args:
            user_id: User ID
            pin: 4-6 digit PIN

        Returns:
            True if successful
        """
        try:
            if not self._validate_pin_format(pin):
                raise ValueError("PIN must be 4-6 digits")

            hashed_pin = pwd_context.hash(pin)

            await self.collection.update_one(
                {"user_id": user_id},
                {
                    "$set": {
                        "pin_hash": hashed_pin,
                        "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                        "enabled": True,
                        "failed_attempts": 0,
                    }
                },
                upsert=True,
            )

            logger.info(f"PIN set for user: {user_id}")
            return True
        except Exception as e:
            logger.error(f"Error setting PIN: {e}")
            return False

    async def verify_pin(self, user_id: str, pin: str) -> bool:
        """
        Verify PIN for a user

        Args:
            user_id: User ID
            pin: PIN to verify

        Returns:
            True if PIN is correct
        """
        try:
            pin_record = await self.collection.find_one({"user_id": user_id})

            if not pin_record or not pin_record.get("enabled"):
                return False

            # Check if account is locked
            if pin_record.get("locked_until"):
                if datetime.now(timezone.utc).replace(tzinfo=None) < pin_record["locked_until"]:
                    logger.warning(f"PIN login attempt for locked account: {user_id}")
                    return False
                else:
                    # Unlock account
                    await self.collection.update_one(
                        {"user_id": user_id},
                        {
                            "$set": {
                                "locked_until": None,
                                "failed_attempts": 0,
                            }
                        },
                    )

            # Verify PIN
            if pwd_context.verify(pin, pin_record.get("pin_hash", "")):
                # Reset failed attempts
                await self.collection.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "last_used": datetime.now(timezone.utc).replace(tzinfo=None),
                            "failed_attempts": 0,
                        }
                    },
                )
                logger.info(f"Successful PIN login for user: {user_id}")
                return True
            else:
                # Increment failed attempts
                failed_attempts = pin_record.get("failed_attempts", 0) + 1

                update_data = {"$set": {"failed_attempts": failed_attempts}}

                # Lock account after max attempts
                if failed_attempts >= self.max_attempts:
                    locked_until = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
                        minutes=self.lockout_duration
                    )
                    update_data["$set"]["locked_until"] = locked_until
                    logger.warning(f"PIN account locked due to failed attempts: {user_id}")

                await self.collection.update_one({"user_id": user_id}, update_data)
                return False

        except Exception as e:
            logger.error(f"Error verifying PIN: {e}")
            return False

    # ------------------------------------------------------------------ #
    # FIX GROUP 7: Supervisor override token flow                          #
    # ------------------------------------------------------------------ #

    async def generate_override_token(
        self,
        user_id: str,
        pin: str,
        action: str,
        ttl_seconds: int = _OVERRIDE_TOKEN_TTL_SECONDS,
    ) -> dict[str, Any]:
        """
        Verify the supervisor's PIN and, on success, issue a short-lived
        cryptographically signed override token bound to the requested action.

        Returns dict with ``token`` and ``expires_at`` on success, or raises
        ``PermissionError`` on failure.
        """
        if action not in OVERRIDE_REQUIRED_ACTIONS:
            raise ValueError(f"Unknown privileged action: {action}")

        pin_ok = await self.verify_pin(user_id, pin)
        if not pin_ok:
            raise PermissionError("PIN verification failed")

        raw_token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            seconds=ttl_seconds
        )
        # HMAC signature binds token to user_id + action so it cannot be reused
        # for a different operation or by a different user.
        sig_payload = f"{raw_token}:{user_id}:{action}"
        signature = _sign_token(sig_payload)
        signed_token = f"{raw_token}.{signature}"

        await self.override_collection.insert_one(
            {
                "token": signed_token,
                "user_id": user_id,
                "action": action,
                "expires_at": expires_at,
                "used": False,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
            }
        )

        logger.info("Supervisor override token issued: user=%s action=%s", user_id, action)
        return {"token": signed_token, "expires_at": expires_at.isoformat()}

    async def validate_override_token(
        self,
        token: str,
        user_id: str,
        action: str,
    ) -> bool:
        """
        Validate a supervisor override token before executing a privileged action.
        Tokens are single-use and expire after TTL.

        Returns True on success.  Raises PermissionError on any failure.
        """
        if not token:
            raise PermissionError("Override token is required for privileged action")

        # Verify HMAC signature structure.
        parts = token.rsplit(".", 1)
        if len(parts) != 2:
            raise PermissionError("Malformed override token")

        raw_token, provided_sig = parts
        sig_payload = f"{raw_token}:{user_id}:{action}"
        expected_sig = _sign_token(sig_payload)
        if not hmac.compare_digest(provided_sig, expected_sig):
            raise PermissionError("Override token signature invalid")

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Atomic consume: the filter ensures token is unused, belongs to the right
        # user/action, and has not expired — all in a single round-trip.
        result = await self.override_collection.update_one(
            {
                "token": token,
                "user_id": user_id,
                "action": action,
                "used": False,
                "expires_at": {"$gt": now},
            },
            {"$set": {"used": True, "used_at": now}},
        )

        if not getattr(result, "modified_count", 0):
            # Determine why it failed — give a useful error without leaking info.
            existing = await self.override_collection.find_one({"token": token})
            if not existing:
                raise PermissionError("Override token not found")
            if existing.get("used"):
                raise PermissionError("Override token has already been used")
            if existing.get("expires_at") and now >= existing["expires_at"]:
                raise PermissionError("Override token has expired")
            raise PermissionError("Override token is invalid for this user or action")

        logger.info("Override token validated: user=%s action=%s", user_id, action)
        return True

    async def disable_pin(self, user_id: str) -> bool:
        """Disable PIN for a user"""
        try:
            result = await self.collection.update_one(
                {"user_id": user_id},
                {"$set": {"enabled": False}},
            )
            logger.info(f"PIN disabled for user: {user_id}")
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error disabling PIN: {e}")
            return False

    async def get_pin_status(self, user_id: str) -> dict[str, Any]:
        """Get PIN status for a user"""
        try:
            pin_record = await self.collection.find_one({"user_id": user_id})

            if not pin_record:
                return {"enabled": False, "status": "not_set"}

            is_locked = (
                pin_record.get("locked_until")
                and datetime.now(timezone.utc).replace(tzinfo=None) < pin_record["locked_until"]
            )

            return {
                "enabled": pin_record.get("enabled", False),
                "status": "locked" if is_locked else "active",
                "failed_attempts": pin_record.get("failed_attempts", 0),
                "last_used": pin_record.get("last_used"),
                "locked_until": pin_record.get("locked_until") if is_locked else None,
            }
        except Exception as e:
            logger.error(f"Error getting PIN status: {e}")
            return {"enabled": False, "status": "error"}

    def _validate_pin_format(self, pin: str) -> bool:
        """Validate PIN format (4-6 digits)"""
        return isinstance(pin, str) and len(pin) >= 4 and len(pin) <= 6 and pin.isdigit()
