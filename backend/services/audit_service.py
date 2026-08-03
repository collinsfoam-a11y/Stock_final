from datetime import datetime, timezone
from typing import Any

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
        actor_id: str | None = None,
        actor_username: str | None = None,
        ip_address: str | None = None,
        resource_id: str | None = None,
        details: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> str:
        """
        Create a new audit log entry.
        Accepts additional keyword arguments (e.g., `action`) for compatibility
        with callers that pass extra parameters. Extraneous kwargs are safely ignored.
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
        user_id: str | None = None,
        event_type: AuditEventType | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> list[AuditLog]:
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
