import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, cast

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.api.schemas import (
    ApiResponse,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordResetVerify,
    PinLogin,
    PinSetup,
    TokenResponse,
    UserLogin,
    UserRegister,
)
from backend.auth.dependencies import auth_deps, get_current_user
from backend.auth.permissions import get_user_permissions
from backend.auth.cookies import set_auth_cookies
from backend.config import settings
from backend.db.runtime import get_db
from backend.error_messages import get_error_message
from backend.exceptions import (
    AuthenticationError,
    AuthorizationError,
    DatabaseConnectionError,
    NotFoundError,
    RateLimitError,
)
from backend.models.audit import AuditEventType, AuditLogStatus
from backend.services.otp_service import OTPService
from backend.services.runtime import get_cache_service, get_refresh_token_service
from backend.services.whatsapp_service import WhatsAppDeliveryError, WhatsAppService
from backend.utils.api_utils import result_to_response, sanitize_for_logging
from backend.utils.auth_utils import create_access_token, get_password_hash, verify_password
from backend.utils.crypto_utils import get_pin_lookup_hash
from backend.utils.result import Fail, Ok, Result

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_request_user_agent(request: Request) -> Optional[str]:
    return request.headers.get("user-agent")


def _get_request_device_id(request: Request) -> Optional[str]:
    return request.headers.get("x-device-id")


# Helper functions for login


async def check_rate_limit(ip_address: str) -> Result[bool, Exception]:
    """
    Check if the IP has exceeded the login attempt limit.

    Rate limiting is configurable via RATE_LIMIT_ENABLED environment variable.
    Default: Enabled in production, disabled in development.
    """
    cache_service = get_cache_service()
    # Check if rate limiting is enabled (default: True for production)
    rate_limit_enabled = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

    if not rate_limit_enabled:
        logger.debug(f"Rate limiting disabled for IP: {ip_address}")
        return Ok(True)

    namespace = "login_attempts"
    key = ip_address

    # Get current attempt count
    attempts = (await cache_service.get(namespace, key)) or 0
    try:
        attempts = int(attempts)
    except (ValueError, TypeError):
        attempts = 0

    # Configuration: max attempts and TTL
    max_attempts = int(getattr(settings, "RATE_LIMIT_MAX_ATTEMPTS", 5))
    ttl_seconds = int(getattr(settings, "RATE_LIMIT_TTL_SECONDS", 300))

    if attempts >= max_attempts:
        # Block for configured TTL period
        await cache_service.set(namespace, key, attempts, ttl=ttl_seconds)
        logger.warning(f"Rate limit exceeded for IP {ip_address}: {attempts} attempts")
        return Fail(
            RateLimitError(
                f"Too many login attempts. Please try again in {ttl_seconds // 60} minutes.",
                retry_after=ttl_seconds,
            )
        )

    # Increment attempt counter with TTL
    await cache_service.set(namespace, key, attempts + 1, ttl=ttl_seconds)
    logger.debug(
        f"Rate limit check passed for IP {ip_address}: {attempts + 1}/{max_attempts} attempts"
    )
    return Ok(True)


async def reset_rate_limit(ip_address: str) -> None:
    """Clear rate-limit counters for an IP after successful auth."""
    cache_service = get_cache_service()
    try:
        await cache_service.delete("login_attempts", ip_address)
    except Exception as exc:
        logger.debug(f"Failed to reset rate limit for {ip_address}: {exc}")


async def find_user_by_username(username: str) -> Result[dict[str, Any], Exception]:
    """Find a user by username with error handling."""
    db = get_db()
    try:
        user = await db.users.find_one({"username": username})
        if not user:
            return Fail(NotFoundError("User not found"))
        return Ok(user)
    except Exception as e:
        logger.error(f"Error finding user {sanitize_for_logging(username)}: {str(e)}")
        return Fail(DatabaseConnectionError("Error accessing user data"))


def _build_password_reset_query(
    username: Optional[str] = None, phone_number: Optional[str] = None
) -> dict[str, Any]:
    if username:
        return {"username": username}
    if phone_number:
        return {"phone_number": phone_number}
    return {}


