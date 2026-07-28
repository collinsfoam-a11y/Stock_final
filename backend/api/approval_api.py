"""
Approval API - Supervisor review, auto-approval runtime, ad-hoc recount
"""

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from backend.api.schemas import (
    AdditionalLocationResponse,
    ApprovalExceptionType,
    CountObservationStatus,
    ReviewQueueType,
    SqlAvailability,
    SqlComparisonSource,
    SystemRecommendation,
)
from backend.auth.dependencies import auth_deps
from backend.auth.permissions import Permission, require_permission
from backend.models.approval import (
    AdditionalLocationInvestigation,
    ApprovalDecision,
    RecountRequest,
    SessionApprovalSummary,
    SupervisorReviewCard,
)
from backend.services.approval_engine import ApprovalEngine
from backend.services.recount_service import RecountService

logger = __import__("logging").getLogger(__name__)
router = APIRouter(prefix="/api/approval", tags=["Approval"])


def get_db() -> AsyncIOMotorDatabase:
    if not auth_deps.db:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database not initialized",
        )
    return auth_deps.db


def get_count_line_service():
    from backend.services.count_line_write_service import CountLineWriteService
    return CountLineWriteService(get_db())


def get_approval_engine() -> ApprovalEngine:
    return ApprovalEngine(count_line_service=get_count_line_service())


def get_recount_service() -> RecountService:
    return RecountService(approval_engine=get_approval_engine())


class SupervisorDecideRequest(BaseModel):
    action: str
    reason: Optional[str] = None
    notes: Optional[str] = None
    corrected_classification: Optional[str] = None
    target_batch_id: Optional[str] = None
    assign_to: Optional[str] = None
    is_blind: Optional[bool] = None


class RecountCreateRequest(BaseModel):
    observation_id: str
    request_reason: str
    scope: str = "ITEM"
    batch_or_serial_scope: Optional[str] = None
    location_id: Optional[str] = None
    required_evidence: Optional[list[str]] = None
    priority: str = "NORMAL"
    is_blind: bool = True
    assigned_to: Optional[str] = None


class AdditionalLocationResponseRequest(BaseModel):
    observation_id: str
    response: str
    suspected_location: Optional[str] = None
    observed_or_estimated_qty: Optional[float] = None
    staff_remark: Optional[str] = None
    staff_confidence: Optional[str] = None
    photo_urls: Optional[list[str]] = None


class EvaluationResponse(BaseModel):
    observation_id: str
    approved: bool
    sql_quantity_source: Optional[str] = None
    sql_comparison_source: Optional[str] = None
    block_reason: Optional[str] = None


@router.post("/observations/{observation_id}/evaluate", response_model=EvaluationResponse)
async def evaluate_observation(
    observation_id: str,
    engine: ApprovalEngine = Depends(get_approval_engine),
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_READ),
):
    observation = await db["count_observations"].find_one({"id": observation_id})
    if not observation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Observation not found"}},
        )
    result = await engine.evaluate(observation, db)
    await db["count_observations"].update_one({"id": observation_id}, {"$set": observation})
    return EvaluationResponse(
        observation_id=result.observation_id,
        approved=result.approved,
        sql_quantity_source=result.sql_quantity_source.value if result.sql_quantity_source else None,
        sql_comparison_source=result.sql_comparison_source,
        block_reason=result.block_reason,
    )


@router.get("/supervisor/queues/{queue_type}")
async def supervisor_queue(
    queue_type: str,
    session_id: Optional[str] = Query(None),
    limit: int = Query(100),
    service: ApprovalEngine = Depends(get_approval_engine),
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    queue_type_upper = queue_type.upper()
    valid_queues = [q.value for q in ReviewQueueType]
    if queue_type_upper not in valid_queues:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"success": False, "error": {"code": "INVALID_QUEUE", "message": f"Valid queues: {valid_queues}"}},
        )
    query = {"approval_status": CountObservationStatus.SUPERVISOR_REVIEW.value}
    if session_id:
        query["session_id"] = session_id
    if queue_type_upper == ReviewQueueType.QUANTITY_VARIANCE.value:
        query["variance"] = {"$ne": 0}
    elif queue_type_upper == ReviewQueueType.SYNC_CONFLICTS.value:
        query["exception_types"] = {"$in": [ApprovalExceptionType.SYNC_CONFLICT.value]}
    cursor = db["count_observations"].find(query).limit(limit)
    observations = await cursor.to_list(length=limit)
    cards = []
    for obs in observations:
        cards.append(
            SupervisorReviewCard(
                observation_id=obs.get("id", ""),
                session_id=obs.get("session_id", ""),
                queue_type=queue_type_upper,
                staff_user=obs.get("created_by", ""),
                location=obs.get("location_id") or obs.get("rack_no"),
                item_identity={
                    "item_code": obs.get("item_code", ""),
                    "item_name": obs.get("item_name"),
                    "barcode": obs.get("barcode"),
                },
                tracking_mode="UNKNOWN",
                sql_qty_at_submission=obs.get("sql_qty_at_submission"),
                physical_qty=float(obs.get("counted_qty") or 0),
                variance=obs.get("variance"),
                system_recommendation=obs.get("system_recommendation") or "SUPERVISOR_REVIEW",
                exception_types=[e if isinstance(e, str) else str(e) for e in (obs.get("exception_types") or [])],
            ).model_dump()
        )
    return {"success": True, "data": {"queue_type": queue_type_upper, "items": cards, "total": len(cards)}}


