"""
Session Management API - Enhanced session tracking with heartbeat
Extends existing session API with rack-based workflow support
"""

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.response_models import PaginatedResponse
from backend.api.schemas import Session, SessionCreate
from backend.auth.dependencies import (
    get_current_user_async as get_current_user,
    require_role,
)
from backend.core.websocket_manager import manager
from backend.db.runtime import get_db
from backend.services.lock_manager import get_lock_manager
from backend.services.canonical_inventory import (
    build_session_lookup,
    find_session,
    get_session_count_lines,
    is_blocking_finalization,
    is_count_line_effectively_reviewed,
    is_session_finalized,
    normalize_session_status as normalize_canonical_session_status,
    recompute_session_totals,
)
from backend.services.session_state_machine import SessionStateMachine
from backend.services.redis_service import get_redis
from backend.services.runtime import get_refresh_token_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["Session Management"])

ACTIVE_SESSION_STATUSES = ["OPEN", "ACTIVE", "PAUSED", "RECONCILE"]


# Models


class SessionDetail(BaseModel):
    """Detailed session information"""

    id: str
    user_id: str
    warehouse: Optional[str] = None
    staff_name: Optional[str] = None
    location_type: Optional[str] = None
    location_name: Optional[str] = None
    rack_id: Optional[str] = None
    floor: Optional[str] = None
    status: str  # active, paused, completed
    started_at: float
    last_heartbeat: float
    completed_at: Optional[float] = None
    item_count: int = 0
    verified_count: int = 0
    total_items: int = 0
    total_variance: float = 0.0
    finalization_status: Optional[str] = None
    finalized_at: Optional[float] = None
    finalized_by: Optional[str] = None


class SessionStats(BaseModel):
    """Session statistics"""

    id: str
    total_items: int
    verified_items: int
    damage_items: int
    pending_items: int
    duration_seconds: float
    items_per_minute: float


class HeartbeatResponse(BaseModel):
    """Heartbeat response"""

    success: bool
    id: str
    rack_lock_renewed: bool
    user_presence_updated: bool
    lock_ttl_remaining: int
    message: str


class SessionIntegrityResponse(BaseModel):
    """Session integrity check response (FR-M-34)"""

    valid: bool
    last_sync: Optional[float] = None
    session_start: float
    updates_detected: bool
    affected_items: int
    message: str


class SessionFinalizeRequest(BaseModel):
    """Optional metadata supplied when finalizing a session."""

    note: Optional[str] = None


class CanonicalSessionStatus(str, Enum):
    OPEN = "OPEN"
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    RECONCILE = "RECONCILE"
    COMPLETED = "COMPLETED"
    CLOSED = "CLOSED"
    CANCELLED = "CANCELLED"
    UNKNOWN = "UNKNOWN"


class WorkflowStage(str, Enum):
    IDLE = "IDLE"
    COUNTING = "COUNTING"
    PAUSED = "PAUSED"
    RECONCILING = "RECONCILING"
    AWAITING_REVIEW = "AWAITING_REVIEW"
    RECOUNT_QUEUE = "RECOUNT_QUEUE"


class WorkflowPresenceStatus(str, Enum):
    ONLINE = "ONLINE"
    IDLE = "IDLE"
    OFFLINE = "OFFLINE"


class WorkflowNextAction(str, Enum):
    REVIEW_PENDING = "REVIEW_PENDING"
    HANDLE_RECOUNT = "HANDLE_RECOUNT"
    RESUME_PAUSED_SESSION = "RESUME_PAUSED_SESSION"
    FOLLOW_UP_INACTIVE_SESSION = "FOLLOW_UP_INACTIVE_SESSION"
    MONITOR_ACTIVE_COUNT = "MONITOR_ACTIVE_COUNT"
    CLOSE_SESSION = "CLOSE_SESSION"
    NONE = "NONE"