async def generate_auth_tokens(
    user: dict[str, Any], ip_address: str, request: Request
) -> Result[dict[str, Any], Exception]:
    """Generate access and refresh tokens with error handling."""
    refresh_token_service = get_refresh_token_service()
    try:
        # Generate access token
        access_token_expires = timedelta(
            minutes=getattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15)
        )
        access_token = create_access_token(
            {"sub": user["username"], "role": user.get("role", "staff")},
            secret_key=auth_deps.secret_key,
            algorithm=auth_deps.algorithm,
            expires_delta=access_token_expires,
        )

        # Generate refresh token using service
        refresh_payload = {"sub": user["username"], "role": user.get("role", "staff")}
        refresh_token = refresh_token_service.create_refresh_token(refresh_payload)
        refresh_token_expires = datetime.now(timezone.utc) + timedelta(
            days=getattr(settings, "REFRESH_TOKEN_EXPIRE_DAYS", 30)
        )

        # Store refresh token via service
        await refresh_token_service.store_refresh_token(
            refresh_token,
            user["username"],
            refresh_token_expires,
            ip_address=ip_address,
            user_agent=_get_request_user_agent(request),
            device_id=_get_request_device_id(request),
        )

        return Ok(
            {
                "access_token": access_token,
                "refresh_token": refresh_token,
                "expires_in": int(access_token_expires.total_seconds()),
            }
        )
    except Exception as e:
        logger.error(f"Error generating auth tokens: {str(e)}")
        return Fail(DatabaseConnectionError("Error generating authentication tokens"))


async def get_active_session_record(username: str) -> Result[dict[str, Any], Exception]:
    """
    Return the newest active refresh-token session for a user, if any.

    Result.ok() does not accept None, so an empty dict is used as the
    "no active session" sentinel and consumed via truthiness checks.
    """
    if not getattr(settings, "AUTH_SINGLE_SESSION", True):
        return Ok({})

    db = get_db()
    try:
        # One active session = any valid, unrevoked refresh token
        active_token = await db.refresh_tokens.find_one(
            {
                "username": username,
                "revoked": False,
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            },
            sort=[("created_at", -1)],
        )
        return Ok(active_token or {})
    except Exception as e:
        logger.error(
            "Error checking active sessions",
            extra={"username": sanitize_for_logging(username), "error": str(e)},
        )
        # In case of DB error, we fail open for safety of service but log heavily
        return Ok({})


async def check_for_active_session(username: str) -> Result[bool, Exception]:
    """Check if the user already has an active session."""
    result = await get_active_session_record(username)
    if result.is_err:
        return cast(Result[bool, Exception], result)
    return Ok(bool(result.unwrap()))


def _session_belongs_to_current_client(
    session: dict[str, Any], request: Request, client_ip: str
) -> bool:
    request_device_id = _get_request_device_id(request)
    session_device_id = session.get("device_id")
    if request_device_id and session_device_id:
        return request_device_id == session_device_id

    session_ip = session.get("ip_address")
    if client_ip and session_ip and session_ip != client_ip:
        return False

    request_user_agent = _get_request_user_agent(request)
    session_user_agent = session.get("user_agent")
    if request_user_agent and session_user_agent:
        return session_user_agent == request_user_agent

    # Older sessions or automation clients may not persist complete client
    # metadata. If the IP still matches, treat it as the same client so
    # reauthentication is logged as routine rather than suspicious.
    return bool(client_ip and session_ip and session_ip == client_ip)


async def _resolve_session_conflict(username: str) -> Result[int, Exception]:
    """
    Revoke existing refresh tokens for a user so they can log in again.

    This preserves single-session semantics by allowing the newest login
    and invalidating older sessions.
    """
    try:
        refresh_token_service = get_refresh_token_service()
        revoked_count = await refresh_token_service.revoke_all_user_tokens(username)
        return Ok(revoked_count)
    except Exception as e:
        logger.error(
            "Failed to resolve session conflict",
            extra={"username": sanitize_for_logging(username), "error": str(e)},
        )
        return Fail(DatabaseConnectionError("Failed to resolve existing session"))


async def _ensure_single_session_for_login(
    username: str, request: Request, client_ip: str
) -> Result[dict[str, Any], Exception]:
    active_session_result = await get_active_session_record(username)
    if active_session_result.is_err:
        return cast(Result[dict[str, Any], Exception], active_session_result)

    active_session = active_session_result.unwrap()
    if not active_session:
        return Ok({})

    same_client = _session_belongs_to_current_client(active_session, request, client_ip)
    revoke_result = await _resolve_session_conflict(username)
    if revoke_result.is_err:
        return cast(Result[dict[str, Any], Exception], revoke_result)

    revoked_count = revoke_result.unwrap()
    log_method = logger.info if same_client else logger.warning
    log_method(
        "Resolved existing active session before issuing new login",
        extra={
            "username": sanitize_for_logging(username),
            "revoked_count": revoked_count,
            "same_client": same_client,
        },
    )
    return Ok({"same_client": same_client, "revoked_count": revoked_count})


