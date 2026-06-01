"""
Refresh Token Service
Implements JWT refresh tokens with automatic rotation for enhanced security
"""

import hashlib
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from backend.utils.datetime_utils import utc_now_naive
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.auth.jwt_provider import jwt

logger = logging.getLogger(__name__)


class RefreshTokenPersistenceError(RuntimeError):
    """Raised when a refresh token cannot be persisted safely."""


def _hash_token(token: str) -> str:
    # Store refresh tokens as a one-way hash to reduce blast radius if DB is leaked.
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class RefreshTokenService:
    """Service for managing refresh tokens"""

    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        secret_key: str,
        algorithm: str = "HS256",
        *,
        access_secret_key: Optional[str] = None,
    ):
        self.db = db
        self.refresh_secret_key = secret_key
        self.access_secret_key = access_secret_key or secret_key
        self.secret_key = self.refresh_secret_key
        self.algorithm = algorithm
        self.refresh_token_expiry = timedelta(days=30)  # 30 days
        self.access_token_expiry = timedelta(minutes=15)  # 15 minutes

    def create_access_token(self, data: dict[str, Any]) -> str:
        """Create a short-lived access token"""
        expire = utc_now_naive() + self.access_token_expiry
        to_encode = data.copy()
        to_encode.update(
            {"exp": expire, "type": "access", "iss": "stk-verify-api", "aud": "stk-verify-client"}
        )
        return jwt.encode(to_encode, self.access_secret_key, algorithm=self.algorithm)

    def create_refresh_token(self, data: dict[str, Any]) -> str:
        """Create a long-lived refresh token"""
        expire = utc_now_naive() + self.refresh_token_expiry
        to_encode = data.copy()
        # Include a unique token identifier so concurrent logins do not
        # generate identical JWT payloads and collide on the token hash index.
        to_encode.update(
            {
                "exp": expire,
                "type": "refresh",
                "jti": str(uuid4()),
                "iss": "stk-verify-api",
                "aud": "stk-verify-client",
            }
        )
        token = jwt.encode(to_encode, self.refresh_secret_key, algorithm=self.algorithm)

        return token

    async def store_refresh_token(
        self,
        token: str,
        username: str,
        expires_at: datetime,
        *,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_id: Optional[str] = None,
    ):
        """Store refresh token in database (public method)"""
        await self._store_refresh_token(
            token,
            username,
            expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            device_id=device_id,
        )

    async def _store_refresh_token(
        self,
        token: str,
        username: str,
        expires_at: datetime,
        *,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_id: Optional[str] = None,
    ):
        """Store refresh token in database"""
        try:
            # Enforce single-session: Revoke ALL existing tokens for this user first
            # Enforce single-session: Revoke ALL existing tokens for this user first
            # Use a short grace period to prevent race conditions from parallel requests (e.g. app init)
            await self.revoke_all_user_tokens(
                username, grace_period_seconds=10, raise_on_error=True
            )

            token_hash = _hash_token(token)
            document: dict[str, Any] = {
                "token_hash": token_hash,
                "username": username,
                "created_at": utc_now_naive(),
                "expires_at": expires_at,
                "revoked": False,
            }
            if ip_address:
                document["ip_address"] = ip_address
            if user_agent:
                document["user_agent"] = user_agent
            if device_id:
                document["device_id"] = device_id

            await self.db.refresh_tokens.insert_one(document)

            # Clean up old tokens
            await self._cleanup_expired_tokens()
        except Exception as e:
            logger.error("Error storing refresh token: %s", e)
            raise RefreshTokenPersistenceError("Failed to store refresh token") from e

    async def _cleanup_expired_tokens(self):
        """Remove expired and revoked tokens"""
        try:
            now = utc_now_naive()
            result = await self.db.refresh_tokens.delete_many(
                {
                    "$and": [
                        {
                            "$or": [
                                {"grace_until": {"$exists": False}},
                                {"grace_until": {"$lte": now}},
                            ]
                        },
                        {"$or": [{"expires_at": {"$lt": now}}, {"revoked": True}]},
                    ]
                }
            )
            if result.deleted_count > 0:
                logger.info("Cleaned up %s expired/revoked tokens", result.deleted_count)
        except Exception as e:
            logger.error("Error cleaning up tokens: %s", e)

    async def verify_refresh_token(
        self,
        token: str,
        *,
        expected_device_id: Optional[str] = None,
    ) -> Optional[dict[str, Optional[Any]]]:
        """Verify and return refresh token payload"""
        try:
            if not expected_device_id:
                logger.warning("Missing device id for refresh token verification")
                return None

            payload = jwt.decode(
                token,
                self.refresh_secret_key,
                algorithms=[self.algorithm],
                issuer="stk-verify-api",
                audience="stk-verify-client",
            )

            if payload.get("type") != "refresh":
                logger.warning("Token is not a refresh token")
                return None

            # Refresh rotation must only accept active tokens. Revoked tokens may
            # be retained briefly for cleanup/race tolerance, but they must not
            # mint a new session.
            token_hash = _hash_token(token)
            stored_token = await self.db.refresh_tokens.find_one(
                {
                    "$and": [
                        {
                            "$or": [
                                {"token_hash": token_hash},
                                # Backward compatibility with older records (migrate-on-read)
                                {"token": token},
                            ]
                        },
                        {"revoked": False},
                    ],
                    "expires_at": {"$gt": utc_now_naive()},
                }
            )

            if not stored_token:
                logger.warning("Refresh token not found or revoked")
                return None

            stored_device_id = stored_token.get("device_id")
            if not stored_device_id:
                logger.warning("Refresh token missing bound device id")
                return None
            if stored_device_id != expected_device_id:
                logger.warning("Refresh token device mismatch")
                return None

            # Opportunistic migration: replace raw token storage with hash.
            if stored_token.get("token") == token and not stored_token.get("token_hash"):
                try:
                    await self.db.refresh_tokens.update_one(
                        {"_id": stored_token["_id"]},
                        {"$set": {"token_hash": token_hash}, "$unset": {"token": ""}},
                    )
                except Exception:
                    logger.debug("Failed to migrate refresh token to hashed storage")

            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("Refresh token expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid refresh token: %s", e)
            return None

    async def revoke_token(self, token: str) -> bool:
        """Revoke a refresh token"""
        try:
            token_hash = _hash_token(token)
            result = await self.db.refresh_tokens.update_one(
                {"$or": [{"token_hash": token_hash}, {"token": token}]},
                {"$set": {"revoked": True, "revoked_at": utc_now_naive()}},
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error("Error revoking token: %s", e)
            return False

    async def revoke_all_user_tokens(
        self, username: str, grace_period_seconds: int = 0, *, raise_on_error: bool = False
    ) -> int:
        """Revoke all refresh tokens for a user"""
        try:
            now = utc_now_naive()
            update_data = {"revoked": True, "revoked_at": now}
            if grace_period_seconds > 0:
                update_data["grace_until"] = now + timedelta(seconds=grace_period_seconds)

            result = await self.db.refresh_tokens.update_many(
                {"username": username, "revoked": False},
                {"$set": update_data},
            )
            return result.modified_count
        except Exception as e:
            logger.error("Error revoking user tokens: %s", e)
            if raise_on_error:
                raise RefreshTokenPersistenceError(
                    "Failed to revoke existing refresh tokens"
                ) from e
            return 0

    async def refresh_access_token(
        self,
        refresh_token: str,
        *,
        expected_device_id: Optional[str] = None,
    ) -> Optional[dict[str, Optional[Any]]]:
        """Generate new access token from refresh token"""
        payload = await self.verify_refresh_token(
            refresh_token,
            expected_device_id=expected_device_id,
        )

        if not payload:
            return None

        username = payload.get("sub")
        role = payload.get("role")

        # Fetch user profile to include in response; keep failures non-fatal
        user_profile: Optional[dict[str, Optional[Any]]] = None
        if username:
            try:
                user_profile = await self.db.users.find_one({"username": username})
            except Exception as fetch_error:
                logger.warning("Failed to fetch user profile for refresh response: %s", fetch_error)

        # Rotate refresh token (issue new one, store it, revoke old one)
        new_refresh_token = self.create_refresh_token({"sub": username, "role": role})
        new_refresh_expires_at = utc_now_naive() + self.refresh_token_expiry
        if username:
            await self.store_refresh_token(
                new_refresh_token,
                str(username),
                new_refresh_expires_at,
            )
        await self.revoke_token(refresh_token)

        # Create new access token
        access_token = self.create_access_token({"sub": username, "role": role})

        expires_in_seconds = int(self.access_token_expiry.total_seconds())

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": expires_in_seconds,
            "user": {
                "username": str(username) if username else "",
                "full_name": (str(user_profile.get("full_name", "")) if user_profile else ""),
                "role": str(role) if role else "",
            },
        }
