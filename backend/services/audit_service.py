import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.models.audit import AuditEventType, AuditLog, AuditLogStatus

logger = logging.getLogger(__name__)


class AuditService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.audit_logs

    async def log_event(
        self,
        event_type: AuditEventType,
        status: AuditLogStatus = AuditLogStatus.SUCCESS,
        actor_id: Optional[str] = None,
        actor_username: Optional[str] = None,
        ip_address: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        *,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        session_id: Optional[str] = None,
        count_line_id: Optional[str] = None,
        item_code: Optional[str] = None,
        location_context: Optional[Dict[str, Any]] = None,
        actor_role: Optional[str] = None,
        decision: Optional[str] = None,
        reason: Optional[str] = None,
        before: Optional[Dict[str, Any]] = None,
        after: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        device_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Create a new audit log entry.

        Audit failure must never corrupt the primary business transaction
        (BSR audit design rule): any error writing the record is logged and
        swallowed here rather than propagated to the caller.
        """
        log_entry = AuditLog(
            event_type=event_type,
            status=status,
            actor_id=actor_id,
            actor_username=actor_username,
            ip_address=ip_address,
            resource_id=resource_id,
            details=details or {},
            timestamp=datetime.now(timezone.utc),
            entity_type=entity_type,
            entity_id=entity_id,
            session_id=session_id,
            count_line_id=count_line_id,
            item_code=item_code,
            location_context=location_context,
            actor_role=actor_role,
            decision=decision,
            reason=reason,
            before=before,
            after=after,
            request_id=request_id,
            device_id=device_id,
        )

        try:
            result = await self.collection.insert_one(
                log_entry.model_dump(by_alias=True, exclude={"id"})
            )
            return str(result.inserted_id)
        except Exception as exc:  # pragma: no cover - best-effort by contract
            logger.warning("Audit logging failed for event %s: %s", event_type, exc)
            return None

    async def get_logs(
        self,
        user_id: Optional[str] = None,
        event_type: Optional[AuditEventType] = None,
        limit: int = 50,
        skip: int = 0,
    ) -> List[AuditLog]:
        """
        Retrieve audit logs with optional filtering.
        """
        query = {}
        if user_id:
            query["actor_id"] = user_id
        if event_type:
            query["event_type"] = event_type

        cursor = self.collection.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        return [AuditLog(**log) for log in logs]