async def log_failed_login_attempt(
    username: str, ip_address: str, user_agent: Optional[str], error: str
) -> None:
    """Log a failed login attempt."""
    db = get_db()
    try:
        await db.login_attempts.insert_one(
            {
                "username": username,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "success": False,
                "timestamp": datetime.now(timezone.utc),
                "error": error,
            }
        )
    except Exception as e:
        logger.error(f"Failed to log login attempt: {str(e)}")

    # Audit Log
    try:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(db)
        await audit_service.log_event(
            event_type=AuditEventType.AUTH_LOGIN_FAILED,
            status=AuditLogStatus.FAILURE,
            actor_username=username,
            ip_address=ip_address,
            details={"error": error, "user_agent": user_agent},
        )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


async def log_successful_login(user: dict[str, Any], ip_address: str, request: Request) -> None:
    """Log a successful login."""
    db = get_db()
    try:
        await db.login_attempts.insert_one(
            {
                "user_id": user["_id"],
                "username": user["username"],
                "ip_address": ip_address,
                "user_agent": request.headers.get("user-agent"),
                "success": True,
                "timestamp": datetime.now(timezone.utc),
            }
        )

        # Update last login timestamp
        await db.users.update_one(
            {"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}}
        )
    except Exception as e:
        logger.error(f"Failed to log successful login: {str(e)}")

    # Audit Log
    try:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(db)
        await audit_service.log_event(
            event_type=AuditEventType.AUTH_LOGIN_SUCCESS,
            status=AuditLogStatus.SUCCESS,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            ip_address=ip_address,
            details={"user_agent": request.headers.get("user-agent")},
        )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


@router.post("/auth/register", response_model=TokenResponse, status_code=201)
async def register(user: UserRegister, response: Response):
    """
    Register a new user.
    """
    db = get_db()
    refresh_token_service = get_refresh_token_service()
    try:
        # Check if user already exists
        existing_user = await db.users.find_one({"username": user.username})
        if existing_user:
            error = get_error_message("AUTH_USERNAME_EXISTS", {"username": user.username})
            raise HTTPException(
                status_code=error["status_code"],
                detail={
                    "message": error["message"],
                    "detail": error["detail"],
                    "code": error["code"],
                    "category": error["category"],
                },
            )

        # Create user
        hashed_password = get_password_hash(user.password)
        user_dict: Dict[str, Any] = {
            "username": user.username,
            "hashed_password": hashed_password,
            "full_name": user.full_name,
            "role": user.role,
            "employee_id": user.employee_id,
            "phone": user.phone,
            "is_active": True,
            "permissions": [],
            "created_at": datetime.now(timezone.utc),
        }

        insert_result = await auth_deps.db.users.insert_one(user_dict)

        user_doc = user_dict  # Renaming for consistency with original code's later use
        user_doc["_id"] = insert_result.inserted_id
        logger.info(
            f"User registered: {sanitize_for_logging(user.username)} ({sanitize_for_logging(user.role)})"
        )

        # Create access and refresh tokens
        logger.info("Generating tokens for newly registered user")
        access_token = create_access_token(
            data={"sub": user.username, "role": user.role},
            secret_key=auth_deps.secret_key,
            algorithm=auth_deps.algorithm,
            expires_delta=timedelta(minutes=15),
        )
        refresh_token = refresh_token_service.create_refresh_token(
            {"sub": user.username, "role": user.role}
        )

        logger.info("Tokens generated successfully")

        # Store refresh token in database
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)
        await refresh_token_service.store_refresh_token(refresh_token, user.username, expires_at)
        set_auth_cookies(response, access_token, refresh_token)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 900,  # 15 minutes
            "user": {
                "id": str(user_doc["_id"]),
                "username": user.username,
                "full_name": user.full_name,
                "role": user.role,
                "email": None,
                "employee_id": user.employee_id,
                "phone": user.phone,
                "is_active": True,
                "permissions": [],
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        error = get_error_message("UNKNOWN_ERROR", {"operation": "register", "error": str(e)})
        logger.error(f"Registration error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=error["status_code"],
            detail={
                "message": error["message"],
                "detail": f"{error['detail']} Original error: {str(e)}",
                "code": error["code"],
                "category": error["category"],
            },
        )


async def _check_login_rate_limit(client_ip: str) -> Optional[Result[Any, Exception]]:
    logger.debug(f"Checking rate limit for IP: {client_ip}")
    rate_limit_result = await check_rate_limit(client_ip)
    if rate_limit_result.is_err:
        # Extract error from Result type
        err = None
        if hasattr(rate_limit_result, "unwrap_err"):
            try:
                err = rate_limit_result.unwrap_err()
            except Exception as e:
                logger.error(f"Failed to unwrap rate limit error: {e}")
        if err is None:
            err = getattr(rate_limit_result, "err", None)
        if err is None:
            err = getattr(rate_limit_result, "_error", None)
        if err is None:
            err = RateLimitError("Rate limit exceeded")

        if isinstance(err, RateLimitError):
            return Fail(err)
        return Fail(RateLimitError(str(err)))
    logger.debug("Rate limit check passed")
    return None


def _validate_user_password(
    credentials: UserLogin, user: dict[str, Any]
) -> Result[bool, Exception]:
    hashed_pwd = user.get("hashed_password") or user.get("password")
    if not hashed_pwd:
        logger.error("No hashed_password or password field found!")
        return Fail(AuthenticationError("User account is corrupted. Please contact support."))

    try:
        if verify_password(credentials.password, hashed_pwd):
            return Ok(True)
    except Exception as e:
        logger.error(f"Password verification exception: {e}")

    return Fail(AuthenticationError("Incorrect username or password"))


@router.post("/auth/login", response_model=ApiResponse[TokenResponse])
@result_to_response(success_status=200)
async def login(
    credentials: UserLogin,
    request: Request,
    response: Response,
) -> Result[dict[str, Any], Exception]:
    """
    User login endpoint with enhanced security and monitoring.

    Validates user credentials and returns an access token with refresh token.
    Implements rate limiting, IP tracking, and detailed logging.
    """
    db = get_db()
    cache_service = get_cache_service()

    client_ip = request.client.host if request.client else ""
    logger.debug(
        "Login attempt received",
        extra={
            "username": sanitize_for_logging(credentials.username),
            "client_ip": client_ip,
        },
    )

    try:
        # Check rate limiting
        rate_limit_fail = await _check_login_rate_limit(client_ip)
        if rate_limit_fail:
            return rate_limit_fail

        # Find user
        user_result = await find_user_by_username(credentials.username)
        if user_result.is_err:
            return await _handle_login_failure(
                credentials.username,
                client_ip,
                request,
                "User not found",
                "Incorrect username or password",
            )

        user = user_result.unwrap()

        # Verify password
        pwd_result = _validate_user_password(credentials, user)
        if pwd_result.is_err:
            return await _handle_login_failure(
                credentials.username,
                client_ip,
                request,
                "Invalid password",
                pwd_result._error,
            )

        # Handle legacy password migration (fire and forget)
        await _migrate_legacy_password(db, user, credentials.password)

        # Check active status
        if not user.get("is_active", True):
            logger.error("User account is deactivated")
            return Fail(AuthorizationError("Account is deactivated. Please contact support."))

        # Check for active session conflict (Phase 1 Governance)
        # Strict Single Session Enforcement:
        # Block second login attempt with 409 Conflict
        if getattr(settings, "AUTH_SINGLE_SESSION", True):
            session_resolution = await _ensure_single_session_for_login(
                credentials.username,
                request,
                client_ip,
            )
            if session_resolution.is_err:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "AUTH_SESSION_CONFLICT",
                        "message": "Unable to recover the existing active session",
                    },
                )

        # Generate tokens
        tokens_result = await generate_auth_tokens(user, client_ip, request)
        if tokens_result.is_err:
            return tokens_result

        tokens = tokens_result.unwrap()
        set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])

        # Log success and cleanup
        await log_successful_login(user, client_ip, request)
        await cache_service.delete("login_attempts", client_ip)

        logger.info(
            "Login succeeded",
            extra={"role": sanitize_for_logging(user.get("role", "unknown"))},
        )
        return Ok(_build_login_response(tokens, user))

    except HTTPException:
        raise  # Let HTTPException pass through with proper status code
    except Exception as e:
        logger.exception("Login failed unexpectedly")
        return Fail(e)


