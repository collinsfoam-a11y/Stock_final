"""
Sync Conflicts Service
Detect and resolve synchronization conflicts between local and server data
"""

import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import PyMongoError

from backend.services.count_line_write_service import CountLineWriteService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.transaction_manager import mongo_transaction
from backend.services.governance_guard import write_authority

UTC = timezone.utc

logger = logging.getLogger(__name__)


def _object_id_or_none(value: Optional[str]) -> Optional[ObjectId]:
    if not isinstance(value, str) or not ObjectId.is_valid(value):
        return None
    return ObjectId(value)


def _entity_lookup(entity_id: str) -> dict[str, Any]:
    object_id = _object_id_or_none(entity_id)
    if object_id is not None:
        return {"_id": object_id}
    return {"id": entity_id}


class ConflictStatus(str, Enum):
    PENDING = "pending"
    RESOLVED = "resolved"
    IGNORED = "ignored"


class ConflictResolution(str, Enum):
    ACCEPT_SERVER = "accept_server"
    ACCEPT_LOCAL = "accept_local"
    MERGE = "merge"
    IGNORE = "ignore"


class SyncConflictsService:
    """Service for managing synchronization conflicts"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.count_line_write_service = CountLineWriteService(db)
        self.lifecycle_service = SessionLifecycleService(db)

    async def detect_conflict(
        self,
        entity_type: str,  # "session", "count_line", "item"
        entity_id: str,
        local_data: dict[str, Any],
        server_data: dict[str, Any],
        user: str,
        session_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Detect conflict between local and server data
        Returns conflict_id if conflict detected, None otherwise
        """
        # Check for conflicting changes
        conflicts = [
            {
                "field": key,
                "local_value": local_data[key],
                "server_value": server_data[key],
            }
            for key in local_data
            if key in server_data and local_data[key] != server_data[key]
        ]

        # If no conflicts, return None
        if not conflicts:
            return None

        # Create conflict record
        conflict_doc = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "session_id": session_id,
            "user": user,
            "conflicts": conflicts,
            "local_data": local_data,
            "server_data": server_data,
            "status": ConflictStatus.PENDING.value,
            "resolution": None,
            "resolved_by": None,
            "resolved_at": None,
            "created_at": datetime.now(UTC),
            "local_timestamp": local_data.get("updated_at") or local_data.get("created_at"),
            "server_timestamp": server_data.get("updated_at") or server_data.get("created_at"),
        }

        result = await self.db.sync_conflicts.insert_one(conflict_doc)
        conflict_id = str(result.inserted_id)

        logger.warning(
            f"Sync conflict detected for {entity_type} {entity_id}: "
            f"{len(conflicts)} field(s) differ"
        )

        return conflict_id

    async def get_conflicts(
        self,
        status: ConflictStatus = None,
        session_id: Optional[str] = None,
        user: Optional[str] = None,
        entity_type: Optional[str] = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """Get conflicts with optional filters"""
        query = {}

        if status:
            query["status"] = status.value
        if session_id:
            query["session_id"] = session_id
        if user:
            query["user"] = user
        if entity_type:
            query["entity_type"] = entity_type

        cursor = self.db.sync_conflicts.find(query).sort("created_at", -1).limit(limit)
        conflicts = await cursor.to_list(length=limit)

        # Convert ObjectId to string
        for conflict in conflicts:
            conflict["id"] = str(conflict.pop("_id"))

        return conflicts

    async def get_conflict_by_id(self, conflict_id: str) -> Optional[dict[str, Optional[Any]]]:
        """Get a specific conflict by ID"""
        conflict = await self.db.sync_conflicts.find_one({"_id": ObjectId(conflict_id)})

        if conflict:
            conflict["id"] = str(conflict.pop("_id"))

        return conflict

    async def resolve_conflict(
        self,
        conflict_id: str,
        resolution: ConflictResolution,
        resolved_by: str,
        merged_data: Optional[dict[str, Optional[Any]]] = None,
    ) -> dict[str, Any]:
        """
        Resolve a sync conflict
        Returns the resolved data to be applied
        """
        conflict = await self.get_conflict_by_id(conflict_id)

        if not conflict:
            raise ValueError(f"Conflict {conflict_id} not found")

        if conflict["status"] != ConflictStatus.PENDING.value:
            raise ValueError(f"Conflict {conflict_id} already resolved")

        # Determine resolved data based on resolution strategy
        if resolution == ConflictResolution.ACCEPT_SERVER:
            resolved_data = conflict["server_data"]
        elif resolution == ConflictResolution.ACCEPT_LOCAL:
            resolved_data = conflict["local_data"]
        elif resolution == ConflictResolution.MERGE:
            if not merged_data:
                raise ValueError("Merged data required for MERGE resolution")
            resolved_data = merged_data
        elif resolution == ConflictResolution.IGNORE:
            resolved_data = None
        else:
            raise ValueError(f"Unknown resolution: {resolution}")

        status_value = (
            ConflictStatus.RESOLVED.value
            if resolution != ConflictResolution.IGNORE
            else ConflictStatus.IGNORED.value
        )
        resolution_update = {
            "$set": {
                "status": status_value,
                "resolution": resolution.value,
                "resolved_by": resolved_by,
                "resolved_at": datetime.now(UTC),
                "resolved_data": resolved_data,
            }
        }

        # Apply resolved data and conflict status atomically.
        if resolution != ConflictResolution.IGNORE and resolved_data:
            entity_type = str(conflict.get("entity_type") or "")
            entity_id = str(conflict.get("entity_id") or "")
            async with mongo_transaction(self.db.client) as tx:
                kwargs = {"session": tx} if tx is not None else {}
                await self.db.sync_conflicts.update_one(
                    {"_id": ObjectId(conflict_id)},
                    resolution_update,
                    **kwargs,
                )

                # --- Rule 7 & G-04: Conflict Forking ---
                # If the entity is already APPROVED, we must FORK instead of OVERWRITING.
                if entity_type == "count_line":
                    target_doc = await self.db.count_lines.find_one(
                        _entity_lookup(entity_id),
                        **kwargs,
                    )
                    if target_doc and str(target_doc.get("status", "")).lower() in {
                        "approved",
                        "locked",
                    }:
                        logger.info("Rule 7: Forking approved record %s", entity_id)
                        await self._fork_approved_record(
                            entity_type,
                            entity_id,
                            target_doc,
                            resolved_data,
                            db_session=tx,
                        )
                        return {
                            "conflict_id": conflict_id,
                            "resolution": "FORKED",
                            "resolved_data": resolved_data,
                        }

                if entity_type and entity_id:
                    await self._apply_resolved_data(
                        entity_type,
                        entity_id,
                        resolved_data,
                        db_session=tx,
                    )
        else:
            await self.db.sync_conflicts.update_one(
                {"_id": ObjectId(conflict_id)},
                resolution_update,
            )

        logger.info(f"Conflict {conflict_id} resolved with {resolution.value} by {resolved_by}")

        return {
            "conflict_id": conflict_id,
            "resolution": resolution.value,
            "resolved_data": resolved_data,
        }

    async def _fork_approved_record(
        self,
        entity_type: str,
        entity_id: str,
        original_doc: dict,
        new_data: dict,
        *,
        db_session: Optional[Any] = None,
    ):
        """Creates a forked version of an approved record to preserve audit history (Rule 7)."""
        forked_doc = original_doc.copy()
        del forked_doc["_id"]
        forked_doc["original_id"] = entity_id
        forked_doc["status"] = "FORKED_REVISION"
        forked_doc["data"] = new_data
        forked_doc["forked_at"] = datetime.now(UTC)
        kwargs = {"session": db_session} if db_session is not None else {}

        await self.db.conflict_forks.insert_one(forked_doc, **kwargs)

        # Log the fork in audit trail
        await self.db.audit_logs.insert_one(
            {
                "event": "RECORD_FORKED",
                "entity_type": entity_type,
                "entity_id": entity_id,
                "timestamp": datetime.now(UTC),
                "details": "Conflict resolution triggered a fork to preserve approved state.",
            },
            **kwargs,
        )

    async def _find_session_for_entity(
        self,
        entity_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> Optional[dict[str, Any]]:
        kwargs = {"session": db_session} if db_session is not None else {}
        session = await self.db.sessions.find_one(_entity_lookup(entity_id), **kwargs)
        if session:
            return session
        return await self.db.sessions.find_one(
            {"$or": [{"id": entity_id}, {"session_id": entity_id}]},
            **kwargs,
        )

    @staticmethod
    def _sanitize_session_resolution_fields(data: dict[str, Any]) -> dict[str, Any]:
        blocked = {"_id", "id", "session_id", "version", "finalized_at", "finalized_by"}
        return {key: value for key, value in data.items() if key not in blocked}

    @staticmethod
    def _sanitize_count_line_resolution_fields(data: dict[str, Any]) -> dict[str, Any]:
        blocked = {
            "_id",
            "id",
            "session_id",
            "version",
            "previous_version_id",
            "recount_of_id",
            "counted_qty",
            "damaged_qty",
            "erp_qty",
            "baseline_hash",
            "superseded_at",
            "superseded_by",
            "superseded_by_version_id",
            "finalized_at",
            "finalized_by",
        }
        return {key: value for key, value in data.items() if key not in blocked}

    async def _apply_resolved_data(
        self,
        entity_type: str,
        entity_id: str,
        data: dict[str, Any],
        *,
        db_session: Optional[Any] = None,
    ) -> None:
        """Apply resolved data to the entity"""
        kwargs = {"session": db_session} if db_session is not None else {}
        try:
            if entity_type == "session":
                session_doc = await self._find_session_for_entity(entity_id, db_session=db_session)
                if not session_doc:
                    logger.warning("Session conflict target not found: %s", entity_id)
                    return

                session_id = str(
                    session_doc.get("id") or session_doc.get("session_id") or entity_id
                )
                fields = self._sanitize_session_resolution_fields(dict(data))
                status = fields.pop("status", None)
                if isinstance(status, str) and status.strip():
                    current_status = str(session_doc.get("status") or "").strip().upper()
                    target_status = status.strip().upper()
                    if target_status != current_status:
                        await self.lifecycle_service.transition_session(
                            session_id=session_id,
                            target_status=target_status,
                            actor="conflict_resolver",
                            note="Sync conflict resolution",
                            db_session=db_session,
                        )

                fields["updated_at"] = datetime.now(UTC)
                fields["conflict_resolved"] = True
                await self.lifecycle_service.update_session_fields(
                    session_id,
                    fields,
                    db_session=db_session,
                    actor="conflict_resolver",
                )
                logger.info("Applied resolved data to session %s", session_id)
                return

            if entity_type == "count_line":
                count_line = await self.db.count_lines.find_one(_entity_lookup(entity_id), **kwargs)
                if not count_line:
                    logger.warning("Count-line conflict target not found: %s", entity_id)
                    return

                fields = self._sanitize_count_line_resolution_fields(dict(data))
                fields["updated_at"] = datetime.now(UTC)
                fields["conflict_resolved"] = True
                await self.count_line_write_service.process_write(
                    {
                        "operation": "update_one",
                        "filter": _entity_lookup(entity_id),
                        "update": {"$set": fields},
                    },
                    context={
                        "session_id": str(count_line.get("session_id") or ""),
                        "username": "conflict_resolver",
                        "db_session": db_session,
                        "governance_mode": "mutable_session",
                    },
                )
                logger.info("Applied resolved data to count_line %s", entity_id)
                return

            if entity_type == "item":
                payload = dict(data)
                payload["updated_at"] = datetime.now(UTC)
                payload["conflict_resolved"] = True
                with write_authority("SyncConflictsService"):
                    await self.db.erp_items.update_one(
                        _entity_lookup(entity_id),
                        {"$set": payload},
                        **kwargs,
                    )
                logger.info("Applied resolved data to item %s", entity_id)
                return

            logger.error("Unknown entity type for conflict resolution: %s", entity_type)
        except PyMongoError as e:
            logger.error(f"Failed to apply resolved data: {str(e)}")
            raise

    async def auto_resolve_simple_conflicts(
        self,
        strategy: str = "server_wins",  # "server_wins", "local_wins", "newest_wins"
    ) -> int:
        """
        Auto-resolve simple conflicts based on strategy
        Returns number of conflicts resolved
        """
        # Get pending conflicts
        conflicts = await self.get_conflicts(status=ConflictStatus.PENDING)

        resolved_count = 0

        for conflict in conflicts:
            try:
                if await self._resolve_single_conflict(conflict, strategy):
                    resolved_count += 1
            except (PyMongoError, ValueError) as e:
                logger.error(f"Failed to auto-resolve conflict {conflict['id']}: {str(e)}")
                continue

        logger.info(f"Auto-resolved {resolved_count} conflicts using '{strategy}' strategy")

        return resolved_count

    async def _resolve_single_conflict(self, conflict: dict[str, Any], strategy: str) -> bool:
        """Helper to resolve a single conflict based on strategy"""
        # Determine resolution based on strategy
        if strategy == "server_wins":
            resolution = ConflictResolution.ACCEPT_SERVER
        elif strategy == "local_wins":
            resolution = ConflictResolution.ACCEPT_LOCAL
        elif strategy == "newest_wins":
            resolution = self._determine_newest_wins_resolution(conflict)
        else:
            return False

        # Resolve conflict
        await self.resolve_conflict(conflict["id"], resolution, "system_auto_resolve")
        return True

    def _determine_newest_wins_resolution(self, conflict: dict[str, Any]) -> ConflictResolution:
        """Determine resolution based on timestamps"""
        local_ts = conflict.get("local_timestamp")
        server_ts = conflict.get("server_timestamp")

        if local_ts and server_ts:
            if isinstance(local_ts, str):
                local_ts = datetime.fromisoformat(local_ts.replace("Z", "+00:00"))
            if isinstance(server_ts, str):
                server_ts = datetime.fromisoformat(server_ts.replace("Z", "+00:00"))

            return (
                ConflictResolution.ACCEPT_LOCAL
                if local_ts > server_ts
                else ConflictResolution.ACCEPT_SERVER
            )

        return ConflictResolution.ACCEPT_SERVER

    async def get_conflict_stats(self) -> dict[str, Any]:
        """Get statistics about sync conflicts"""
        total = await self.db.sync_conflicts.count_documents({})
        pending = await self.db.sync_conflicts.count_documents(
            {"status": ConflictStatus.PENDING.value}
        )
        resolved = await self.db.sync_conflicts.count_documents(
            {"status": ConflictStatus.RESOLVED.value}
        )
        ignored = await self.db.sync_conflicts.count_documents(
            {"status": ConflictStatus.IGNORED.value}
        )

        # Get conflicts by entity type
        pipeline = [{"$group": {"_id": "$entity_type", "count": {"$sum": 1}}}]

        by_entity_type = {}
        async for result in self.db.sync_conflicts.aggregate(pipeline):
            by_entity_type[result["_id"]] = result["count"]

        return {
            "total": total,
            "pending": pending,
            "resolved": resolved,
            "ignored": ignored,
            "by_entity_type": by_entity_type,
        }