@router.post("/supervisor/observations/{observation_id}/decide")
async def supervisor_decide(
    observation_id: str,
    payload: SupervisorDecideRequest,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    observation = await db["count_observations"].find_one({"id": observation_id})
    if not observation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Observation not found"}},
        )
    decided_by = current_user.get("username") or current_user.get("id")
    update: dict[str, Any] = {
        "supervisor_decision": payload.action,
        "supervisor_notes": payload.notes,
        "decided_by": decided_by,
        "decided_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).replace(tzinfo=None),
        "updated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).replace(tzinfo=None),
    }
    if payload.corrected_classification:
        update["item_condition"] = payload.corrected_classification
    if payload.action == "APPROVE":
        update["approval_status"] = "APPROVED"
        update["status"] = CountObservationStatus.APPROVED.value
    elif payload.action == "REJECT":
        update["approval_status"] = "REJECTED"
        update["status"] = CountObservationStatus.REJECTED.value
    elif payload.action == "REQUEST_RECOUNT":
        recount_service = get_recount_service()
        request = await recount_service.create_request(
            db=db,
            observation_id=observation_id,
            session_id=observation.get("session_id", ""),
            item_code=observation.get("item_code", ""),
            requested_by=decided_by,
            reason=payload.reason or "supervisor_decision",
            priority="HIGH",
            is_blind=payload.is_blind if payload.is_blind is not None else True,
            assigned_to=payload.assign_to,
        )
        update["status"] = CountObservationStatus.RECOUNT_REQUESTED.value
        update["approval_status"] = "RECOUNT_REQUESTED"
        await db["recount_requests"].update_one({"id": request.id}, {"$set": {"observation_id": observation_id}})
    elif payload.action == "ADJUST_COUNT":
        update["approval_status"] = "ADJUSTED"
        update["status"] = CountObservationStatus.APPROVED.value

    decision_doc = {
        "id": str(__import__("uuid").uuid4()),
        "observation_id": observation_id,
        "session_id": observation.get("session_id"),
        "decided_by": decided_by,
        "decided_at": update["decided_at"],
        "action": payload.action,
        "reason": payload.reason,
        "notes": payload.notes,
        "corrected_classification": payload.corrected_classification,
        "observation_snapshot": observation,
    }
    await db["approval_decisions"].insert_one(decision_doc)
    await db["count_observations"].update_one({"id": observation_id}, {"$set": update})
    return {"success": True, "data": {"observation_id": observation_id, "decision": payload.action, "decision_id": decision_doc["id"]}}


@router.post("/recount/requests", status_code=status.HTTP_201_CREATED)
async def create_recount_request(
    payload: RecountCreateRequest,
    recount_service: RecountService = Depends(get_recount_service),
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    observation = await db["count_observations"].find_one({"id": payload.observation_id})
    if not observation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Observation not found"}},
        )
    requested_by = current_user.get("username") or current_user.get("id")
    request = await recount_service.create_request(
        db=db,
        observation_id=payload.observation_id,
        session_id=observation.get("session_id", ""),
        item_code=observation.get("item_code", ""),
        requested_by=requested_by,
        reason=payload.request_reason,
        scope=payload.scope,
        batch_or_serial_scope=payload.batch_or_serial_scope,
        location_id=payload.location_id,
        required_evidence=payload.required_evidence,
        priority=payload.priority,
        is_blind=payload.is_blind,
        assigned_to=payload.assigned_to,
    )
    return {"success": True, "data": request.model_dump()}


@router.post("/recount/requests/{request_id}/assign")
async def assign_recount(
    request_id: str,
    assign_to: str,
    recount_service: RecountService = Depends(get_recount_service),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    from backend.db.runtime import get_db
    request = await recount_service.assign(get_db(), request_id, assign_to)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Recount request not found"}},
        )
    return {"success": True, "data": request.model_dump()}


