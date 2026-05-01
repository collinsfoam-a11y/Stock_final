"""Security dashboard read service."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from backend.db.runtime import get_db


def _iso_datetime(value: Any) -> str:
    return value.isoformat() if isinstance(value, datetime) else str(value or "")


class SecurityDashboardService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_failed_logins(
        self,
        *,
        limit: int,
        hours: int,
        username: str | None,
        ip_address: str | None,
    ) -> dict[str, Any]:
        query: dict[str, Any] = {
            "success": False,
            "timestamp": {
                "$gte": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
            },
        }
        if username:
            query["username"] = username
        if ip_address:
            query["ip_address"] = ip_address

        failed_logins = await self._database.login_attempts.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
        for login in failed_logins:
            if "_id" in login:
                login["_id"] = str(login["_id"])
            if "timestamp" in login:
                login["timestamp"] = _iso_datetime(login["timestamp"])

        total_failed = await self._database.login_attempts.count_documents(query)
        ip_pipeline: list[dict[str, Any]] = [
            {"$match": query},
            {"$group": {"_id": "$ip_address", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        user_pipeline: list[dict[str, Any]] = [
            {"$match": query},
            {"$group": {"_id": "$username", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ]
        top_ips = await self._database.login_attempts.aggregate(ip_pipeline).to_list(10)
        top_users = await self._database.login_attempts.aggregate(user_pipeline).to_list(10)
        return {
            "failed_logins": failed_logins,
            "statistics": {
                "total_failed": total_failed,
                "time_range_hours": hours,
                "top_ips": [{"ip": item["_id"], "count": item["count"]} for item in top_ips],
                "top_users": [{"username": item["_id"], "count": item["count"]} for item in top_users],
            },
        }

    async def get_suspicious_activity(self, *, hours: int) -> dict[str, Any]:
        cutoff_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        ip_pipeline: list[dict[str, Any]] = [
            {"$match": {"success": False, "timestamp": {"$gte": cutoff_time}}},
            {
                "$group": {
                    "_id": "$ip_address",
                    "count": {"$sum": 1},
                    "usernames": {"$addToSet": "$username"},
                    "last_attempt": {"$max": "$timestamp"},
                }
            },
            {"$match": {"count": {"$gte": 5}}},
            {"$sort": {"count": -1}},
        ]
        user_pipeline: list[dict[str, Any]] = [
            {"$match": {"success": False, "timestamp": {"$gte": cutoff_time}}},
            {
                "$group": {
                    "_id": "$username",
                    "count": {"$sum": 1},
                    "ips": {"$addToSet": "$ip_address"},
                    "last_attempt": {"$max": "$timestamp"},
                }
            },
            {"$match": {"count": {"$gte": 5}}},
            {"$sort": {"count": -1}},
        ]
        suspicious_ips = await self._database.login_attempts.aggregate(ip_pipeline).to_list(50)
        suspicious_users = await self._database.login_attempts.aggregate(user_pipeline).to_list(50)

        for item in suspicious_ips:
            item["ip_address"] = item.pop("_id")
            item["last_attempt"] = _iso_datetime(item.get("last_attempt")) if item.get("last_attempt") else None
        for item in suspicious_users:
            item["username"] = item.pop("_id")
            item["last_attempt"] = _iso_datetime(item.get("last_attempt")) if item.get("last_attempt") else None

        return {
            "suspicious_ips": suspicious_ips,
            "suspicious_users": suspicious_users,
            "time_range_hours": hours,
        }

    async def get_sessions(self, *, limit: int, active_only: bool) -> dict[str, Any]:
        query: dict[str, Any] = {"revoked": False}
        now_dt = datetime.now(timezone.utc).replace(tzinfo=None)
        if active_only:
            query["expires_at"] = {"$gt": now_dt}

        tokens = await self._database.refresh_tokens.find(query).sort("created_at", -1).limit(limit).to_list(limit)
        sessions: list[dict[str, Any]] = []
        for token in tokens:
            username = token.get("username")
            if username:
                user = await self._database.users.find_one({"username": username})
                if user:
                    sessions.append(
                        {
                            "username": username,
                            "user_id": str(user.get("_id", "")),
                            "role": user.get("role", "unknown"),
                            "ip_address": token.get("ip_address", "unknown"),
                            "user_agent": token.get("user_agent", "unknown"),
                            "created_at": _iso_datetime(token.get("created_at")),
                            "expires_at": _iso_datetime(token.get("expires_at")),
                            "last_used": _iso_datetime(token.get("last_used")),
                        }
                    )

        total_sessions = await self._database.refresh_tokens.count_documents({"revoked": False})
        active_sessions = await self._database.refresh_tokens.count_documents(
            {"revoked": False, "expires_at": {"$gt": now_dt}}
        )
        return {
            "sessions": sessions,
            "statistics": {
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "expired_sessions": total_sessions - active_sessions,
            },
        }

    async def get_audit_log(
        self,
        *,
        limit: int,
        hours: int,
        action: str | None,
        user: str | None,
    ) -> dict[str, Any]:
        query: dict[str, Any] = {
            "timestamp": {
                "$gte": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
            }
        }
        security_actions = [
            "login",
            "logout",
            "register",
            "password_change",
            "permission_change",
            "user_create",
            "user_delete",
            "role_change",
            "token_refresh",
            "session_create",
        ]
        query["action"] = action if action else {"$in": security_actions}
        if user:
            query["user"] = user

        logs = await self._database.activity_logs.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
        for log in logs:
            if "_id" in log:
                log["_id"] = str(log["_id"])
            if "timestamp" in log:
                log["timestamp"] = _iso_datetime(log["timestamp"])
        return {"audit_logs": logs, "time_range_hours": hours, "total_records": len(logs)}

    async def get_ip_tracking(self, *, hours: int) -> dict[str, Any]:
        cutoff_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        ip_pipeline: list[dict[str, Any]] = [
            {"$match": {"timestamp": {"$gte": cutoff_time}}},
            {
                "$group": {
                    "_id": "$ip_address",
                    "total_attempts": {"$sum": 1},
                    "successful_logins": {"$sum": {"$cond": ["$success", 1, 0]}},
                    "failed_logins": {"$sum": {"$cond": ["$success", 0, 1]}},
                    "unique_users": {"$addToSet": "$username"},
                    "first_seen": {"$min": "$timestamp"},
                    "last_seen": {"$max": "$timestamp"},
                }
            },
            {
                "$project": {
                    "ip_address": "$_id",
                    "total_attempts": 1,
                    "successful_logins": 1,
                    "failed_logins": 1,
                    "unique_user_count": {"$size": "$unique_users"},
                    "first_seen": 1,
                    "last_seen": 1,
                }
            },
            {"$sort": {"total_attempts": -1}},
            {"$limit": 100},
        ]
        ip_data = await self._database.login_attempts.aggregate(ip_pipeline).to_list(100)
        for item in ip_data:
            if "first_seen" in item and isinstance(item["first_seen"], datetime):
                item["first_seen"] = item["first_seen"].isoformat()
            if "last_seen" in item and isinstance(item["last_seen"], datetime):
                item["last_seen"] = item["last_seen"].isoformat()
        return {"ip_tracking": ip_data, "time_range_hours": hours, "total_ips": len(ip_data)}

    async def get_summary(self, *, hours: int) -> dict[str, Any]:
        cutoff_time = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
        failed_count = await self._database.login_attempts.count_documents(
            {"success": False, "timestamp": {"$gte": cutoff_time}}
        )
        success_count = await self._database.login_attempts.count_documents(
            {"success": True, "timestamp": {"$gte": cutoff_time}}
        )
        active_sessions = await self._database.refresh_tokens.count_documents(
            {
                "revoked": False,
                "expires_at": {"$gt": datetime.now(timezone.utc).replace(tzinfo=None)},
            }
        )
        suspicious_summary_pipeline: list[dict[str, Any]] = [
            {"$match": {"success": False, "timestamp": {"$gte": cutoff_time}}},
            {"$group": {"_id": "$ip_address", "count": {"$sum": 1}}},
            {"$match": {"count": {"$gte": 5}}},
            {"$count": "total"},
        ]
        suspicious_ips_count = await self._database.login_attempts.aggregate(
            suspicious_summary_pipeline
        ).to_list(1)
        suspicious_ips = suspicious_ips_count[0]["total"] if suspicious_ips_count else 0
        recent_events = await self._database.activity_logs.find(
            {
                "action": {"$in": ["login", "logout", "register", "password_change"]},
                "timestamp": {"$gte": cutoff_time},
            }
        ).sort("timestamp", -1).limit(10).to_list(10)
        for event in recent_events:
            if "_id" in event:
                event["_id"] = str(event["_id"])
            if "timestamp" in event:
                event["timestamp"] = _iso_datetime(event["timestamp"])
        return {
            "summary": {
                "failed_logins": failed_count,
                "successful_logins": success_count,
                "active_sessions": active_sessions,
                "suspicious_ips": suspicious_ips,
                "time_range_hours": hours,
            },
            "recent_events": recent_events,
        }


def get_security_dashboard_service() -> SecurityDashboardService:
    return SecurityDashboardService(get_db())
