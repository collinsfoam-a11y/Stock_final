import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.services.audit_service import AuditEventType, AuditLogStatus, AuditService

logger = logging.getLogger(__name__)


class WatchdogService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.audit_service = AuditService(db)

    async def check_velocity_anomalies(self, time_window_seconds: int = 60, max_count: int = 10):
        """
        Check for users performing impossible number of actions within a time window.
        Example: > 10 stock counts in 1 minute.
        """
        try:
            window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
                seconds=time_window_seconds
            )

            pipeline: list[dict[str, Any]] = [
                {
                    "$match": {
                        "timestamp": {"$gte": window_start},
                        "event_type": AuditEventType.STOCK_COUNT_SUBMITTED,
                    }
                },
                {
                    "$group": {
                        "_id": "$actor_id",
                        "username": {"$first": "$actor_username"},
                        "count": {"$sum": 1},
                    }
                },
                {"$match": {"count": {"$gt": max_count}}},
            ]

            anomalies = await self.db.audit_logs.aggregate(pipeline).to_list(None)

            for anomaly in anomalies:
                await self._raise_alert(
                    f"Velocity Anomaly: User {anomaly.get('username')} performed {anomaly.get('count')} actions in {time_window_seconds}s",
                    details=anomaly,
                )

        except Exception as e:
            logger.error(f"Watchdog velocity check failed: {e}")

    async def check_brute_force_aggregation(
        self, time_window_seconds: int = 300, max_failures: int = 20
    ):
        """
        Check for high volume of login failures across the system (Distributed Brute Force).
        """
        try:
            window_start = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
                seconds=time_window_seconds
            )

            count = await self.db.audit_logs.count_documents(
                {
                    "timestamp": {"$gte": window_start},
                    "event_type": AuditEventType.AUTH_LOGIN_FAILED,
                }
            )

            if count > max_failures:
                await self._raise_alert(
                    f"Brute Force Alert: {count} failed logins in {time_window_seconds}s",
                    details={"fail_count": count},
                )

        except Exception as e:
            logger.error(f"Watchdog brute force check failed: {e}")

    async def check_system_health(self):
        """
        Simple health check for DB latency.
        """
        start = datetime.now(timezone.utc).replace(tzinfo=None)
        try:
            await self.db.command("ping")
            latency = (
                datetime.now(timezone.utc).replace(tzinfo=None) - start
            ).total_seconds() * 1000

            if latency > 500:  # 500ms threshold
                await self._raise_alert(
                    f"High DB Latency: {latency:.2f}ms", details={"latency_ms": latency}
                )
        except Exception as e:
            await self._raise_alert(f"DB Health Check Failed: {e}")

    async def _raise_alert(self, message: str, details: Dict[str, Any] = None):
        """
        Log a system alert.
        """
        logger.warning(f"WATCHDOG ALERT: {message}")
        try:
            await self.audit_service.log_event(
                event_type=AuditEventType.SYSTEM_ALERT,
                status=AuditLogStatus.WARNING,
                details={"message": message, "data": details or {}},
            )
        except Exception as e:
            logger.error(f"Failed to log watchdog alert: {e}")

    async def run_all_checks(self):
        """Run all monitoring checks."""
        await self.check_velocity_anomalies()
        await self.check_brute_force_aggregation()
        await self.check_system_health()
