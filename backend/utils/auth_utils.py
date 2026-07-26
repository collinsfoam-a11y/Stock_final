import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from passlib.context import CryptContext

from backend.auth.jwt_provider import jwt
from backend.config import settings

logger = logging.getLogger(__name__)

BCRYPT_MAX_PASSWORD_BYTES = 72
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128

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
            argon2__type="ID",
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


def _password_byte_length(password: str) -> int:
    return len(password.encode("utf-8"))


def validate_password(password: str) -> None:
    if password is None:
        raise ValueError("Password required")
    if not isinstance(password, str):
        raise TypeError("Password must be string")
    if len(password) < MIN_PASSWORD_LENGTH or len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError("Password length must be 8-128 characters")
    if password.strip() == "":
        raise ValueError("Password cannot be empty or whitespace")


def validate_pin(pin: str) -> None:
    if not isinstance(pin, str) or len(pin) != 4 or not pin.isdigit():
        raise ValueError("PIN must be exactly 4 digits")


def _is_bcrypt_hash(hashed_password: str) -> bool:
    return hashed_password.startswith(("$2a$", "$2b$", "$2x$", "$2y$"))


def identify_password_hash(hashed_password: str | None) -> str:
    if not hashed_password:
        return "unknown"
    try:
        scheme = pwd_context.identify(hashed_password)
    except Exception:
        scheme = None
    if scheme == "argon2":
        if hashed_password.startswith("$argon2id$"):
            return "argon2id"
        if hashed_password.startswith("$argon2i$"):
            return "argon2i"
        return "argon2"
    if scheme == "bcrypt" or _is_bcrypt_hash(hashed_password):
        return "bcrypt"
    return str(scheme) if scheme else "unknown"


def _default_password_hash_algorithm() -> str:
    try:
        scheme = pwd_context.default_scheme()
    except Exception:
        return "unknown"
    return "argon2id" if scheme == "argon2" else str(scheme)


def get_password_hash_metadata(hashed_password: str) -> dict[str, str]:
    return {"password_hash_algorithm": identify_password_hash(hashed_password)}


def password_hash_needs_upgrade(hashed_password: str | None) -> bool:
    if not hashed_password:
        return False
    if identify_password_hash(hashed_password) == "bcrypt":
        return _default_password_hash_algorithm() == "argon2id"
    try:
        return bool(pwd_context.needs_update(hashed_password))
    except Exception:
        return False


def _verify_secret(plain_secret: str | None, hashed_secret: str | None) -> bool:
    if not plain_secret or not hashed_secret:
        logger.warning("Empty password or hash provided")
        return False

    hash_algorithm = identify_password_hash(hashed_secret)
    password_bytes = plain_secret.encode("utf-8")
    if hash_algorithm == "bcrypt" and len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
        logger.warning("Password exceeds bcrypt 72-byte limit")
        return False

    # Strategy 1: Try passlib CryptContext (supports multiple schemes)
    try:
        result = pwd_context.verify(plain_secret, hashed_secret)
        if result:
            logger.debug("Password verified using passlib CryptContext")
        return bool(result)
    except Exception as e:
        logger.debug(f"Passlib verification failed: {type(e).__name__}: {e!s}")

    # Strategy 2: Direct bcrypt verification (fallback)
    if hash_algorithm == "bcrypt":
        return _verify_bcrypt_fallback(password_bytes, hashed_secret)
    return False


def verify_password(plain_password: str | None, hashed_password: str | None) -> bool:
    """
    Verify a password against a hash using multiple fallback strategies.

    Args:
        plain_password: The plain text password to verify
        hashed_password: The hashed password to compare against

    Returns:
        True if password matches, False otherwise
    """
    try:
        validate_password(plain_password)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return _verify_secret(plain_password, hashed_password)


def verify_pin_hash(pin: str | None, hashed_pin: str | None) -> bool:
    try:
        validate_pin(pin)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return False
    return _verify_secret(pin, hashed_pin)


def _verify_bcrypt_fallback(password_bytes: bytes, hashed_password: str) -> bool:
    try:
        import bcrypt

        if len(password_bytes) > BCRYPT_MAX_PASSWORD_BYTES:
            logger.warning("Password exceeds bcrypt 72-byte limit")
            return False
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


def _hash_secret(secret: str) -> str:
    if (
        _default_password_hash_algorithm() == "bcrypt"
        and _password_byte_length(secret) > BCRYPT_MAX_PASSWORD_BYTES
    ):
        raise ValueError("Password exceeds bcrypt 72-byte limit")
    return str(pwd_context.hash(secret))


def get_password_hash(password: str) -> str:
    """Hash a password using the configured context"""
    validate_password(password)
    return _hash_secret(password)


def get_pin_hash(pin: str) -> str:
    validate_pin(pin)
    return _hash_secret(pin)


def create_access_token(
    data: dict[str, Any],
    secret_key: str | None = None,
    algorithm: str | None = None,
    expires_delta: timedelta | None = None,
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

    to_encode.update(
        {
            "exp": expire,
            "type": "access",
            "iss": "stk-verify-api",
            "aud": "stk-verify-client",
        }
    )
    return str(jwt.encode(to_encode, key, algorithm=algo))
