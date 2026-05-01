"""Persistence helpers for reported frontend errors."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.db.runtime import get_db


class ErrorReportingService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def persist_critical_error_event(
        self,
        *,
        error_type: str,
        message: str,
        severity: str,
        user_id: str | None,
        timestamp: datetime | None,
        context: dict[str, Any],
    ) -> None:
        await self._database.system_events.insert_one(
            {
                "event_type": "critical_error_reported",
                "source": "frontend",
                "error_type": error_type,
                "message": message,
                "severity": severity,
                "user_id": user_id,
                "timestamp": timestamp or datetime.now(timezone.utc).replace(tzinfo=None),
                "context": context,
            }
        )


def get_error_reporting_service() -> ErrorReportingService:
    return ErrorReportingService(get_db())