async def _find_user_by_fast_lookup(
    db: Any, pin: str, lookup_hash: str
) -> Optional[dict[str, Any]]:
    """Find user via O(1) fast PIN lookup hash."""
    found_user = await db.users.find_one({"pin_lookup_hash": lookup_hash})
    if not found_user:
        return None
    # Verify secure hash to protect against SHA-256 collision
    if not verify_password(pin, found_user.get("pin_hash", "")):
        logger.warning(f"Hash collision or data corruption for user {found_user.get('username')}")
        return None
    return found_user


async def _find_user_by_legacy_scan(
    db: Any, pin: str, lookup_hash: str
) -> Optional[dict[str, Any]]:
    """Find user via O(N) legacy PIN scan with opportunistic migration."""
    users_with_pin = await db.users.find({"pin_hash": {"$exists": True}}).to_list(length=1000)
    for user in users_with_pin:
        if verify_password(pin, user.get("pin_hash", "")):
            # Opportunistic migration for next time
            try:
                await db.users.update_one(
                    {"_id": user["_id"]}, {"$set": {"pin_lookup_hash": lookup_hash}}
                )
                logger.info(f"Migrated user {user['username']} to fast PIN lookup")
            except Exception as e:
                logger.warning(f"Failed to migrate user to fast PIN lookup: {e}")
            return user
    return None


