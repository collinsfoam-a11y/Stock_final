"""Service layer for recount workflow reads and write orchestration."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from backend.db.runtime import get_db
from backend.services.count_line_write_service import CountLineWriteService
from backend.services.notification_service import NotificationService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.transaction_manager import mongo_transaction


class RecountService:
    def __init__(self, database: Any) -> None:
        self._database = database
        self.lifecycle = SessionLifecycleService(database)
        self.notifications = NotificationService(database)

    async def get_count_line(self, count_line_id: str) -> dict[str, Any] | None:
        return await self._database.count_lines.find_one({"id": count_line_id})

    async def get_user(self, username: str) -> dict[str, Any] | None:
        return await self._database.users.find_one({"username": username})

    async def list_recount_requests(
        self,
        *,
        query: dict[str, Any],
        offset: int,
        limit: int,
    ) -> tuple[list[dict[str, Any]], int]:
        total = await self._database.recount_requests.count_documents(query)
        requests = await (
            self._database.recount_requests.find(query)
            .sort("created_at", -1)
            .skip(offset)
            .limit(limit)
            .to_list(length=limit)
        )
        for req in requests:
            req["_id"] = str(req["_id"])
            req["id"] = req["_id"]
        return requests, total

    async def complete_with_result(
        self,
        *,
        recount_id: str,
        recount: dict[str, Any],
        result_qty: float,
        update_data: dict[str, Any],
        username: str,
    ) -> None:
        async with mongo_transaction(self._database.client) as tx:
            refreshed = await self.lifecycle.get_recount_request(recount_id, db_session=tx)
            if not refreshed:
                raise ValueError("Recount request not found")

            existing_line = await self._database.count_lines.find_one(
                {"id": refreshed["count_line_id"]},
                session=tx,
            )
            if not existing_line:
                raise ValueError("Count line for recount not found")

            session_id = str(existing_line.get("session_id") or refreshed.get("session_id") or "")
            session = await self.lifecycle.ensure_session_active(session_id, db_session=tx)

            location_id = str(
                existing_line.get("location_id")
                or session.get("location_id")
                or session.get("warehouse")
                or ""
            ).strip()
            floor_id = str(
                existing_line.get("floor_id")
                or existing_line.get("floor_no")
                or session.get("floor_id")
                or ""
            ).strip()
            rack_id = str(
                existing_line.get("rack_id")
                or existing_line.get("rack_no")
                or session.get("rack_no")
                or ""
            ).strip()
            if not location_id or not floor_id or not rack_id:
                raise ValueError("Recount requires location_id, floor_id and rack_id context")

            now_dt = update_data["updated_at"]
            previous_line_id = str(existing_line.get("id") or existing_line.get("_id"))
            new_line = dict(existing_line)
            new_line.pop("_id", None)
            new_line["id"] = str(uuid.uuid4())
            new_line["counted_qty"] = result_qty
            new_line["status"] = "pending"
            new_line["approval_status"] = "PENDING"
            new_line["verified"] = False
            new_line["verified_by"] = None
            new_line["verified_at"] = None
            new_line["rejected_by"] = None
            new_line["rejected_at"] = None
            new_line["recount_requested_at"] = None
            new_line["recount_requested_by"] = None
            new_line["recount_completed_at"] = now_dt
            new_line["recount_completed_by"] = username
            new_line["updated_at"] = now_dt
            new_line["updated_by"] = username
            new_line["location_id"] = location_id
            new_line["floor_id"] = floor_id
            new_line["rack_id"] = rack_id
            new_line.setdefault("floor_no", floor_id)
            new_line.setdefault("rack_no", rack_id)
            new_line["version"] = int(existing_line.get("version", 1) or 1) + 1
            new_line["previous_version_id"] = previous_line_id
            new_line["recount_of_id"] = (
                existing_line.get("recount_of_id")
                or existing_line.get("id")
                or previous_line_id
            )
            new_line["recount_iteration"] = int(existing_line.get("recount_iteration", 0) or 0) + 1

            tx_context = {"session": session, "username": username, "db_session": tx}
            write_service = CountLineWriteService(self._database)
            await write_service.process_write(
                {"operation": "insert_one", "document": new_line},
                context={**tx_context, "skip_session_totals_update": True},
            )
            await write_service.process_write(
                {
                    "operation": "update_one",
                    "filter": {"_id": existing_line["_id"]},
                    "update": {
                        "$set": {
                            "status": "SUPERSEDED",
                            "superseded_at": now_dt,
                            "superseded_by": username,
                            "superseded_by_version_id": new_line["id"],
                            "location_id": location_id,
                            "floor_id": floor_id,
                            "rack_id": rack_id,
                        }
                    },
                },
                context=tx_context,
            )
            await self.lifecycle.transition_recount_request(
                recount_id=recount_id,
                target_status="completed",
                actor=username,
                fields=update_data,
                db_session=tx,
            )

    async def get_summary(self) -> dict[str, Any]:
        status_counts = await self._database.recount_requests.aggregate(
            [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        ).to_list(length=10)
        priority_counts = await self._database.recount_requests.aggregate(
            [{"$group": {"_id": "$priority", "count": {"$sum": 1}}}]
        ).to_list(length=10)
        total = await self._database.recount_requests.count_documents({})
        overdue = await self._database.recount_requests.count_documents(
            {
                "status": {"$nin": ["completed", "cancelled"]},
                "due_date": {"$lt": datetime.now(timezone.utc).replace(tzinfo=None).isoformat()},
            }
        )
        return {
            "success": True,
            "total": total,
            "by_status": {s["_id"]: s["count"] for s in status_counts},
            "by_priority": {p["_id"]: p["count"] for p in priority_counts},
            "overdue": overdue,
        }

    async def get_staff_tasks(self, username: str) -> list[dict[str, Any]]:
        tasks = await (
            self._database.recount_requests.find(
                {
                    "assigned_to": username,
                    "status": {"$in": ["assigned", "in_progress"]},
                }
            )
            .sort("created_at", -1)
            .to_list(length=50)
        )
        for task in tasks:
            task["_id"] = str(task["_id"])
            task["id"] = task["_id"]
        return tasks


def get_recount_service() -> RecountService:
    return RecountService(get_db())
