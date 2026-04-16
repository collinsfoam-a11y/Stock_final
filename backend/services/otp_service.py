"""
OTP Service - Manages generation, storage, and verification of one-time passwords
"""

import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class OTPService:
    """
    Service for managing 6-digit OTP codes and secure reset tokens.
    """

    def __init__(
        self, db: AsyncIOMotorDatabase, otp_expiry_minutes: int = 5, token_expiry_minutes: int = 15
    ):
        self.db = db
        self.otp_collection = db.auth_otps
        self.reset_tokens_collection = db.auth_reset_tokens
        self.otp_expiry_minutes = otp_expiry_minutes
        self.token_expiry_minutes = token_expiry_minutes

    async def initialize(self):
        """Create indexes for TTL and fast lookups"""
        # Create TTL index for OTPs (expire after 5 minutes)
        await self.otp_collection.create_index("expires_at", expireAfterSeconds=0)
        await self.otp_collection.create_index("user_id")

        # Create TTL index for reset tokens (expire after 15 minutes)
        await self.reset_tokens_collection.create_index("expires_at", expireAfterSeconds=0)
        await self.reset_tokens_collection.create_index("token", unique=True)

    def generate_otp_code(self, length: int = 6) -> str:
        """Generate a cryptographically secure numeric OTP"""
        return "".join(secrets.choice(string.digits) for _ in range(length))

    async def create_otp(self, user_id: str) -> str:
        """
        Generate and store a new OTP for a user.
        Invalidates any existing OTPs for the same user.
        """
        await self.otp_collection.delete_many({"user_id": user_id})

        otp_code = self.generate_otp_code()
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            minutes=self.otp_expiry_minutes
        )

        await self.otp_collection.insert_one(
            {
                "user_id": user_id,
                "code": otp_code,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "expires_at": expires_at,
                "attempts": 0,
            }
        )

        return otp_code

    async def verify_otp(self, user_id: str, code: str) -> Tuple[bool, str]:
        """
        Verify an OTP code.
        Returns: (success, message)
        """
        otp_doc = await self.otp_collection.find_one({"user_id": user_id})

        if not otp_doc:
            return False, "OTP not found or expired"

        if otp_doc["attempts"] >= 5:
            await self.otp_collection.delete_one({"user_id": user_id})
            return False, "Too many failed attempts. Please request a new OTP."

        if otp_doc["code"] != code:
            await self.otp_collection.update_one({"user_id": user_id}, {"$inc": {"attempts": 1}})
            return False, "Invalid OTP code"

        # Success! Delete the OTP so it can't be reused
        await self.otp_collection.delete_one({"user_id": user_id})
        return True, "Success"

    async def create_reset_token(self, user_id: str) -> str:
        """
        Generate a secure short-lived token for password reset.
        This is returned after successful OTP verification.
        """
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
            minutes=self.token_expiry_minutes
        )

        await self.reset_tokens_collection.insert_one(
            {
                "user_id": user_id,
                "token": token,
                "created_at": datetime.now(timezone.utc).replace(tzinfo=None),
                "expires_at": expires_at,
            }
        )

        return token

    async def validate_reset_token(self, token: str) -> Optional[str]:
        """
        Validate a reset token and return the associated user_id if valid.
        Consumes the token on validation.
        """
        token_doc = await self.reset_tokens_collection.find_one_and_delete({"token": token})

        if token_doc:
            return token_doc["user_id"]

        return None
