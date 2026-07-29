"""
Recount Service

Blind recount workflow:
- New staff member receives assignment with hidden fields.
- Upon submission the system compares primary vs recount.
- Supervisor decides when they differ.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from backend.models.approval import (
    RecountComparisonResult,
    RecountRequest,
)
from backend.api.schemas import CountObservationStatus
from backend.services.approval_engine import ApprovalEngine

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RecountService:
    def __init__(self, approval_engine: ApprovalEngine):
        self.approval_engine = approval_engine

    async def create_request(
        self,
        db,
        observation_id: str,
        session_id: str,
        item_code: str,
        requested_by: str,
        reason: str,
        scope: str = "ITEM",
        batch_or_serial_scope: Optional[str] = None,
        location_id: Optional[str] = None,
        required_evidence: Optional[list[str]] = None,
        priority: str = "NORMAL",
        is_blind: bool = True,
        assigned_to: Optional[str] = None,
    ) -> RecountRequest:
        request = RecountRequest(
            id=str(__import__("uuid").uuid4()),
            observation_id=observation_id,
            session_id=session_id,
            item_code=item_code,
            requested_by=requested_by,
            request_reason=reason,
            scope=scope,
            batch_or_serial_scope=batch_or_serial_scope,
            location_id=location_id,
            required_evidence=required_evidence or [],
            priority=priority,
            is_blind=is_blind,
            status=CountObservationStatus.RECOUNT_REQUESTED.value,
            assigned_to=assigned_to,
            assigned_at=_utc_now() if assigned_to else None,
        )
        request_doc = request.model_dump()
        await db["recount_requests"].insert_one(request_doc)
        logger.info("Created recount request %s for observation %s", request.id, observation_id)
        return request

    async def assign(self, db, request_id: str, assigned_to: str) -> Optional[RecountRequest]:
        result = await db["recount_requests"].find_one_and_update(
            {"id": request_id},
            {
                "$set": {
                    "assigned_to": assigned_to,
                    "assigned_at": _utc_now(),
                    "status": CountObservationStatus.RECOUNT_ASSIGNED.value,
                    "updated_at": _utc_now(),
                }
            },
            return_document=True,
        )
        if result:
            return RecountRequest(**result)
        return None

    async def start(self, db, request_id: str) -> Optional[RecountRequest]:
        result = await db["recount_requests"].find_one_and_update(
            {"id": request_id},
            {"$set": {"started_at": _utc_now(), "status": CountObservationStatus.RECOUNT_IN_PROGRESS.value, "updated_at": _utc_now()}},
            return_document=True,
        )
        if result:
            return RecountRequest(**result)
        return None

    async def submit_recount(
        self, db, request_id: str, observation_payload: dict[str, Any]
    ) -> RecountComparisonResult:
        request_doc = await db["recount_requests"].find_one({"id": request_id})
        if not request_doc:
            raise ValueError("Recount request not found")

        original_observation_id = request_doc["observation_id"]
        original = await db["count_observations"].find_one({"id": original_observation_id})
        if not original:
            raise ValueError("Original observation not found")

        original_count = float(original.get("counted_qty") or 0)
        recount_count = float(observation_payload.get("counted_qty") or 0)
        sql_at_recount = float(observation_payload.get("sql_qty_at_submission") or 0)
        difference = round(recount_count - original_count, 4)
        matches_sql = abs(recount_count - sql_at_recount) <= 0.0001
        original_variance = float(original.get("variance") or 0)
        recount_variance = round(recount_count - sql_at_recount, 4)

        if difference == 0 and matches_sql:
            decision = CountObservationStatus.RECOUNT_MATCHED.value
        elif matches_sql:
            decision = CountObservationStatus.RECOUNT_MATCHED.value
        else:
            decision = CountObservationStatus.RECOUNT_DIFFERENCE.value

        observation_payload["is_recount"] = True
        observation_payload["recount_of_id"] = original_observation_id
        observation_payload["recount_is_blind"] = request_doc.get("is_blind", True)
        observation_payload["sql_qty_at_recount"] = sql_at_recount
        if not observation_payload.get("id"):
            observation_payload["id"] = str(__import__("uuid").uuid4())
        observation_payload["created_at"] = _utc_now().isoformat()
        observation_payload["updated_at"] = _utc_now().isoformat()
        await db["count_observations"].insert_one(observation_payload)

        result_doc = {
            "id": str(__import__("uuid").uuid4()),
            "original_observation_id": original_observation_id,
            "recount_observation_id": observation_payload["id"],
            "original_count": original_count,
            "recount_count": recount_count,
            "sql_at_recount": sql_at_recount,
            "difference": difference,
            "matches_sql": matches_sql,
            "decision": decision,
            "original_variance": original_variance,
            "recount_variance": recount_variance,
        }
        await db["recount_comparisons"].insert_one(result_doc)

        await db["recount_requests"].find_one_and_update(
            {"id": request_id},
            {
                "$set": {
                    "status": decision,
                    "submitted_at": _utc_now(),
                    "linked_recount_observation_id": observation_payload["id"],
                    "resolved_at": _utc_now(),
                    "updated_at": _utc_now(),
                }
            },
        )

        return RecountComparisonResult(**result_doc)
