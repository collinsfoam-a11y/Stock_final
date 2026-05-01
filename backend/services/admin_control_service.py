"""Persistence helpers for admin control endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from backend.auth.dependencies import auth_deps
from backend.db.runtime import get_db
from backend.services.system_report_service import SystemReportService
from backend.services.watchdog_service import WatchdogService


class AdminControlService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def ping_auth_database(self) -> bool:
        if not auth_deps._initialized:
            return False
        await auth_deps.db.command("ping")
        return True

    async def get_recent_login_sessions(self) -> list[dict[str, Any]]:
        cursor = (
            self._database.sessions.find(
                {},
                {
                    "_id": 0,
                    "user": 1,
                    "device_info": 1,
                    "ip_address": 1,
                    "last_activity": 1,
                    "created_at": 1,
                },
            )
            .sort("last_activity", -1)
            .limit(100)
        )
        return await cursor.to_list(length=100)

    async def generate_report(
        self,
        report_id: str,
        start_date: str | None,
        end_date: str | None,
        output_format: str,
    ) -> Any:
        return await SystemReportService(self._database).generate_report(
            report_id,
            start_date,
            end_date,
            output_format,
        )

    async def get_system_stats_counts(self) -> dict[str, int]:
        active_threshold = datetime.now() - timedelta(hours=1)
        return {
            "total_users": await self._database.users.count_documents({}),
            "total_sessions": await self._database.sessions.count_documents({}),
            "active_sessions": await self._database.sessions.count_documents(
                {"last_activity": {"$gte": active_threshold}}
            ),
        }

    async def run_watchdog_checks(self) -> None:
        await WatchdogService(self._database).run_all_checks()


def get_admin_control_service() -> AdminControlService:
    return AdminControlService(get_db())
