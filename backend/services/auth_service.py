"""Authentication persistence boundary."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable

from bson import ObjectId

from backend.db.runtime import get_db


class AuthService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_user(self, username: str) -> dict[str, Any] | None:
        return await self._database.users.find_one({"username": username})

    async def get_user_by_query(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return await self._database.users.find_one(query)

    async def get_user_by_object_id(self, object_id: Any) -> dict[str, Any] | None:
        return await self._database.users.find_one({"_id": object_id})

    async def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        return await self._database.users.find_one({"_id": ObjectId(user_id)})

    async def find_user_by_email(
        self, email: str, *, exclude_id: Any | None = None
    ) -> dict[str, Any] | None:
        query: dict[str, Any] = {"email": email}
        if exclude_id is not None:
            query["_id"] = {"$ne": exclude_id}
        return await self._database.users.find_one(query)

    async def count_users(self) -> int:
        return await self._database.users.count_documents({})

    async def count_users_by_query(self, query: dict[str, Any]) -> int:
        return await self._database.users.count_documents(query)

    async def list_users(
        self,
        query: dict[str, Any],
        *,
        sort_field: str,
        sort_direction: int,
        skip: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        cursor = self._database.users.find(query).sort(sort_field, sort_direction).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def list_active_staff(self, limit: int = 200) -> list[dict[str, Any]]:
        return await self._database.users.find(
            {"role": "staff", "is_active": True},
            {"username": 1, "full_name": 1},
        ).to_list(length=limit)

    async def create_user(self, user: dict[str, Any]) -> Any:
        return await self._database.users.insert_one(user)

    async def update_user_by_object_id(self, object_id: Any, update: dict[str, Any]) -> Any:
        return await self._database.users.update_one({"_id": object_id}, {"$set": update})

    async def delete_user_by_object_id(self, object_id: Any) -> Any:
        return await self._database.users.delete_one({"_id": object_id})

    async def get_active_refresh_token(self, username: str) -> dict[str, Any] | None:
        return await self._database.refresh_tokens.find_one(
            {
                "username": username,
                "revoked": False,
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            },
            sort=[("created_at", -1)],
        )

    async def insert_failed_login_attempt(
        self, username: str, ip_address: str, user_agent: str | None, error: str
    ) -> None:
        await self._database.login_attempts.insert_one(
            {
                "username": username,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "success": False,
                "timestamp": datetime.now(timezone.utc),
                "error": error,
            }
        )

    async def record_successful_login(
        self, user: dict[str, Any], ip_address: str, user_agent: str | None
    ) -> None:
        await self._database.login_attempts.insert_one(
            {
                "user_id": user["_id"],
                "username": user["username"],
                "ip_address": ip_address,
                "user_agent": user_agent,
                "success": True,
                "timestamp": datetime.now(timezone.utc),
            }
        )
        await self._database.users.update_one(
            {"_id": user["_id"]}, {"$set": {"last_login_at": datetime.now(timezone.utc)}}
        )

    async def get_user_by_pin_lookup_hash(self, lookup_hash: str) -> dict[str, Any] | None:
        return await self._database.users.find_one({"pin_lookup_hash": lookup_hash})

    async def list_users_with_pin_hash(self, limit: int = 1000) -> list[dict[str, Any]]:
        return await self._database.users.find({"pin_hash": {"$exists": True}}).to_list(
            length=limit
        )

    async def set_user_pin_lookup_hash(self, user_id: Any, lookup_hash: str) -> Any:
        return await self._database.users.update_one(
            {"_id": user_id}, {"$set": {"pin_lookup_hash": lookup_hash}}
        )

    async def set_user_pin(self, username: str, hashed_pin: str, lookup_hash: str) -> Any:
        return await self._database.users.update_one(
            {"username": username},
            {
                "$set": {
                    "pin_hash": hashed_pin,
                    "pin_lookup_hash": lookup_hash,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

    async def migrate_legacy_password(self, user_id: Any, hashed_password: str) -> Any:
        return await self._database.users.update_one(
            {"_id": user_id},
            {
                "$set": {"hashed_password": hashed_password},
                "$unset": {"password": ""},
            },
        )

    async def update_user_password(self, username: str, hashed_password: str) -> Any:
        return await self._database.users.update_one(
            {"username": username},
            {"$set": {"hashed_password": hashed_password, "updated_at": datetime.now(timezone.utc)}},
        )

    async def update_user_password_by_id(self, user_id: str, hashed_password: str) -> Any:
        return await self._database.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"hashed_password": hashed_password, "updated_at": datetime.now(timezone.utc)}},
        )

    async def update_user_password_by_object_id(
        self, object_id: Any, hashed_password: str
    ) -> Any:
        return await self._database.users.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

    async def update_user_pin_by_object_id(
        self, object_id: Any, hashed_pin: str, lookup_hash: str
    ) -> Any:
        return await self._database.users.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "pin_hash": hashed_pin,
                    "pin_lookup_hash": lookup_hash,
                    "updated_at": datetime.now(timezone.utc).replace(tzinfo=None),
                }
            },
        )

    async def get_rate_limit(self, rate_key: str) -> dict[str, Any] | None:
        return await self._database.rate_limits.find_one({"_id": rate_key})

    async def increment_rate_limit_attempt(self, rate_key: str, window_start: datetime) -> Any:
        return await self._database.rate_limits.update_one(
            {"_id": rate_key},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {"window_start": window_start},
            },
            upsert=True,
        )

    async def set_rate_limit_window_start(self, rate_key: str, window_start: datetime) -> Any:
        return await self._database.rate_limits.update_one(
            {"_id": rate_key},
            {"$set": {"window_start": window_start}},
        )

    async def delete_rate_limit(self, rate_key: str) -> Any:
        return await self._database.rate_limits.delete_one({"_id": rate_key})

    async def delete_refresh_tokens_for_username(self, username: str) -> Any:
        return await self._database.refresh_tokens.delete_many({"username": username})

    def create_otp_service(self, otp_service_factory: Callable[[Any], Any]) -> Any:
        return otp_service_factory(self._database)

    async def log_activity(self, **kwargs: Any) -> str:
        from backend.services.activity_log import ActivityLogService

        return await ActivityLogService(self._database).log_activity(**kwargs)

    async def log_audit_event(self, **kwargs: Any) -> str:
        from backend.services.audit_service import AuditService

        audit_service = AuditService(self._database)
        return await audit_service.log_event(**kwargs)


def get_auth_service() -> AuthService:
    return AuthService(get_db())
