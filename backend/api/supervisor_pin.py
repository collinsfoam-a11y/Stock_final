import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.services.auth_service import AuthService, get_auth_service
from backend.utils.auth_utils import verify_password
from backend.utils.api_utils import sanitize_for_logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _safe_log_value(value: object, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


class PinVerificationRequest(BaseModel):
    supervisor_username: str
    pin: str
    action: str
    reason: str
    staff_username: str
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None


@router.post("/supervisor/verify-pin")
async def verify_supervisor_pin(
    request: PinVerificationRequest,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
):
    """
    Verify supervisor PIN and log the override action.
    """
    # H7 fix: Rate limit PIN attempts per supervisor (max 5 attempts per 5 minutes)
    from datetime import datetime as dt, timezone as tz

    rate_key = f"pin_attempts:{request.supervisor_username}"
    attempts_doc = await auth_service.get_rate_limit(rate_key)
    now = dt.now(tz.utc)
    window_seconds = 300  # 5 minutes
    max_attempts = 5

    if attempts_doc:
        window_start = attempts_doc.get("window_start")
        attempt_count = attempts_doc.get("count", 0)
        # MM7 fix: Use datetime for window_start (compatible with MongoDB TTL index)
        if isinstance(window_start, dt):
            elapsed = (now - window_start).total_seconds()
        else:
            elapsed = window_seconds + 1  # Treat invalid as expired
        if elapsed < window_seconds and attempt_count >= max_attempts:
            retry_after = int(window_seconds - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Too many PIN attempts. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )
        if elapsed >= window_seconds:
            # Reset window
            attempts_doc = None

    # 1. Fetch the supervisor user
    supervisor = await auth_service.get_user(request.supervisor_username)
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    # 2. Verify Role
    if supervisor.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="User is not a supervisor")

    # 3. Verify PIN
    # We reuse verify_password for PINs since they are hashed the same way
    stored_pin_hash = supervisor.get("pin_hash")
    if not stored_pin_hash:
        raise HTTPException(
            status_code=400,
            detail="Supervisor PIN not set. Please contact administrator.",
        )

    if not verify_password(request.pin, stored_pin_hash):
        logger.warning(
            "Failed PIN attempt for supervisor %s",
            _safe_log_value(request.supervisor_username),
        )
        # Record failed attempt (MM7 fix: use datetime for TTL compatibility)
        await auth_service.increment_rate_limit_attempt(rate_key, now)
        # Ensure window_start is reset if the doc was just created fresh
        if not attempts_doc:
            await auth_service.set_rate_limit_window_start(rate_key, now)
        raise HTTPException(status_code=401, detail="Invalid PIN")

    # Reset rate limit on success
    await auth_service.delete_rate_limit(rate_key)

    # 4. Log the Activity
    await auth_service.log_activity(
        user=request.supervisor_username,
        role=supervisor.get("role"),
        action=f"override_{request.action}",
        entity_type=request.entity_type or "override",
        entity_id=request.entity_id,
        details={
            "reason": request.reason,
            "staff_user": request.staff_username,
            "requested_by": current_user["username"],
        },
        status="success",
    )

    return {"success": True, "message": "Override authorized"}