async def _find_user_by_pin(
    db: Any, pin: str, username: Optional[str] = None
) -> Optional[dict[str, Any]]:
    """Find user by PIN using scoped lookup or fast lookup with legacy fallback."""
    if username:
        # Strategy 0: Username-scoped O(1) Lookup (Most secure)
        user = await db.users.find_one({"username": username})
        if user and user.get("pin_hash") and verify_password(pin, user["pin_hash"]):
            return user
        return None

    lookup_hash = get_pin_lookup_hash(pin)

    # Strategy 1: O(1) Fast Lookup
    found_user = await _find_user_by_fast_lookup(db, pin, lookup_hash)
    if found_user:
        return found_user

    # Strategy 2: O(N) Legacy Fallback
    logger.debug("Fast lookup failed, falling back to legacy scan...")
    return await _find_user_by_legacy_scan(db, pin, lookup_hash)


@router.post("/auth/login-pin", response_model=ApiResponse[TokenResponse])
@result_to_response(success_status=200)
async def login_with_pin(
    credentials: PinLogin,
    request: Request,
    response: Response,
) -> Result[dict[str, Any], Exception]:
    """
    Staff PIN login endpoint (4-digit numeric PIN).

    For staff users to quickly login with their PIN instead of username/password.
    PIN is stored as a hashed value in the user document.
    """
    db = get_db()
    cache_service = get_cache_service()
    pin = credentials.pin
    client_ip = request.client.host if request.client else ""

    logger.debug(
        "PIN login attempt received",
        extra={
            "client_ip": client_ip,
            "username_scoped": bool(credentials.username),
        },
    )

    # Validate PIN format (4-digit numeric)
    if not pin or len(pin) != 4 or not pin.isdigit():
        logger.warning(f"Invalid PIN format from IP: {client_ip}")
        return Fail(AuthenticationError("Invalid PIN format. PIN must be 4 digits."))
    if not credentials.username:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "USERNAME_REQUIRED_FOR_PIN_LOGIN",
                "message": "Username is required for PIN login. Login with credentials first.",
            },
        )

    try:
        # Check rate limiting
        rate_limit_fail = await _check_login_rate_limit(client_ip)
        if rate_limit_fail:
            return rate_limit_fail

        # Find user by PIN
        found_user = await _find_user_by_pin(db, pin, credentials.username)

        if not found_user:
            logger.warning(f"No user found with matching PIN from IP: {client_ip}")
            await log_failed_login_attempt(
                username=credentials.username or "PIN_LOGIN",
                ip_address=client_ip,
                user_agent=request.headers.get("user-agent"),
                error="Invalid PIN",
            )
            return Fail(AuthenticationError("Invalid PIN"))

        # Check active status
        if not found_user.get("is_active", True):
            logger.error("User account is deactivated")
            return Fail(AuthorizationError("Account is deactivated. Please contact support."))

        # Check for active session conflict (Phase 1 Governance)
        # Strict Single Session Enforcement:
        # Block second login attempt with 409 Conflict
        if getattr(settings, "AUTH_SINGLE_SESSION", True):
            session_resolution = await _ensure_single_session_for_login(
                found_user["username"],
                request,
                client_ip,
            )
            if session_resolution.is_err:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "AUTH_SESSION_CONFLICT",
                        "message": "Unable to recover the existing active session",
                    },
                )

        # Generate tokens
        tokens_result = await generate_auth_tokens(found_user, client_ip, request)
        if tokens_result.is_err:
            return tokens_result

        tokens = tokens_result.unwrap()
        set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])

        # Log success and cleanup
        await log_successful_login(found_user, client_ip, request)
        await cache_service.delete("login_attempts", client_ip)

        logger.info("PIN login succeeded")
        return Ok(_build_login_response(tokens, found_user))

    except HTTPException:
        raise  # Let HTTPException pass through with proper status code
    except Exception as e:
        logger.exception("PIN login failed unexpectedly")
        return Fail(e)