@router.post("/recount/requests/{request_id}/start")
async def start_recount(
    request_id: str,
    recount_service: RecountService = Depends(get_recount_service),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    from backend.db.runtime import get_db
    request = await recount_service.start(get_db(), request_id)
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Recount request not found"}},
        )
    return {"success": True, "data": request.model_dump()}


@router.post("/recount/requests/{request_id}/submit")
async def submit_recount(
    request_id: str,
    payload: dict,
    recount_service: RecountService = Depends(get_recount_service),
    current_user: dict = require_permission(Permission.COUNT_LINE_CREATE),
):
    from backend.db.runtime import get_db
    result = await recount_service.submit_recount(get_db(), request_id, payload)
    return {
        "success": True,
        "data": {
            "original_count": result.original_count,
            "recount_count": result.recount_count,
            "sql_at_recount": result.sql_at_recount,
            "difference": result.difference,
            "matches_sql": result.matches_sql,
            "decision": result.decision,
            "requires_supervisor": not result.matches_sql,
        },
    }


@router.get("/sessions/{session_id}/summary", response_model=SessionApprovalSummary)
async def session_approval_summary(
    session_id: str,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_READ),
):
    cursor = db["count_observations"].find({"session_id": session_id})
    observations = await cursor.to_list(length=1000)
    summary = SessionApprovalSummary(session_id=session_id)
    blocking = []
    for obs in observations:
        st = obs.get("status", "")
        summary.total_observations += 1
        if st == CountObservationStatus.AUTO_APPROVED.value:
            summary.auto_approved += 1
        elif st == CountObservationStatus.APPROVED.value:
            summary.supervisor_approved += 1
        elif st == CountObservationStatus.RECOUNT_REQUESTED.value:
            summary.recount_requested += 1
        elif st in (
            CountObservationStatus.PENDING_INVESTIGATION.value,
            CountObservationStatus.DISTRIBUTED_STOCK_INVESTIGATION.value,
        ):
            summary.pending_investigation += 1
            blocking.append(obs.get("id"))
        elif st == CountObservationStatus.SUPERVISOR_REVIEW.value:
            blocking.append(obs.get("id"))
    summary.blocking_items = blocking
    return summary


@router.post("/sessions/{session_id}/additional-location", status_code=status.HTTP_201_CREATED)
async def create_additional_location_investigation(
    session_id: str,
    payload: AdditionalLocationResponseRequest,
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.COUNT_LINE_CREATE),
):
    observation = await db["count_observations"].find_one({"id": payload.observation_id})
    if not observation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"success": False, "error": {"code": "NOT_FOUND", "message": "Observation not found"}},
        )
    doc = AdditionalLocationInvestigation(
        id=str(__import__("uuid").uuid4()),
        observation_id=payload.observation_id,
        session_id=session_id,
        item_code=observation.get("item_code", ""),
        response=payload.response,
        suspected_location=payload.suspected_location,
        observed_or_estimated_qty=payload.observed_or_estimated_qty,
        staff_remark=payload.staff_remark,
        photo_urls=payload.photo_urls or [],
        staff_confidence=payload.staff_confidence,
        created_by=current_user.get("username") or current_user.get("id"),
    ).model_dump()
    await db["additional_location_investigations"].insert_one(doc)
    if payload.response == AdditionalLocationResponse.NOT_CHECKED.value:
        await db["count_observations"].update_one(
            {"id": payload.observation_id},
            {"$set": {"status": CountObservationStatus.SUPERVISOR_REVIEW.value, "additional_location_response": payload.response}},
        )
    else:
        await db["count_observations"].update_one(
            {"id": payload.observation_id},
            {"$set": {"additional_location_response": payload.response, "linked_location_task_id": doc.get("id"), "status": CountObservationStatus.DISTRIBUTED_STOCK_INVESTIGATION.value}},
        )
    return {"success": True, "data": doc}


@router.get("/reports/supervisor-queues")
async def supervisor_queue_summary(
    db=Depends(get_db),
    current_user: dict = require_permission(Permission.REVIEW_APPROVE),
):
    pipeline = [
        {"$match": {"status": CountObservationStatus.SUPERVISOR_REVIEW.value}},
        {
            "$group": {
                "_id": "$exception_types",
                "count": {"$sum": 1},
                "items": {"$push": {"id": "$id", "item_code": "$item_code", "session_id": "$session_id"}},
            }
        },
    ]
    cursor = db["count_observations"].aggregate(pipeline)
    results = await cursor.to_list(length=100)
    return {"success": True, "data": {"queues": results, "total": len(results)}}
