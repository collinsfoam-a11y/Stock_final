from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.models.audit import AuditEventType, AuditLog, AuditLogStatus


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
    ) -> str:
        """
        Create a new audit log entry.
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
        )

        result = await self.collection.insert_one(
            log_entry.model_dump(by_alias=True, exclude={"id"})
        )
        return str(result.inserted_id)

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