@router.post("/auth/pin-setup", response_model=ApiResponse[dict[str, Any]])
@result_to_response(success_status=201)
async def pin_setup(
    setup_data: PinSetup, current_user: dict = Depends(get_current_user)
) -> Result[dict[str, Any], Exception]:
    """
    Set or update user's 4-digit PIN.
    The PIN is hashed using Argon2 and a O(1) lookup hash is also stored.
    """
    db = get_db()
    username = current_user["username"]
    pin = setup_data.pin

    logger.info(f"PIN setup started for user: {username}")

    try:
        # Securely hash the PIN
        hashed_pin = get_password_hash(pin)
        # Generate the lookup hash for fast search
        lookup_hash = get_pin_lookup_hash(pin)

        # Update user document
        result = await db.users.update_one(
            {"username": username},
            {
                "$set": {
                    "pin_hash": hashed_pin,
                    "pin_lookup_hash": lookup_hash,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        if result.modified_count == 0:
            logger.warning(f"PIN setup failed: User {username} not found for update")
            return Fail(NotFoundError("User not found"))

        # Audit Log
        try:
            from backend.services.audit_service import AuditService

            audit_service = AuditService(db)
            await audit_service.log_event(
                event_type=AuditEventType.AUTH_PIN_SETUP,
                status=AuditLogStatus.SUCCESS,
                actor_id=str(current_user["_id"]),
                actor_username=username,
                details={"action": "pin_setup"},
            )
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

        logger.info(f"PIN setup successful for user: {username}")
        return Ok({"message": "PIN setup successful"})

    except Exception as e:
        logger.error(f"Error during PIN setup for {username}: {str(e)}")
        return Fail(e)


async def _handle_login_failure(
    username: str, client_ip: str, request: Request, log_error: str, return_error: Any
) -> Result[Any, Exception]:
    """Helper to log failure and return error result."""
    logger.warning(
        "Login failed",
        extra={
            "username": sanitize_for_logging(username),
            "client_ip": client_ip,
            "reason": log_error,
        },
    )
    await log_failed_login_attempt(
        username=username,
        ip_address=client_ip,
        user_agent=request.headers.get("user-agent"),
        error=log_error,
    )
    if isinstance(return_error, str):
        return Fail(AuthenticationError(return_error))
    return Fail(cast(Exception, return_error))


async def _migrate_legacy_password(db: Any, user: dict[str, Any], password: str) -> None:
    """Helper to migrate legacy password field."""
    if "password" in user and "hashed_password" not in user:
        try:
            await db.users.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {"hashed_password": get_password_hash(password)},
                    "$unset": {"password": ""},
                },
            )
        except Exception as e:
            logger.error(f"Failed to migrate legacy password for user {user.get('_id')}: {e}")


def _build_login_response(tokens: dict[str, Any], user: dict[str, Any]) -> dict[str, Any]:
    """Helper to build the login response dictionary."""
    return {
        "access_token": tokens["access_token"],
        "token_type": "bearer",
        "expires_in": tokens["expires_in"],
        "refresh_token": tokens["refresh_token"],
        "user": {
            "id": str(user["_id"]),
            "username": user["username"],
            "full_name": user.get("full_name", ""),
            "role": user.get("role", "staff"),
            "email": user.get("email"),
            "is_active": user.get("is_active", True),
            "permissions": get_user_permissions(user),
            "has_pin": bool(user.get("pin_hash")),
        },
    }


@router.get("/auth/me")
async def get_me(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    return {
        "id": str(current_user["_id"]),
        "username": current_user["username"],
        "full_name": current_user.get("full_name", ""),
        "role": current_user["role"],
        "email": current_user.get("email"),
        "is_active": current_user.get("is_active", True),
        "permissions": get_user_permissions(current_user),
        "has_pin": bool(current_user.get("pin_hash")),
    }


@router.get("/auth/heartbeat")
async def heartbeat(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Session heartbeat endpoint.
    Returns current session status and user information.
    """
    from datetime import datetime, timezone

    return {
        "success": True,
        "data": {
            "status": "alive",
            "username": current_user["username"],
            "user_id": str(current_user["_id"]),
            "session_valid": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    }


@router.post("/auth/change-pin")
async def change_pin(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Change user PIN.
    Validates current PIN or current password before allowing change.
    """
    body = await request.json()
    current_pin = body.get("current_pin")
    current_password = body.get("current_password")
    new_pin = body.get("new_pin")

    if not new_pin:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_FIELDS",
                "message": "new_pin is required",
            },
        )

    # Validate new PIN format (must be 4 digits)
    if not new_pin.isdigit() or len(new_pin) != 4:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_PIN_FORMAT",
                "message": "PIN must be exactly 4 digits",
            },
        )

    # Check for weak PINs (sequential, repeated, common)
    weak_pins = [
        "1234",
        "0000",
        "1111",
        "2222",
        "3333",
        "4444",
        "5555",
        "6666",
        "7777",
        "8888",
        "9999",
        "4321",
    ]
    if new_pin in weak_pins:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "WEAK_PIN",
                "message": "PIN is too weak. Avoid sequential or repeated digits.",
            },
        )

    # Verify identity
    db = get_db()
    user = await db.users.find_one({"username": current_user["username"]})

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # If verifying via current_password
    if current_password:
        if "hashed_password" not in user:
            # Legacy or weird state
            raise HTTPException(status_code=400, detail="Cannot verify password")
        if not verify_password(current_password, user["hashed_password"]):
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "WRONG_Current_PASSWORD",
                    "message": "Current password is incorrect",
                },
            )

    # If verifying via current_pin
    elif current_pin:
        if "pin_hash" not in user:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "NO_PIN_SET",
                    "message": "No PIN is currently set. Use password to set a new PIN.",
                },
            )
        if not verify_password(current_pin, user["pin_hash"]):
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "WRONG_CURRENT_PIN",
                    "message": "Current PIN is incorrect",
                },
            )
    else:
        # Neither provided
        # If user has no PIN, they MUST provide password to set it
        # If user has a PIN, they must provide one of them
        if "pin_hash" in user:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "AUTH_REQUIRED",
                    "message": "Please provide current_pin or current_password",
                },
            )
        else:
            # Even if no PIN is set, we prefer they verify password for sensitive action
            # But if that's the only way... let's enforce password if they have one.
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "AUTH_REQUIRED",
                    "message": "Please provide current_password to set a PIN",
                },
            )

    # Update PIN
    from backend.utils.crypto_utils import get_pin_lookup_hash

    new_pin_hash = get_password_hash(new_pin)
    pin_lookup_hash = get_pin_lookup_hash(new_pin)

    await db.users.update_one(
        {"username": current_user["username"]},
        {
            "$set": {
                "pin_hash": new_pin_hash,
                "pin_lookup_hash": pin_lookup_hash,
                "updated_at": datetime.now(),
            }
        },
    )

    logger.info(f"PIN changed for user: {current_user['username']}")

    # Audit Log
    try:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(db)
        await audit_service.log_event(
            event_type=AuditEventType.AUTH_PIN_SETUP,
            status=AuditLogStatus.SUCCESS,
            actor_id=str(current_user["_id"]),
            actor_username=current_user["username"],
            details={"action": "response_change_pin"},
        )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

    return {
        "success": True,
        "message": "PIN changed successfully",
    }


