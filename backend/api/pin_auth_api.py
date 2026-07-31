"""
Auth API Endpoints (PIN Extensions)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.api.auth import (
    find_user_by_username,
    generate_auth_tokens,
)
from backend.auth.rate_limiter import check_auth_rate_limits, record_auth_failure, reset_auth_limits
from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.services.pin_auth_service import PINAuthService
from backend.utils.auth_utils import verify_password

logger = logging.getLogger(__name__)

router = APIRouter()


class PinChangeRequest(BaseModel):
    current_password: str
    # M13 fix: Enforce exactly 4 digits to match login validation
    new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")


class PinLoginRequest(BaseModel):
    username: str
    pin: str


@router.post("/auth/pin/change")
async def change_pin(
    request: PinChangeRequest,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Change the current user's PIN."""
    pin_service = PINAuthService(db)

    # Verify current password before allowing PIN change
    hashed_password = current_user.get("hashed_password")
    if not hashed_password or not verify_password(request.current_password, hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    success = await pin_service.set_pin(str(current_user["_id"]), request.new_pin)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set PIN",
        )

    return {"message": "PIN changed successfully"}


@router.post("/auth/login/pin")
async def login_with_pin(
    request: PinLoginRequest,
    http_request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Login with PIN."""
    ip_address = http_request.client.host if http_request and http_request.client else "unknown"
    # Rate limit login attempts by IP and identifier
    await check_auth_rate_limits(http_request, request.username)

    # Find user and validate status
    user_result = await find_user_by_username(request.username)
    if user_result.is_err:
        await record_auth_failure(http_request, request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    user = user_result.unwrap()
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    pin_service = PINAuthService(db)
    is_valid = await pin_service.verify_pin(str(user["_id"]), request.pin)

    if not is_valid:
        await record_auth_failure(http_request, request.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid PIN",
        )

    # Generate JWT + refresh tokens using existing auth flow
    token_result = await generate_auth_tokens(user, ip_address, http_request)
    if token_result.is_err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate tokens",
        )
    tokens = token_result.unwrap()

    # Reset rate limit for successful PIN login
    try:
        await reset_auth_limits(http_request, request.username)
    except Exception:
        # Non-fatal: login already succeeded; stale rate-limit state expires on its own
        logger.debug("Failed to reset rate limit after PIN login", exc_info=True)

    return {
        **tokens,
        "token_type": "bearer",
        "user": {
            "username": user.get("username"),
            "role": user.get("role"),
            "full_name": user.get("full_name"),
            "is_active": user.get("is_active", True),
        },
    }
