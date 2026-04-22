import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from passlib.context import CryptContext

from backend.auth.jwt_provider import jwt
from backend.config import settings

logger = logging.getLogger(__name__)

# Security - Modern password hashing with Argon2 (OWASP recommended)
# Fallback to bcrypt-only if argon2 is not available
try:
    if os.getenv("TESTING", "false").lower() == "true":
        pwd_context = CryptContext(
            schemes=["pbkdf2_sha256"],
            deprecated="auto",
            pbkdf2_sha256__rounds=2000,
        )
        logger.info("Password hashing: Using pbkdf2_sha256 (testing config)")
    else:
        pwd_context = CryptContext(
            schemes=[
                "argon2",
                "bcrypt",
            ],
            deprecated="auto",
            argon2__memory_cost=65536,
            argon2__time_cost=3,
            argon2__parallelism=4,
        )
        try:
            import bcrypt

            probe_password = secrets.token_bytes(24)
            test_hash = bcrypt.hashpw(probe_password, bcrypt.gensalt())
            bcrypt.checkpw(probe_password, test_hash)
            logger.info("Password hashing: Using Argon2 with bcrypt fallback")
        except Exception as e:
            logger.warning(
                "Bcrypt backend check failed, using bcrypt-only context: %s",
                type(e).__name__,
            )
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception as e:
    logger.warning("Argon2 not available, using bcrypt-only: %s", type(e).__name__)
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = str(settings.JWT_SECRET)
ALGORITHM = str(settings.JWT_ALGORITHM) if settings.JWT_ALGORITHM else "HS256"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash using multiple fallback strategies.

    Args:
        plain_password: The plain text password to verify
        hashed_password: The hashed password to compare against

    Returns:
        True if password matches, False otherwise
    """
    if not plain_password or not hashed_password:
        logger.warning("Empty password or hash provided")
        return False

    # Bcrypt has a 72-byte limit, truncate if necessary
    password_bytes = plain_password.encode("utf-8")
    if len(password_bytes) > 72:
        logger.warning("Password exceeds 72 bytes, truncating")
        plain_password = plain_password[:72]
        password_bytes = plain_password.encode("utf-8")

    # Strategy 1: Try passlib CryptContext (supports multiple schemes)
    try:
        result = pwd_context.verify(plain_password, hashed_password)
        if result:
            logger.debug("Password verified using passlib CryptContext")
        return bool(result)
    except Exception as e:
        logger.debug(f"Passlib verification failed: {type(e).__name__}: {str(e)}")

    # Strategy 2: Direct bcrypt verification (fallback)
    return _verify_bcrypt_fallback(password_bytes, hashed_password)


def _verify_bcrypt_fallback(password_bytes: bytes, hashed_password: str) -> bool:
    try:
        import bcrypt

        if isinstance(hashed_password, str):
            hash_bytes = hashed_password.encode("utf-8")
            result = bcrypt.checkpw(password_bytes, hash_bytes)
            if result:
                logger.debug("Password verified using direct bcrypt")
            return bool(result)
        else:
            logger.error("Password hash is not a string: %s", type(hashed_password))
            return False
    except ImportError:
        logger.error("bcrypt module not available - password verification cannot proceed")
        return False
    except Exception as e:
        logger.error(
            "Direct bcrypt verification failed: %s: %s",
            type(e).__name__,
            str(e),
        )
        return False


def get_password_hash(password: str) -> str:
    """Hash a password using the configured context"""
    if not password:
        return str(pwd_context.hash(""))

    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        password = password_bytes[:72].decode("utf-8", errors="ignore")
    return str(pwd_context.hash(password))


def create_access_token(
    data: dict[str, Any],
    secret_key: Optional[str] = None,
    algorithm: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT access token from user data"""
    # Use settings.JWT_SECRET directly to ensure we get the latest value (e.g. during tests)
    key = secret_key if secret_key else str(settings.JWT_SECRET)
    algo = algorithm if algorithm else str(settings.JWT_ALGORITHM)

    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15)
        )

    to_encode.update({"exp": expire, "type": "access"})
    return str(jwt.encode(to_encode, key, algorithm=algo))