class WorkflowPriorityBand(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class UserWorkflowSummary(BaseModel):
    """Running workflow snapshot grouped by user."""

    username: str
    full_name: Optional[str] = None
    role: str = "staff"
    workflow_stage: WorkflowStage
    presence_status: WorkflowPresenceStatus
    active_session_id: Optional[str] = None
    session_status: Optional[CanonicalSessionStatus] = None
    session_type: Optional[str] = None
    warehouse: Optional[str] = None
    rack_id: Optional[str] = None
    floor: Optional[str] = None
    session_started_at: Optional[datetime] = None
    last_activity: Optional[datetime] = None
    pending_review_since: Optional[datetime] = None
    recount_assigned_at: Optional[datetime] = None
    open_session_count: int = 0
    items_counted: int = 0
    reviewed_items: int = 0
    total_items: int = 0
    progress_percent: float = 0.0
    pending_approvals: int = 0
    assigned_recounts: int = 0
    total_variance: float = 0.0
    priority_score: int = 0
    priority_band: WorkflowPriorityBand = WorkflowPriorityBand.LOW
    next_action: WorkflowNextAction = WorkflowNextAction.NONE


ACTIVE_WORKFLOW_SESSION_STATES = {
    "OPEN",
    "ACTIVE",
    "PAUSED",
    "RECONCILE",
    "open",
    "active",
    "paused",
    "reconcile",
    "in_progress",
}
PENDING_APPROVAL_MATCH = {
    "$or": [
        {"status": {"$in": ["pending_approval", "NEEDS_REVIEW"]}},
        {"approval_status": "NEEDS_REVIEW"},
    ]
}
OPEN_RECOUNT_MATCH = {
    "assigned_to": {"$exists": True, "$nin": [None, ""]},
    "recount_requested_at": {"$exists": True},
    "status": {"$nin": ["approved", "locked"]},
}
PENDING_REVIEW_SLA_MINUTES = 20
RECOUNT_SLA_MINUTES = 30
INACTIVE_SESSION_SLA_MINUTES = 10


def _normalize_location_value(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _parse_session_location_parts(
    warehouse: str,
    location_type: Optional[str] = None,
    location_name: Optional[str] = None,
    rack_no: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    parsed_type = _normalize_location_value(location_type)
    parsed_name = _normalize_location_value(location_name)
    parsed_rack = _normalize_location_value(rack_no)

    if parsed_type and parsed_name and parsed_rack:
        return parsed_type, parsed_name, parsed_rack

    parts = [part.strip() for part in warehouse.split(" - ") if part.strip()]
    if len(parts) >= 3:
        parsed_type = parsed_type or parts[0]
        parsed_name = parsed_name or parts[1]
        parsed_rack = parsed_rack or parts[2]

    return parsed_type, parsed_name, parsed_rack


def _exact_match_filter(value: str) -> dict[str, str]:
    return {"$regex": f"^{re.escape(value)}$", "$options": "i"}


def _infer_snapshot_warehouse_aliases(
    warehouse: Optional[str],
    location_type: Optional[str],
    location_name: Optional[str],
) -> list[str]:
    hints = " ".join(
        part.lower()
        for part in (warehouse, location_type, location_name)
        if isinstance(part, str) and part.strip()
    )

    if "showroom" in hints or "floor" in hints:
        return ["Primary"]
    if "godown" in hints or "damage" in hints:
        return ["Main"]
    return []


def _build_snapshot_queries(
    warehouse: str,
    location_type: Optional[str] = None,
    location_name: Optional[str] = None,
    rack_no: Optional[str] = None,
) -> list[dict[str, Any]]:
    queries: list[dict[str, Any]] = [{"warehouse": _exact_match_filter(warehouse)}]

    parsed_type, parsed_name, parsed_rack = _parse_session_location_parts(
        warehouse,
        location_type=location_type,
        location_name=location_name,
        rack_no=rack_no,
    )

    if parsed_name and parsed_rack:
        queries.append(
            {
                "$and": [
                    {
                        "$or": [
                            {"floor": _exact_match_filter(parsed_name)},
                            {"floor_no": _exact_match_filter(parsed_name)},
                            {"warehouse": _exact_match_filter(parsed_name)},
                        ]
                    },
                    {
                        "$or": [
                            {"rack": _exact_match_filter(parsed_rack)},
                            {"rack_no": _exact_match_filter(parsed_rack)},
                        ]
                    },
                ]
            }
        )

    if parsed_name:
        queries.append(
            {
                "$or": [
                    {"floor": _exact_match_filter(parsed_name)},
                    {"floor_no": _exact_match_filter(parsed_name)},
                    {"warehouse": _exact_match_filter(parsed_name)},
                ]
            }
        )

    for alias in _infer_snapshot_warehouse_aliases(warehouse, parsed_type, parsed_name):
        queries.append({"warehouse": _exact_match_filter(alias)})

    unique_queries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for query in queries:
        key = repr(query)
        if key in seen:
            continue
        seen.add(key)
        unique_queries.append(query)

    return unique_queries


def _build_snapshot_payload_and_hash(snapshot_items: list[Any]) -> tuple[list[dict[str, Any]], str]:
    snapshot_items.sort(key=lambda item: item.item_code)
    items_payload = [item.model_dump(mode="json") for item in snapshot_items]
    payload_str = json.dumps(items_payload, sort_keys=True, default=str)
    snapshot_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    return items_payload, snapshot_hash


def _build_snapshot_source_data(item: dict[str, Any]) -> dict[str, Any]:
    # Keep only the fields needed to reconstruct a baseline without storing the full ERP document.
    fields = (
        "item_name",
        "barcode",
        "mrp",
        "category",
        "subcategory",
        "warehouse",
        "floor",
        "rack",
        "floor_no",
        "rack_no",
        "uom_code",
    )
    return {
        field: item[field] for field in fields if field in item and item[field] not in (None, "")
    }


async def _collect_snapshot_items(
    db: AsyncIOMotorDatabase,
    warehouse: str,
    location_type: Optional[str] = None,
    location_name: Optional[str] = None,
    rack_no: Optional[str] = None,
) -> list[Any]:
    from backend.core.schemas.snapshot import SnapshotItem

    for query in _build_snapshot_queries(
        warehouse,
        location_type=location_type,
        location_name=location_name,
        rack_no=rack_no,
    ):
        snapshot_items: list[SnapshotItem] = []
        items_cursor = db.erp_items.find(query)

        async for item in items_cursor:
            snapshot_items.append(
                SnapshotItem(
                    item_code=item.get("item_code", ""),
                    stock_qty=float(item.get("stock_qty", 0.0)),
                    warehouse=item.get("warehouse") or warehouse,
                    source_data=_build_snapshot_source_data(item),
                )
            )

        if snapshot_items:
            return snapshot_items

    return []


def _coerce_datetime(value: Any) -> Optional[datetime]:
    """Best-effort conversion for datetimes stored as epoch, ISO string, or datetime."""
    if value is None:
        return None

    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
        except (OverflowError, OSError, ValueError):
            return None

    if isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return None
        try:
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)

    return None


def _max_datetime(*values: Any) -> Optional[datetime]:
    candidates = [candidate for candidate in (_coerce_datetime(v) for v in values) if candidate]
    return max(candidates) if candidates else None


def _normalize_session_status(value: Any) -> Optional[CanonicalSessionStatus]:
    if not isinstance(value, str) or not value.strip():
        return None

    normalized = value.strip().upper()
    aliases = {
        "IN_PROGRESS": CanonicalSessionStatus.ACTIVE,
        "RECONCILING": CanonicalSessionStatus.RECONCILE,
    }
    if normalized in aliases:
        return aliases[normalized]

    try:
        return CanonicalSessionStatus(normalized)
    except ValueError:
        return CanonicalSessionStatus.UNKNOWN


def _effective_session_status(session: dict[str, Any]) -> CanonicalSessionStatus:
    normalized = normalize_canonical_session_status(
        session.get("status"),
        reconciled_at=session.get("reconciled_at"),
    )
    try:
        return CanonicalSessionStatus(normalized)
    except ValueError:
        return CanonicalSessionStatus.UNKNOWN


def _datetime_to_timestamp(value: Any) -> Optional[float]:
    coerced = _coerce_datetime(value)
    return coerced.timestamp() if coerced else None


def _current_utc_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _session_identifier(session: Optional[dict[str, Any]]) -> str:
    return str((session or {}).get("id") or (session or {}).get("session_id") or "")


def _session_owner(session: Optional[dict[str, Any]]) -> str:
    return str((session or {}).get("staff_user") or (session or {}).get("user_id") or "")


async def _get_session_line_summary(
    db: AsyncIOMotorDatabase,
    session_id: str,
) -> dict[str, Any]:
    lines = await get_session_count_lines(db, session_id)
    item_count = len(lines)
    verified_count = sum(1 for line in lines if is_count_line_effectively_reviewed(line))
    total_variance = sum(float(line.get("variance") or 0.0) for line in lines)
    damage_items = int(sum(float(line.get("damaged_qty") or 0.0) for line in lines))
    return {
        "lines": lines,
        "item_count": item_count,
        "verified_count": verified_count,
        "pending_count": max(item_count - verified_count, 0),
        "total_variance": total_variance,
        "damage_items": damage_items,
    }


def _build_session_detail_from_doc(
    session: dict[str, Any],
    line_summary: dict[str, Any],
) -> SessionDetail:
    started_at = _datetime_to_timestamp(session.get("started_at")) or time.time()
    last_heartbeat = (
        _datetime_to_timestamp(session.get("last_heartbeat"))
        or _datetime_to_timestamp(session.get("last_activity"))
        or started_at
    )
    completed_at = (
        _datetime_to_timestamp(session.get("finalized_at"))
        or _datetime_to_timestamp(session.get("completed_at"))
        or _datetime_to_timestamp(session.get("closed_at"))
    )
    finalized_at = _datetime_to_timestamp(session.get("finalized_at"))

    return SessionDetail(
        id=str(session.get("id") or session.get("session_id")),
        user_id=str(session.get("staff_user") or session.get("user_id") or ""),
        warehouse=session.get("warehouse"),
        staff_name=session.get("staff_name"),
        location_type=session.get("location_type"),
        location_name=session.get("location_name"),
        rack_id=session.get("rack_no"),
        floor=session.get("location_name"),
        status=_effective_session_status(session).value,
        started_at=started_at,
        last_heartbeat=last_heartbeat,
        completed_at=completed_at,
        item_count=int(line_summary.get("item_count", 0) or 0),
        verified_count=int(line_summary.get("verified_count", 0) or 0),
        total_items=int(line_summary.get("item_count", 0) or 0),
        total_variance=float(
            session.get("total_variance", line_summary.get("total_variance", 0.0)) or 0.0
        ),
        finalization_status=session.get("finalization_status"),
        finalized_at=finalized_at,
        finalized_by=session.get("finalized_by"),
    )


def _derive_presence_status(
    last_activity: Optional[datetime],
) -> WorkflowPresenceStatus:
    if not last_activity:
        return WorkflowPresenceStatus.OFFLINE

    age = datetime.now(timezone.utc).replace(tzinfo=None) - last_activity
    if age <= timedelta(minutes=2):
        return WorkflowPresenceStatus.ONLINE
    if age <= timedelta(minutes=15):
        return WorkflowPresenceStatus.IDLE
    return WorkflowPresenceStatus.OFFLINE


def _derive_workflow_stage(
    session_status: Optional[CanonicalSessionStatus],
    pending_approvals: int,
    assigned_recounts: int,
) -> WorkflowStage:
    if assigned_recounts > 0:
        return WorkflowStage.RECOUNT_QUEUE
    if pending_approvals > 0:
        return WorkflowStage.AWAITING_REVIEW
    if session_status == CanonicalSessionStatus.PAUSED:
        return WorkflowStage.PAUSED
    if session_status == CanonicalSessionStatus.RECONCILE:
        return WorkflowStage.RECONCILING
    if session_status in {CanonicalSessionStatus.OPEN, CanonicalSessionStatus.ACTIVE}:
        return WorkflowStage.COUNTING
    return WorkflowStage.IDLE


def _minutes_since(value: Optional[datetime]) -> float:
    if not value:
        return 0.0
    return max(
        0.0,
        (datetime.now(timezone.utc).replace(tzinfo=None) - value).total_seconds() / 60,
    )


def _calculate_priority_score(
    workflow_stage: WorkflowStage,
    presence_status: WorkflowPresenceStatus,
    session_status: Optional[CanonicalSessionStatus],
    pending_approvals: int,
    assigned_recounts: int,
    total_variance: float,
    pending_review_since: Optional[datetime],
    recount_assigned_at: Optional[datetime],
    last_activity: Optional[datetime],
) -> int:
    score = 0

    if workflow_stage == WorkflowStage.RECOUNT_QUEUE:
        score += 55 + min(assigned_recounts * 8, 20)
    elif workflow_stage == WorkflowStage.AWAITING_REVIEW:
        score += 45 + min(pending_approvals * 5, 20)
    elif workflow_stage == WorkflowStage.PAUSED:
        score += 25
    elif workflow_stage == WorkflowStage.RECONCILING:
        score += 15
    elif workflow_stage == WorkflowStage.COUNTING:
        score += 10

    score += min(int(abs(total_variance) // 10), 15)

    pending_age = _minutes_since(pending_review_since)
    if pending_age > PENDING_REVIEW_SLA_MINUTES:
        score += 10
    if pending_age > PENDING_REVIEW_SLA_MINUTES * 2:
        score += 10

    recount_age = _minutes_since(recount_assigned_at)
    if recount_age > RECOUNT_SLA_MINUTES:
        score += 10
    if recount_age > RECOUNT_SLA_MINUTES * 2:
        score += 10

    if session_status in {
        CanonicalSessionStatus.OPEN,
        CanonicalSessionStatus.ACTIVE,
        CanonicalSessionStatus.PAUSED,
        CanonicalSessionStatus.RECONCILE,
    }:
        inactive_age = _minutes_since(last_activity)
        if presence_status == WorkflowPresenceStatus.IDLE:
            score += 8
        elif presence_status == WorkflowPresenceStatus.OFFLINE:
            score += 18

        if inactive_age > INACTIVE_SESSION_SLA_MINUTES:
            score += 5
        if inactive_age > INACTIVE_SESSION_SLA_MINUTES * 2:
            score += 7

    return max(0, min(100, score))


def _priority_band_for_score(score: int) -> WorkflowPriorityBand:
    if score >= 75:
        return WorkflowPriorityBand.CRITICAL
    if score >= 50:
        return WorkflowPriorityBand.HIGH
    if score >= 25:
        return WorkflowPriorityBand.MEDIUM
    return WorkflowPriorityBand.LOW


def _derive_next_action(
    workflow_stage: WorkflowStage,
    presence_status: WorkflowPresenceStatus,
    session_status: Optional[CanonicalSessionStatus],
) -> WorkflowNextAction:
    if workflow_stage == WorkflowStage.RECOUNT_QUEUE:
        return WorkflowNextAction.HANDLE_RECOUNT
    if workflow_stage == WorkflowStage.AWAITING_REVIEW:
        return WorkflowNextAction.REVIEW_PENDING
    if workflow_stage == WorkflowStage.PAUSED:
        return WorkflowNextAction.RESUME_PAUSED_SESSION
    if (
        session_status
        in {
            CanonicalSessionStatus.OPEN,
            CanonicalSessionStatus.ACTIVE,
            CanonicalSessionStatus.RECONCILE,
        }
        and presence_status != WorkflowPresenceStatus.ONLINE
    ):
        return WorkflowNextAction.FOLLOW_UP_INACTIVE_SESSION
    if workflow_stage in {WorkflowStage.COUNTING, WorkflowStage.RECONCILING}:
        return WorkflowNextAction.MONITOR_ACTIVE_COUNT
    if session_status in {CanonicalSessionStatus.CLOSED, CanonicalSessionStatus.COMPLETED}:
        return WorkflowNextAction.CLOSE_SESSION
    return WorkflowNextAction.NONE


async def _build_sessions_analytics_payload(db: AsyncIOMotorDatabase) -> dict[str, Any]:
    """Build the aggregated session analytics payload used by admin/supervisor dashboards."""
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_sessions": {"$sum": 1},
                "total_items": {"$sum": "$total_items"},
                "total_variance": {"$sum": "$total_variance"},
                "avg_variance": {"$avg": "$total_variance"},
                "sessions_by_status": {"$push": {"status": "$status", "count": 1}},
            }
        }
    ]

    date_pipeline = [
        {
            "$project": {
                "date": {"$substr": ["$started_at", 0, 10]},
                "warehouse": 1,
                "staff_name": 1,
                "total_items": 1,
                "total_variance": 1,
            }
        },
        {"$group": {"_id": "$date", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]

    warehouse_pipeline = [
        {
            "$group": {
                "_id": "$warehouse",
                "total_variance": {"$sum": {"$abs": "$total_variance"}},
                "session_count": {"$sum": 1},
            }
        }
    ]

    staff_pipeline = [
        {
            "$group": {
                "_id": "$staff_name",
                "total_items": {"$sum": "$total_items"},
                "session_count": {"$sum": 1},
            }
        }
    ]

    overall = await db.sessions.aggregate(pipeline).to_list(1)
    by_date = await db.sessions.aggregate(date_pipeline).to_list(None)  # type: ignore[arg-type]
    by_warehouse = await db.sessions.aggregate(warehouse_pipeline).to_list(None)
    by_staff = await db.sessions.aggregate(staff_pipeline).to_list(None)

    overall_summary = overall[0] if overall else {}

    return {
        "overall": overall_summary,
        "sessions_by_date": {item["_id"]: item["count"] for item in by_date},
        "variance_by_warehouse": {item["_id"]: item["total_variance"] for item in by_warehouse},
        "items_by_staff": {item["_id"]: item["total_items"] for item in by_staff},
        "total_sessions": overall_summary.get("total_sessions", 0),
    }


# Endpoints


@router.get("/", response_model=PaginatedResponse[Session])
@router.get("", response_model=PaginatedResponse[Session])
async def get_sessions(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    status: Optional[str] = Query(None, description="Filter by status"),
    user_id: Optional[str] = Query(None, description="Filter by user"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> PaginatedResponse[Session]:
    """
    Get all sessions with pagination
    """
    # Build query
    query = {}
    if status:
        query["status"] = status

    if user_id:
        # Only supervisors can view other users' sessions
        if current_user["role"] != "supervisor" and user_id != current_user["username"]:
            raise HTTPException(status_code=403, detail="Access denied")
        query["staff_user"] = user_id
    elif current_user["role"] != "supervisor":
        # Regular users only see their own sessions
        query["staff_user"] = current_user["username"]

    # Get total count
    total = await db.sessions.count_documents(query)

    # Get paginated sessions
    skip = (page - 1) * page_size
    sessions_cursor = db.sessions.find(query).sort("started_at", -1).skip(skip).limit(page_size)
    sessions = await sessions_cursor.to_list(length=page_size)

    logger.debug(
        "Fetched sessions page",
        extra={
            "query": query,
            "returned_count": len(sessions),
            "total_count": total,
            "page": page,
            "page_size": page_size,
            "viewer": current_user["username"],
        },
    )

    # Convert to response models
    result = []
    for session in sessions:
        # Preserve identity: use string version of '_id' if 'id' is missing
        if "_id" in session:
            if "id" not in session:
                session["id"] = str(session["_id"])
            del session["_id"]
        result.append(Session(**session))

    return PaginatedResponse.create(
        items=result,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/", response_model=Session)
@router.post("", response_model=Session)
async def create_session(
    session_data: SessionCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> Session:
    """Create a new session"""
    import uuid
    from datetime import datetime, timezone

    # Input validation
    warehouse = session_data.warehouse.strip()
    if not warehouse:
        raise HTTPException(status_code=400, detail="Warehouse name cannot be empty")
    location_type, location_name, rack_no = _parse_session_location_parts(
        warehouse,
        location_type=session_data.location_type,
        location_name=session_data.location_name,
        rack_no=session_data.rack_no,
    )

    existing_session = await db.sessions.find_one(
        {
            "staff_user": current_user["username"],
            "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]},
            "warehouse": {"$regex": f"^{re.escape(warehouse)}$", "$options": "i"},
        }
    )
    if existing_session:
        if "_id" in existing_session and "id" not in existing_session:
            existing_session["id"] = str(existing_session["_id"])
            del existing_session["_id"]
        logger.info(
            "Existing open session found for warehouse; returning existing session",
            extra={"warehouse": warehouse, "session_id": existing_session.get("id")},
        )
        return Session(**existing_session)

    # Enforce Invariant E: Single Session per User
    # In a live production environment, opening a new session must invalidate old ones.

    # Find any active sessions for this user across both collections
    open_sessions_filter = {
        "staff_user": current_user["username"],
        "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]},
    }

    # Auto-close strategy to satisfy "Single Session" mandate
    # We close them with a special status to indicate system intervention
    now_ts = time.time()
    now_dt = datetime.now(timezone.utc)

    # 1. Close in main sessions collection
    await db.sessions.update_many(
        open_sessions_filter,
        {
            "$set": {
                "status": "CLOSED",
                "completed_at": now_dt,
                "close_reason": "SYSTEM_AUTO_CLOSE_NEW_SESSION",
            }
        },
    )

    # 2. Close in verification_sessions
    await db.verification_sessions.update_many(
        {"user_id": current_user["username"], "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]}},
        {
            "$set": {
                "status": "CLOSED",
                "completed_at": now_ts,
                "close_reason": "SYSTEM_AUTO_CLOSE_NEW_SESSION",
            }
        },
    )

    # 3. Revoke previous refresh tokens to ensure session is strictly bound
    refresh_token_service = get_refresh_token_service()
    if refresh_token_service:
        await refresh_token_service.revoke_all_user_tokens(current_user["username"])

    # Create Session object
    session = Session(
        id=str(uuid.uuid4()),
        warehouse=warehouse,
        location_type=location_type,
        location_name=location_name,
        rack_no=rack_no,
        staff_user=current_user["username"],
        staff_name=current_user.get("full_name", current_user["username"]),
        type=session_data.type or "STANDARD",
        status="OPEN",
        started_at=datetime.now(timezone.utc),
        last_heartbeat=datetime.now(timezone.utc),
    )

    # GOVERNANCE: Snapshot & Config Enforcement
    from backend.core.schemas.snapshot import SessionSnapshot

    # 1. Get latest config version
    latest_config = await db.config_versions.find_one(sort=[("created_at", -1)])
    config_version_id = latest_config["id"] if latest_config else "LEGACY_NO_VERSION"
    session.config_version_id = config_version_id

    # 2. Fetch items for snapshot.
    # Prefer exact warehouse match, then structured location, then controlled aliases.
    snapshot_items = await _collect_snapshot_items(
        db,
        warehouse,
        location_type=location_type,
        location_name=location_name,
        rack_no=rack_no,
    )

    # 3. Create Hash
    items_payload, snapshot_hash = _build_snapshot_payload_and_hash(snapshot_items)

    session.snapshot_hash = snapshot_hash

    # 4. Save Snapshot
    snapshot = SessionSnapshot(
        session_id=session.id,
        warehouse=warehouse,
        snapshot_hash=snapshot_hash,
        items=snapshot_items,
        item_count=len(snapshot_items),
        config_version_id=config_version_id,
    )

    # Store snapshot in separate collection
    await db.session_snapshots.insert_one(snapshot.model_dump())
    session.snapshot_items_ref = snapshot.id

    # Insert into db.sessions
    session_doc = session.model_dump()
    session_doc["session_id"] = session.id
    await db.sessions.insert_one(session_doc)

    # Deprecated compatibility mirror for older code paths that have not yet been removed.
    # Active flows must read from `sessions`.
    verification_session = {
        "session_id": session.id,
        "user_id": current_user["username"],
        "status": "ACTIVE",
        "started_at": time.time(),
        "last_heartbeat": time.time(),
        "rack_id": None,
        "floor": None,
    }
    await db.verification_sessions.insert_one(verification_session)

    return session


@router.get("/active", response_model=list[SessionDetail])
async def get_active_sessions(
    user_id: Optional[str] = Query(None, description="Filter by user"),
    rack_id: Optional[str] = Query(None, description="Filter by rack"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[SessionDetail]:
    """
    Get all active sessions

    Filters:
    - user_id: Filter by specific user
    - rack_id: Filter by specific rack
    """
    # Build canonical session query
    query: dict[str, Any] = {
        "status": {"$in": ACTIVE_SESSION_STATUSES},
        "$and": [
            {"$or": [{"finalized_at": {"$exists": False}}, {"finalized_at": {"$in": [None, ""]}}]},
            {"$or": [{"closed_at": {"$exists": False}}, {"closed_at": {"$in": [None, ""]}}]},
        ],
    }

    if user_id:
        # Only supervisors can view other users' sessions
        if current_user["role"] != "supervisor" and user_id != current_user["username"]:
            raise HTTPException(status_code=403, detail="Access denied")
        query["staff_user"] = user_id

    if rack_id:
        query["rack_no"] = rack_id

    # Get sessions
    sessions_cursor = db.sessions.find(query).sort("started_at", -1)
    sessions = await sessions_cursor.to_list(length=100)

    result = []
    for session in sessions:
        line_summary = await _get_session_line_summary(db, _session_identifier(session))
        result.append(_build_session_detail_from_doc(session, line_summary))

    return result


@router.get("/user-workflows", response_model=list[UserWorkflowSummary])
async def get_user_workflows(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(require_role("supervisor", "admin")),
) -> list[UserWorkflowSummary]:
    """Return the currently running workflow grouped by user."""
    del current_user  # Authorization is enforced by the dependency above.

    active_sessions_cursor = db.sessions.find(
        {
            "status": {"$in": ACTIVE_SESSION_STATUSES},
            "$and": [
                {"$or": [{"closed_at": {"$exists": False}}, {"closed_at": {"$in": [None, ""]}}]},
                {
                    "$or": [
                        {"finalized_at": {"$exists": False}},
                        {"finalized_at": {"$in": [None, ""]}},
                    ]
                },
            ],
        }
    ).sort("last_heartbeat", -1)
    active_sessions = await active_sessions_cursor.to_list(length=200)

    session_ids = [
        session.get("id") or session.get("session_id")
        for session in active_sessions
        if isinstance(session.get("id") or session.get("session_id"), str)
        and (session.get("id") or session.get("session_id"))
    ]

    session_meta_by_id: dict[str, dict[str, Any]] = {}
    for document in active_sessions:
        document_id = document.get("id") or document.get("session_id")
        if isinstance(document_id, str) and document_id:
            session_meta_by_id[document_id] = document

    session_counts_by_id: dict[str, dict[str, Any]] = {}
    if session_ids:
        session_count_rows = await db.count_lines.aggregate(
            [
                {"$match": {"session_id": {"$in": session_ids}}},
                {
                    "$group": {
                        "_id": "$session_id",
                        "items_counted": {"$sum": 1},
                        "reviewed_items": {
                            "$sum": {"$cond": [{"$in": ["$status", ["approved", "locked"]]}, 1, 0]}
                        },
                        "last_counted_at": {"$max": {"$ifNull": ["$updated_at", "$counted_at"]}},
                    }
                },
            ]
        ).to_list(length=max(len(session_ids), 1))

        session_counts_by_id = {
            row["_id"]: row for row in session_count_rows if isinstance(row.get("_id"), str)
        }

    pending_rows = await db.count_lines.aggregate(
        [
            {
                "$match": {
                    "counted_by": {"$exists": True, "$nin": [None, ""]},
                    **PENDING_APPROVAL_MATCH,
                }
            },
            {
                "$group": {
                    "_id": "$counted_by",
                    "pending_approvals": {"$sum": 1},
                    "pending_review_since": {"$min": {"$ifNull": ["$submitted_at", "$counted_at"]}},
                    "last_pending_at": {"$max": {"$ifNull": ["$updated_at", "$counted_at"]}},
                }
            },
        ]
    ).to_list(length=500)
    pending_by_user = {row["_id"]: row for row in pending_rows if isinstance(row.get("_id"), str)}

    recount_rows = await db.count_lines.aggregate(
        [
            {"$match": OPEN_RECOUNT_MATCH},
            {
                "$group": {
                    "_id": "$assigned_to",
                    "assigned_recounts": {"$sum": 1},
                    "recount_assigned_at": {
                        "$min": {
                            "$ifNull": [
                                "$recount_requested_at",
                                {"$ifNull": ["$rejected_at", "$counted_at"]},
                            ]
                        }
                    },
                    "last_recount_at": {
                        "$max": {
                            "$ifNull": [
                                "$rejected_at",
                                {"$ifNull": ["$updated_at", "$counted_at"]},
                            ]
                        }
                    },
                }
            },
        ]
    ).to_list(length=500)
    recount_by_user = {row["_id"]: row for row in recount_rows if isinstance(row.get("_id"), str)}

    sessions_by_user: dict[str, list[dict[str, Any]]] = {}
    candidate_usernames = set(pending_by_user.keys()) | set(recount_by_user.keys())

    for session in active_sessions:
        username = session.get("staff_user") or session.get("user_id")
        if not isinstance(username, str) or not username:
            continue
        candidate_usernames.add(username)
        sessions_by_user.setdefault(username, []).append(session)

    if not candidate_usernames:
        return []

    user_docs = await db.users.find({"username": {"$in": sorted(candidate_usernames)}}).to_list(
        length=len(candidate_usernames)
    )
    user_by_username = {
        user.get("username"): user
        for user in user_docs
        if isinstance(user.get("username"), str) and user.get("username")
    }

    results: list[UserWorkflowSummary] = []

    for username in sorted(candidate_usernames):
        user_sessions = sessions_by_user.get(username, [])
        user_sessions.sort(
            key=lambda item: _coerce_datetime(item.get("last_heartbeat")) or datetime.min,
            reverse=True,
        )
        active_session = user_sessions[0] if user_sessions else None
        active_session_id = (
            (active_session.get("id") or active_session.get("session_id"))
            if active_session
            else None
        )
        session_meta = session_meta_by_id.get(active_session_id, {}) if active_session_id else {}
        session_counts = (
            session_counts_by_id.get(active_session_id, {}) if active_session_id else {}
        )

        pending_info = pending_by_user.get(username, {})
        recount_info = recount_by_user.get(username, {})
        items_counted = int(session_counts.get("items_counted", 0) or 0)
        reviewed_items = int(session_counts.get("reviewed_items", 0) or 0)
        total_items = int(session_meta.get("total_items", 0) or 0)
        progress_percent = round((items_counted / total_items) * 100, 1) if total_items > 0 else 0.0
        pending_review_since = _coerce_datetime(
            pending_info.get("pending_review_since") or pending_info.get("last_pending_at")
        )
        recount_assigned_at = _coerce_datetime(
            recount_info.get("recount_assigned_at") or recount_info.get("last_recount_at")
        )

        last_activity = _max_datetime(
            active_session.get("last_heartbeat") if active_session else None,
            session_counts.get("last_counted_at"),
            pending_info.get("last_pending_at"),
            recount_info.get("last_recount_at"),
        )
        session_status = _normalize_session_status(
            _effective_session_status(active_session).value if active_session else None
        )
        workflow_stage = _derive_workflow_stage(
            session_status,
            int(pending_info.get("pending_approvals", 0) or 0),
            int(recount_info.get("assigned_recounts", 0) or 0),
        )
        presence_status = _derive_presence_status(last_activity)
        priority_score = _calculate_priority_score(
            workflow_stage=workflow_stage,
            presence_status=presence_status,
            session_status=session_status,
            pending_approvals=int(pending_info.get("pending_approvals", 0) or 0),
            assigned_recounts=int(recount_info.get("assigned_recounts", 0) or 0),
            total_variance=float(session_meta.get("total_variance", 0) or 0),
            pending_review_since=pending_review_since,
            recount_assigned_at=recount_assigned_at,
            last_activity=last_activity,
        )

        user_doc = user_by_username.get(username, {})
        results.append(
            UserWorkflowSummary(
                username=username,
                full_name=user_doc.get("full_name"),
                role=user_doc.get("role") or "staff",
                workflow_stage=workflow_stage,
                presence_status=presence_status,
                active_session_id=active_session_id if isinstance(active_session_id, str) else None,
                session_status=session_status,
                session_type=session_meta.get("type"),
                warehouse=session_meta.get("warehouse"),
                rack_id=active_session.get("rack_no") if active_session else None,
                floor=active_session.get("location_name") if active_session else None,
                session_started_at=_max_datetime(
                    session_meta.get("started_at"),
                    active_session.get("started_at") if active_session else None,
                ),
                last_activity=last_activity,
                pending_review_since=pending_review_since,
                recount_assigned_at=recount_assigned_at,
                open_session_count=len(user_sessions),
                items_counted=items_counted,
                reviewed_items=reviewed_items,
                total_items=total_items,
                progress_percent=progress_percent,
                pending_approvals=int(pending_info.get("pending_approvals", 0) or 0),
                assigned_recounts=int(recount_info.get("assigned_recounts", 0) or 0),
                total_variance=float(session_meta.get("total_variance", 0) or 0),
                priority_score=priority_score,
                priority_band=_priority_band_for_score(priority_score),
                next_action=_derive_next_action(
                    workflow_stage=workflow_stage,
                    presence_status=presence_status,
                    session_status=session_status,
                ),
            )
        )

    presence_rank = {
        WorkflowPresenceStatus.ONLINE: 2,
        WorkflowPresenceStatus.IDLE: 1,
        WorkflowPresenceStatus.OFFLINE: 0,
    }
    results.sort(
        key=lambda row: (
            row.priority_score,
            row.active_session_id is not None,
            presence_rank.get(row.presence_status, 0),
            row.last_activity or datetime.min,
        ),
        reverse=True,
    )

    return results


@router.get("/analytics")
async def get_sessions_analytics(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Get aggregated session analytics for supervisor/admin dashboards."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        return {"success": True, "data": await _build_sessions_analytics_payload(db)}
    except Exception as e:
        logger.error(f"Analytics error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{session_id}", response_model=SessionDetail)
async def get_session_detail(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> SessionDetail:
    """Get detailed session information"""
    session = await find_session(db, session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Check access
    if current_user["role"] != "supervisor" and _session_owner(session) != current_user["username"]:
        raise HTTPException(status_code=403, detail="Access denied")

    line_summary = await _get_session_line_summary(db, session_id)
    return _build_session_detail_from_doc(session, line_summary)


@router.get("/{session_id}/stats", response_model=SessionStats)
async def get_session_stats(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> SessionStats:
    """Get session statistics"""
    if session_id.startswith("offline_"):
        return SessionStats(
            id=session_id,
            total_items=0,
            verified_items=0,
            damage_items=0,
            pending_items=0,
            duration_seconds=0,
            items_per_minute=0,
        )

    session = await find_session(db, session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Check access
    if current_user["role"] != "supervisor" and _session_owner(session) != current_user["username"]:
        raise HTTPException(status_code=403, detail="Access denied")

    line_summary = await _get_session_line_summary(db, session_id)
    total_items = int(line_summary.get("item_count", 0) or 0)
    verified_items = int(line_summary.get("verified_count", 0) or 0)
    damage_items = int(line_summary.get("damage_items", 0) or 0)
    pending_items = int(line_summary.get("pending_count", 0) or 0)

    # Calculate duration and rate
    started_at = _datetime_to_timestamp(session.get("started_at")) or time.time()
    duration = max(time.time() - started_at, 0)
    items_per_minute = (verified_items / duration * 60) if duration > 0 else 0

    return SessionStats(
        id=session_id,
        total_items=total_items,
        verified_items=verified_items,
        damage_items=damage_items,
        pending_items=pending_items,
        duration_seconds=duration,
        items_per_minute=round(items_per_minute, 2),
    )


@router.post("/{session_id}/heartbeat", response_model=HeartbeatResponse)
async def session_heartbeat(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> HeartbeatResponse:
    """
    Session heartbeat - maintain locks and presence

    Should be called every 20-30 seconds by active clients

    Actions:
    1. Update user heartbeat in Redis
    2. Renew rack lock if session has rack
    3. Update session last_heartbeat in MongoDB
    """
    user_id = current_user["username"]
    lock_manager = get_lock_manager(redis_service)

    # Get session
    session = await find_session(db, session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    # Verify ownership
    if _session_owner(session) != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    # Update user heartbeat
    await lock_manager.update_user_heartbeat(user_id, ttl=90)

    # Renew rack lock if exists
    rack_lock_renewed = False
    lock_ttl_remaining = 0

    if session.get("rack_no"):
        rack_id = session["rack_no"]
        rack_lock_renewed = await lock_manager.renew_rack_lock(rack_id, user_id, ttl=60)

        if rack_lock_renewed:
            lock_ttl_remaining = await lock_manager.get_rack_lock_ttl(rack_id)

    # Update session last_heartbeat
    heartbeat_at = _current_utc_naive()
    await db.sessions.update_one(
        build_session_lookup(session_id), {"$set": {"last_heartbeat": heartbeat_at}}
    )
    try:
        await db.verification_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"last_heartbeat": time.time()}},
        )
    except Exception:
        logger.debug("Legacy verification_sessions heartbeat mirror skipped", exc_info=True)

    logger.debug(
        f"Heartbeat: session={session_id}, user={user_id}, rack_renewed={rack_lock_renewed}"
    )

    return HeartbeatResponse(
        success=True,
        id=session_id,
        rack_lock_renewed=rack_lock_renewed,
        user_presence_updated=True,
        lock_ttl_remaining=max(0, lock_ttl_remaining),
        message="Heartbeat received",
    )


@router.put("/{session_id}/status")
async def update_session_status(
    session_id: str,
    status: str = Query(..., description="New status"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Update session status (e.g. to RECONCILE)
    """
    user_id = current_user["username"]

    session = await find_session(db, session_id)

    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if is_session_finalized(session):
        raise HTTPException(status_code=409, detail="Finalized sessions cannot be modified")

    # Verify ownership or supervisor
    if current_user["role"] not in {"supervisor", "admin"} and _session_owner(session) != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    normalized_status = status.upper()
    current_status = _effective_session_status(session).value

    if not SessionStateMachine.can_transition(current_status, normalized_status):
        raise HTTPException(
            status_code=409,
            detail=f"Invalid session transition: {current_status} -> {normalized_status}",
        )

    now_dt = _current_utc_naive()
    session_update: dict[str, Any] = {"last_heartbeat": now_dt}
    if normalized_status == "RECONCILE":
        session_update.update({"status": "ACTIVE", "reconciled_at": now_dt})
    elif normalized_status == "ACTIVE":
        session_update.update({"status": "ACTIVE", "reconciled_at": None})
    elif normalized_status == "PAUSED":
        session_update["status"] = "PAUSED"
    else:
        session_update["status"] = normalized_status

    await db.sessions.update_one(build_session_lookup(session_id), {"$set": session_update})
    try:
        await db.verification_sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "status": normalized_status,
                    "last_heartbeat": time.time(),
                }
            },
        )
    except Exception:
        logger.debug("Legacy verification_sessions status mirror skipped", exc_info=True)

    # Broadcast update
    await manager.broadcast_to_session(
        message={
            "type": "session_update",
            "payload": {
                "session_id": session_id,
                "status": normalized_status,
                "updated_by": user_id,
                "updated_at": time.time(),
            },
        },
        session_id=session_id,
    )

    # Also notify the user personally in case they are not subscribed to the session channel yet
    # or to ensure they get the message on their user channel
    session_owner = _session_owner(session)
    if session_owner != user_id:  # If supervisor updated it
        await manager.send_personal_message(
            message={
                "type": "session_update",
                "payload": {
                    "session_id": session_id,
                    "status": normalized_status,
                    "reason": "Supervisor update",
                },
            },
            user_id=session_owner,
        )

    return {"success": True, "id": session_id, "status": normalized_status}


async def _finalize_session_canonical(
    session_id: str,
    db: AsyncIOMotorDatabase,
    current_user: dict[str, Any],
    lock_manager: Any,
    *,
    note: Optional[str] = None,
) -> dict[str, Any]:
    session = await find_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Supervisor access required")

    if is_session_finalized(session):
        raise HTTPException(status_code=409, detail="Session is already finalized")

    if _effective_session_status(session) != CanonicalSessionStatus.RECONCILE:
        raise HTTPException(
            status_code=409,
            detail="Session must be in RECONCILE before finalization",
        )

    await recompute_session_totals(db, session_id)
    lines = await get_session_count_lines(db, session_id)
    blocking_lines = [line for line in lines if is_blocking_finalization(line)]
    if blocking_lines:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Session has unresolved count lines and cannot be finalized",
                "blocking_count": len(blocking_lines),
                "blocking_line_ids": [
                    str(line.get("id") or line.get("_id")) for line in blocking_lines[:25]
                ],
            },
        )

    finalized_at = _current_utc_naive()
    finalized_by = current_user["username"]
    line_update: dict[str, Any] = {
        "status": "locked",
        "approval_status": "APPROVED",
        "verified": True,
        "verified_by": finalized_by,
        "verified_at": finalized_at,
        "approved_by": finalized_by,
        "approved_at": finalized_at,
        "finalized_by": finalized_by,
        "finalized_at": finalized_at,
        "updated_at": finalized_at,
        "updated_by": finalized_by,
    }
    if note:
        line_update["finalization_note"] = note

    await db.count_lines.update_many(
        {
            "session_id": session_id,
            "status": {"$ne": "locked"},
            "approval_status": {"$nin": ["REJECTED", "NEEDS_REVIEW"]},
        },
        {"$set": line_update},
    )
    totals = await recompute_session_totals(db, session_id)

    session_update: dict[str, Any] = {
        "status": "COMPLETED",
        "finalization_status": "FINALIZED",
        "finalized_at": finalized_at,
        "finalized_by": finalized_by,
        "completed_at": finalized_at,
        "closed_at": finalized_at,
        "last_heartbeat": finalized_at,
        **totals,
    }
    if note:
        session_update["finalization_note"] = note

    await db.sessions.update_one(build_session_lookup(session_id), {"$set": session_update})
    try:
        await db.verification_sessions.update_one(
            {"session_id": session_id},
            {
                "$set": {
                    "status": "COMPLETED",
                    "completed_at": finalized_at.timestamp(),
                    "last_heartbeat": finalized_at.timestamp(),
                }
            },
        )
    except Exception:
        logger.debug("Legacy verification_sessions finalize mirror skipped", exc_info=True)

    if session.get("rack_no"):
        await lock_manager.release_rack_lock(session["rack_no"], session.get("staff_user"))
        try:
            await db.rack_registry.update_one(
                {"rack_id": session["rack_no"]},
                {"$set": {"status": "completed", "updated_at": time.time()}},
            )
        except Exception:
            logger.debug("Rack registry finalize mirror skipped", exc_info=True)

    try:
        await lock_manager.delete_session(session_id)
    except Exception:
        logger.debug("Session lock deletion skipped during completion", exc_info=True)

    await manager.broadcast_to_session(
        message={
            "type": "session_completed",
            "payload": {
                "session_id": session_id,
                "completed_by": finalized_by,
                "completed_at": finalized_at.timestamp(),
                "status": "COMPLETED",
            },
        },
        session_id=session_id,
    )

    return {
        "success": True,
        "id": session_id,
        "status": "COMPLETED",
        "finalized_at": finalized_at.isoformat(),
        "finalized_by": finalized_by,
        "message": "Session finalized successfully",
    }


async def _complete_session_legacy_compatible(
    session_id: str,
    db: AsyncIOMotorDatabase,
    current_user: dict[str, Any],
    lock_manager: Any,
) -> dict[str, Any]:
    user_id = current_user["username"]
    canonical_session = await find_session(db, session_id)

    legacy_session: Optional[dict[str, Any]] = None
    try:
        legacy_session = await db.verification_sessions.find_one({"session_id": session_id})
    except Exception:
        logger.debug("Legacy verification session lookup skipped", exc_info=True)

    if not canonical_session and not legacy_session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    session_owner = (
        _session_owner(canonical_session)
        or (legacy_session or {}).get("user_id")
        or ""
    )
    if current_user.get("role") not in {"supervisor", "admin"} and session_owner != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    if canonical_session and is_session_finalized(canonical_session):
        raise HTTPException(status_code=409, detail="Session is already finalized")

    current_status = (
        _effective_session_status(canonical_session).value
        if canonical_session
        else str((legacy_session or {}).get("status") or "").upper()
    )
    if not SessionStateMachine.can_transition(current_status, "CLOSED"):
        raise HTTPException(
            status_code=409,
            detail=f"Invalid session transition: {current_status} -> CLOSED",
        )

    completed_at = _current_utc_naive()
    rack_id = (
        (canonical_session or {}).get("rack_no")
        or (legacy_session or {}).get("rack_id")
        or None
    )

    if rack_id:
        await lock_manager.release_rack_lock(rack_id, session_owner or user_id)
        try:
            await db.rack_registry.update_one(
                {"rack_id": rack_id},
                {"$set": {"status": "completed", "updated_at": time.time()}},
            )
        except Exception:
            logger.debug("Rack registry completion mirror skipped", exc_info=True)

    if legacy_session:
        await db.verification_sessions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "CLOSED", "completed_at": completed_at.timestamp()}},
        )

    if canonical_session:
        await db.sessions.update_one(
            build_session_lookup(session_id),
            {
                "$set": {
                    "status": "CLOSED",
                    "closed_at": completed_at,
                    "completed_at": completed_at,
                    "last_heartbeat": completed_at,
                }
            },
        )

    try:
        await lock_manager.delete_session(session_id)
    except Exception:
        logger.debug("Session lock deletion skipped during finalization", exc_info=True)

    await manager.broadcast_to_session(
        message={
            "type": "session_completed",
            "payload": {
                "session_id": session_id,
                "completed_by": user_id,
                "completed_at": completed_at.timestamp(),
                "status": "CLOSED",
            },
        },
        session_id=session_id,
    )

    return {
        "success": True,
        "id": session_id,
        "status": "CLOSED",
        "message": "Session completed successfully",
    }


@router.post("/{session_id}/finalize")
async def finalize_session(
    session_id: str,
    request: Optional[SessionFinalizeRequest] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> dict[str, Any]:
    lock_manager = get_lock_manager(redis_service)
    return await _finalize_session_canonical(
        session_id,
        db,
        current_user,
        lock_manager,
        note=request.note if request else None,
    )


@router.post("/{session_id}/complete")
async def complete_session(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> dict[str, Any]:
    """
    Complete session and release rack.

    This legacy endpoint preserves the historical owner-compatible close flow.
    """
    lock_manager = get_lock_manager(redis_service)
    return await _complete_session_legacy_compatible(session_id, db, current_user, lock_manager)


@router.get("/user/history")
async def get_user_session_history(
    limit: int = Query(10, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> list[SessionDetail]:
    """Get user's session history (completed sessions)"""
    user_id = current_user["username"]

    sessions_cursor = (
        db.sessions.find(
            {"staff_user": user_id, "status": {"$in": ["COMPLETED", "CLOSED"]}}
        )
        .sort("completed_at", -1)
        .limit(limit)
    )

    sessions = await sessions_cursor.to_list(length=limit)

    result = []
    for session in sessions:
        session_identifier = str(session.get("id") or session.get("session_id"))
        line_summary = await _get_session_line_summary(db, session_identifier)
        result.append(_build_session_detail_from_doc(session, line_summary))

    return result


@router.get("/{session_id}/integrity", response_model=SessionIntegrityResponse)
async def check_session_integrity(
    session_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
) -> SessionIntegrityResponse:
    """Check if master data has changed since session start (FR-M-34)"""
    session = await find_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    start_time = session.get("started_at")
    # Handle datetime vs float mismatch
    if isinstance(start_time, datetime):
        start_ts = start_time.timestamp()
        start_dt = start_time
    else:
        start_ts = float(start_time or 0)
        start_dt = datetime.fromtimestamp(start_ts)

    # Check for items updated after session start
    affected_count = await db.erp_items.count_documents({"updated_at": {"$gt": start_dt}})

    # Get last sync time
    sync_meta = await db.sync_metadata.find_one({"_id": "sql_qty_sync"})
    last_sync_ts = None
    if sync_meta and "last_sync" in sync_meta:
        ls = sync_meta["last_sync"]
        last_sync_ts = ls.timestamp() if isinstance(ls, datetime) else float(ls)

    valid = affected_count == 0

    msg = "Session integrity verified."
    if not valid:
        msg = f"Warning: {affected_count} items updated in master data since session start."

    return SessionIntegrityResponse(
        valid=valid,
        last_sync=last_sync_ts,
        session_start=start_ts,
        updates_detected=not valid,
        affected_items=affected_count,
        message=msg,
    )


@router.post("/logout-all")
async def logout_all_sessions(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict[str, Any] = Depends(get_current_user),
    refresh_token_service=Depends(get_refresh_token_service),
) -> dict[str, Any]:
    """
    Logout all active sessions for the current user (Phase 1 Governance)
    Mandatory endpoint to resolve AUTH_SESSION_CONFLICT
    """
    username = current_user["username"]
    logger.info(f"Revoking all sessions for user: {username}")

    # 1. Revoke all refresh tokens
    revoked_tokens = await refresh_token_service.revoke_all_user_tokens(username)

    # 2. Close all active session records
    # Update sessions collection
    sess_result = await db.sessions.update_many(
        {"staff_user": username, "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]}},
        {"$set": {"status": "CLOSED", "completed_at": _current_utc_naive()}},
    )

    # Update verification_sessions collection
    v_sess_result = await db.verification_sessions.update_many(
        {"user_id": username, "status": {"$in": ["OPEN", "ACTIVE", "RECONCILE"]}},
        {"$set": {"status": "CLOSED", "completed_at": time.time()}},
    )

    # 3. Release any rack locks (if any)
    # This might require iterating or a more complex query if we had many,
    # but for now we rely on the session heartbeat timeout to clean up Redis.

    return {
        "success": True,
        "username": username,
        "revoked_tokens": revoked_tokens,
        "closed_sessions": sess_result.modified_count + v_sess_result.modified_count,
        "message": "All active sessions have been logged out.",
    }