@router.post("/auth/change-password")
async def change_password(
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Change user password.
    Validates current password before allowing change.
    """
    body = await request.json()
    current_password = body.get("current_password")
    new_password = body.get("new_password")

    if not current_password or not new_password:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_FIELDS",
                "message": "Both current_password and new_password are required",
            },
        )

    # Validate new password strength
    if len(new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "WEAK_PASSWORD",
                "message": "Password must be at least 8 characters",
            },
        )

    # Verify current password
    db = get_db()
    user = await db.users.find_one({"username": current_user["username"]})

    if not user or "hashed_password" not in user:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "NO_PASSWORD_SET",
                "message": "No password is currently set for this user",
            },
        )

    if not verify_password(current_password, user["hashed_password"]):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "WRONG_CURRENT_PASSWORD",
                "message": "Current password is incorrect",
            },
        )

    # Update password
    new_password_hash = get_password_hash(new_password)
    await db.users.update_one(
        {"username": current_user["username"]},
        {"$set": {"hashed_password": new_password_hash, "updated_at": datetime.now()}},
    )

    logger.info(f"Password changed for user: {current_user['username']}")

    return {
        "success": True,
        "message": "Password changed successfully",
    }


@router.post("/auth/password-reset/request", response_model=ApiResponse[dict])
async def password_reset_request(request: PasswordResetRequest):
    """
    Request a password reset OTP.
    Sends an OTP to the user's registered phone number via WhatsApp.
    payload: { "username": "..." } or { "phone_number": "..." }
    """
    db = get_db()
    otp_service = OTPService(db)
    whatsapp_service = WhatsAppService()

    await otp_service.initialize()

    if not whatsapp_service.is_delivery_configured():
        logger.error("Password reset requested while WhatsApp delivery is unavailable")
        return ApiResponse.error_response(
            {
                "message": (
                    "Password reset is temporarily unavailable because phone delivery is not configured."
                )
            }
        )

    # Find user
    query = _build_password_reset_query(
        username=request.username,
        phone_number=request.phone_number,
    )
    user = await db.users.find_one(query)

    if not user:
        # Security: Do not reveal user existence
        # Fake success with random delay
        return ApiResponse.success_response(
            {"message": "If an account exists, an OTP has been sent."}
        )

    if not user.get("phone_number"):
        # If user has no phone number, we can't send OTP.
        # Ideally we should fallback to email or tell generic success.
        # For this Phase 4 requirement, we assume phone is needed.
        return ApiResponse.success_response(
            {"message": "If an account exists, an OTP has been sent."}
        )

    try:
        # Generate OTP
        otp_code = await otp_service.create_otp(str(user["_id"]))

        # Send via WhatsApp
        await whatsapp_service.send_otp(user["phone_number"], otp_code)

        # Audit Log
        try:
            from backend.services.audit_service import AuditService

            audit_service = AuditService(db)
            await audit_service.log_event(
                event_type=AuditEventType.AUTH_PASSWORD_RESET_REQUEST,
                status=AuditLogStatus.SUCCESS,
                actor_id=str(user["_id"]),
                actor_username=user["username"],
                details={"phone_number": user["phone_number"]},
            )
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

        return ApiResponse.success_response(
            {"message": "If an account exists, an OTP has been sent."}
        )
    except WhatsAppDeliveryError as e:
        await otp_service.otp_collection.delete_many({"user_id": str(user["_id"])})
        logger.error(f"Password reset request delivery failed: {e}")
        return ApiResponse.error_response(
            {"message": "Password reset is temporarily unavailable. Please try again later."}
        )
    except Exception as e:
        await otp_service.otp_collection.delete_many({"user_id": str(user["_id"])})
        logger.error(f"Password reset request failed: {e}")
        return ApiResponse.error_response({"message": "Failed to process request"})


@router.post("/auth/password-reset/verify", response_model=ApiResponse[dict])
async def password_reset_verify(data: PasswordResetVerify):
    """
    Verify the OTP code.
    Returns a short-lived reset token if successful.
    """
    db = get_db()
    otp_service = OTPService(db)
    await otp_service.initialize()

    query = _build_password_reset_query(
        username=data.username,
        phone_number=data.phone_number,
    )
    user = await db.users.find_one(query)
    if not user:
        return ApiResponse.error_response({"message": "Invalid request"})

    success, message = await otp_service.verify_otp(str(user["_id"]), data.otp)

    if not success:
        return ApiResponse.error_response({"message": message})

    # Generate reset token
    reset_token = await otp_service.create_reset_token(str(user["_id"]))

    # Audit Log
    try:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(db)
        await audit_service.log_event(
            event_type=AuditEventType.AUTH_PASSWORD_RESET_VERIFY,
            status=AuditLogStatus.SUCCESS,
            actor_id=str(user["_id"]),
            actor_username=user["username"],
            details={"otp_verified": True},
        )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

    return ApiResponse.success_response({"reset_token": reset_token, "message": "OTP verified"})


@router.post("/auth/password-reset/confirm", response_model=ApiResponse[dict])
async def password_reset_confirm(data: PasswordResetConfirm):
    """
    Reset password using a valid reset token.
    """
    db = get_db()
    otp_service = OTPService(db)
    whatsapp_service = WhatsAppService()
    await otp_service.initialize()

    user_id = await otp_service.validate_reset_token(data.reset_token)

    if not user_id:
        return ApiResponse.error_response({"message": "Invalid or expired reset token"})

    try:
        from bson import ObjectId

        hashed_password = get_password_hash(data.new_password)

        await db.users.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        # Optional: confirmation should not block a successful password reset
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if user and user.get("phone_number"):
            try:
                if whatsapp_service.is_delivery_configured():
                    await whatsapp_service.send_password_reset_confirmation(user["phone_number"])
            except WhatsAppDeliveryError as delivery_error:
                logger.warning(f"Password reset confirmation delivery skipped: {delivery_error}")

        # Audit Log
        try:
            from backend.services.audit_service import AuditService

            audit_service = AuditService(db)
            await audit_service.log_event(
                event_type=AuditEventType.AUTH_PASSWORD_RESET_CONFIRM,
                status=AuditLogStatus.SUCCESS,
                actor_id=user_id,
                details={"action": "password_changed"},
            )
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

        return ApiResponse.success_response({"message": "Password reset successful"})

    except Exception as e:
        logger.error(f"Password reset confirm failed: {e}")
        return ApiResponse.error_response({"message": "Failed to reset password"})
