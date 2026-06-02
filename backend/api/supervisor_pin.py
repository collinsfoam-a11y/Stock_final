import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.services.activity_log import ActivityLogService
from backend.tenancy.scoping import org_id_from_user, org_scoped_filter
from backend.utils.auth_utils import create_supervisor_override_token, verify_pin_hash
from backend.utils.api_utils import sanitize_for_logging

router = APIRouter()
logger = logging.getLogger(__name__)


def _safe_log_value(value: object, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


class PinVerificationRequest(BaseModel):
    supervisor_username: str
    pin: str
    action: str
    reason_code: str
    reason: str
    staff_username: str
    entity_id: Optional[str] = None
    entity_type: Optional[str] = None


@router.post("/supervisor/verify-pin")
async def verify_supervisor_pin(
    http_request: Request,
    payload: PinVerificationRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Verify supervisor PIN and log the override action.
    """
    db = get_db()

    # H7 fix: Rate limit PIN attempts per supervisor (max 5 attempts per 5 minutes)
    from datetime import datetime as dt, timezone as tz

    org_id = org_id_from_user(current_user)
    rate_key = f"pin_attempts:{org_id}:{payload.supervisor_username}"
    attempts_doc = await db.rate_limits.find_one({"_id": rate_key})
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
    if payload.staff_username != current_user.get("username"):
        raise HTTPException(status_code=403, detail="Invalid staff_username")

    normalized_action = str(payload.action or "").strip().lower()
    action_map = {
        "delete_count_line": "count_line.delete",
        "count_lines.delete": "count_line.delete",
        "count_line.delete": "count_line.delete",
    }
    canonical_action = action_map.get(normalized_action)
    if not canonical_action:
        raise HTTPException(status_code=400, detail="Unsupported override action")

    if canonical_action == "count_line.delete" and not payload.entity_id:
        raise HTTPException(status_code=400, detail="entity_id is required for override action")

    supervisor = await db.users.find_one(
        org_scoped_filter(org_id, {"username": payload.supervisor_username})
    )
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor not found")

    # 2. Verify Role
    if supervisor.get("role") not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="User is not a supervisor")

    # 3. Verify PIN
    stored_pin_hash = supervisor.get("pin_hash")
    if not stored_pin_hash:
        raise HTTPException(
            status_code=400,
            detail="Supervisor PIN not set. Please contact administrator.",
        )

    if not verify_pin_hash(payload.pin, stored_pin_hash):
        logger.warning(
            "Failed PIN attempt for supervisor %s",
            _safe_log_value(payload.supervisor_username),
        )
        # Record failed attempt (MM7 fix: use datetime for TTL compatibility)
        await db.rate_limits.update_one(
            {"_id": rate_key},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"window_start": now},
            },
            upsert=True,
        )
        # Ensure window_start is reset if the doc was just created fresh
        if not attempts_doc:
            await db.rate_limits.update_one(
                {"_id": rate_key},
                {"$set": {"window_start": now}},
            )
        raise HTTPException(status_code=401, detail="Invalid PIN")

    # Reset rate limit on success
    await db.rate_limits.delete_one({"_id": rate_key})

    # 4. Log the Activity
    log_service = ActivityLogService(db)
    await log_service.log_activity(
        user=payload.supervisor_username,
        role=supervisor.get("role"),
        action=f"override_{canonical_action}",
        entity_type=payload.entity_type or "override",
        entity_id=payload.entity_id,
        details={
            "reason_code": payload.reason_code,
            "reason": payload.reason,
            "staff_user": payload.staff_username,
            "requested_by": current_user["username"],
        },
        status="success",
    )

    try:
        from backend.services.enterprise_audit import AuditEventType as EnterpriseAuditEventType
        from backend.services.enterprise_audit import AuditSeverity
        from backend.utils.enterprise_audit_logger import log_enterprise_audit

        await log_enterprise_audit(
            http_request,
            event_type=EnterpriseAuditEventType.AUTHZ_ACCESS_GRANTED,
            action="supervisor.verify_pin",
            current_user=current_user,
            resource_type=payload.entity_type or "override",
            resource_id=payload.entity_id,
            outcome="success",
            severity=AuditSeverity.WARNING,
            details={
                "supervisor_username": payload.supervisor_username,
                "staff_username": payload.staff_username,
                "requested_by": current_user.get("username"),
                "override_action": canonical_action,
                "reason_code": payload.reason_code,
                "reason": payload.reason,
            },
        )
    except Exception as e:
        logger.error(
            "Failed to write enterprise audit log: %s",
            _safe_log_value(e, max_length=200),
        )

    token = create_supervisor_override_token(
        {
            "org_id": org_id,
            "override_action": canonical_action,
            "entity_id": payload.entity_id,
            "entity_type": payload.entity_type or "override",
            "requested_by": current_user.get("username"),
            "staff_username": payload.staff_username,
            "supervisor_username": payload.supervisor_username,
            "supervisor_user_id": str(supervisor.get("_id") or "") or None,
            "reason_code": payload.reason_code,
            "reason": payload.reason,
        }
    )

    return {
        "success": True,
        "message": "Override authorized",
        "override_token": token,
        "expires_in": 300,
    }
