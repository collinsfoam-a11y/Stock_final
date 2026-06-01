"""Session lifecycle domain service."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

from bson import ObjectId

from backend.services.concurrency import ConcurrencyError, build_version_filter, coerce_version
from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import (
    GovernanceViolation,
    assert_valid_write,
    assert_valid_transition,
    normalize_session_status,
    write_authority,
)
from backend.services.projection_write_service import ProjectionWriteService
from backend.services.transaction_manager import mongo_transaction
from backend.services.validation_service import ValidationService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


RECOUNT_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"assigned", "in_progress", "completed", "cancelled", "expired"},
    "assigned": {"in_progress", "completed", "cancelled", "expired"},
    "in_progress": {"completed", "cancelled", "expired"},
    "completed": set(),
    "cancelled": set(),
    "expired": set(),
}


class SessionLifecycleService:
    """Single write authority for session lifecycle mutations."""

    def __init__(
        self,
        db: Any,
        *,
        validation_service: Optional[ValidationService] = None,
        audit_service: Optional[GovernanceAuditService] = None,
        projection_service: Optional[ProjectionWriteService] = None,
        count_line_finalizer: Optional[Callable[..., Awaitable[int]]] = None,
    ) -> None:
        self.db = db
        self.validation_service = validation_service or ValidationService(db)
        self.audit_service = audit_service or GovernanceAuditService(db)
        self.projection_service = projection_service or ProjectionWriteService(db)
        self.count_line_finalizer = count_line_finalizer

    @staticmethod
    def _lookup(session_id: str) -> dict[str, Any]:
        return {"$or": [{"id": session_id}, {"session_id": session_id}]}

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority("SessionLifecycleService"):
            result = write_call()
            if hasattr(result, "__await__"):
                return await result
            return result

    async def get_session(
        self,
        session_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> Optional[dict[str, Any]]:
        return await self.db.sessions.find_one(self._lookup(session_id), **self._kwargs(db_session))

    async def ensure_session_exists(
        self,
        session_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        session = await self.get_session(session_id, db_session=db_session)
        if not session:
            raise GovernanceViolation(f"CRITICAL: Session not found: {session_id}")
        return session

    async def ensure_session_not_finalized(
        self,
        session_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        session = await self.ensure_session_exists(session_id, db_session=db_session)
        canonical = normalize_session_status(session.get("status"))
        if session.get("finalized_at") or canonical == "FINALIZED":
            raise GovernanceViolation("Session is finalized. Mutation blocked.")
        return session

    async def ensure_session_active(
        self,
        session_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        session = await self.ensure_session_not_finalized(session_id, db_session=db_session)
        canonical = normalize_session_status(session.get("status"))
        if canonical != "ACTIVE":
            raise GovernanceViolation(
                f"CRITICAL: Session must be ACTIVE for count-line writes (found {canonical})"
            )
        return session

    async def _update_session_with_occ(
        self,
        *,
        session_id: str,
        set_doc: dict[str, Any],
        expected_version: int,
        db_session: Optional[Any],
    ) -> None:
        filter_doc = {
            "$and": [
                self._lookup(session_id),
                build_version_filter(expected_version),
            ]
        }
        kwargs = self._kwargs(db_session)
        result = await self._execute_authorized_write(
            lambda: self.db.sessions.update_one(
                filter_doc,
                {"$set": dict(set_doc), "$inc": {"version": 1}},
                **kwargs,
            )
        )
        if getattr(result, "modified_count", 0) == 0:
            raise ConcurrencyError(
                f"CRITICAL: Session version mismatch for {session_id} (expected {expected_version})"
            )

    async def _compute_session_totals(
        self,
        session_id: str,
        *,
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        from backend.services.canonical_inventory import (
            is_count_line_effectively_reviewed,
            is_superseded_count_line,
        )

        total_items = 0
        total_variance = 0.0
        verified_items = 0
        damage_items = 0
        last_activity: Optional[datetime] = None
        kwargs = self._kwargs(db_session)

        cursor = self.db.count_lines.find(
            {"session_id": session_id, "archived": {"$ne": True}}, **kwargs
        )
        async for line in cursor:
            if is_superseded_count_line(line):
                continue
            total_items += 1
            total_variance += float(line.get("variance") or 0.0)
            damage_items += int(float(line.get("damaged_qty") or 0.0))
            if is_count_line_effectively_reviewed(line):
                verified_items += 1

            candidate_activity = (
                line.get("updated_at") or line.get("approved_at") or line.get("counted_at")
            )
            if isinstance(candidate_activity, datetime):
                if candidate_activity.tzinfo is not None:
                    candidate_activity = candidate_activity.astimezone(timezone.utc).replace(
                        tzinfo=None
                    )
                if last_activity is None or candidate_activity > last_activity:
                    last_activity = candidate_activity

        session_update: dict[str, Any] = {
            "total_items": total_items,
            "total_variance": total_variance,
            "verified_items": verified_items,
            "pending_items": max(total_items - verified_items, 0),
            "damage_items": damage_items,
            "updated_at": _utc_now(),
        }
        if last_activity is not None:
            session_update["last_activity"] = last_activity
        return session_update

    async def _sync_session_projection(
        self,
        *,
        session_id: str,
        trigger: str,
        actor: str,
        db_session: Optional[Any],
    ) -> None:
        await self.projection_service.sync_for_sessions(
            [session_id],
            trigger=trigger,
            actor=actor,
            db_session=db_session,
            rebuild_item_projections=False,
        )

    async def record_session_snapshot(
        self,
        *,
        session_id: str,
        snapshot_doc: dict[str, Any],
        actor: str,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if not isinstance(snapshot_doc, dict) or not snapshot_doc:
            raise GovernanceViolation("CRITICAL: snapshot_doc is required")

        kwargs = self._kwargs(db_session)
        existing = await self.db.session_snapshots.find_one({"session_id": session_id}, **kwargs)
        if isinstance(existing, dict):
            raise GovernanceViolation("CRITICAL: Baseline snapshot already exists and is immutable")

        session = await self.get_session(session_id, db_session=db_session)
        if isinstance(session, dict):
            canonical = normalize_session_status(session.get("status"))
            if session.get("finalized_at") or canonical == "FINALIZED":
                raise GovernanceViolation("Session is finalized. Mutation blocked.")

        snapshot_to_insert = dict(snapshot_doc)
        snapshot_to_insert["session_id"] = session_id
        await self._execute_authorized_write(
            lambda: self.db.session_snapshots.insert_one(snapshot_to_insert, **kwargs)
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="SNAPSHOT_CREATE",
            session_id=session_id,
            actor_id=actor,
            metadata={
                "snapshot_hash": snapshot_to_insert.get("snapshot_hash"),
                "item_count": snapshot_to_insert.get("item_count"),
            },
            db_session=db_session,
        )
        return snapshot_to_insert

    async def create_session(
        self,
        *,
        session_doc: dict[str, Any],
        username: str,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.create_session(
                    session_doc=session_doc,
                    username=username,
                    db_session=tx,
                )

        now_dt = _utc_now()
        created_doc = dict(session_doc)
        created_doc["status"] = "CREATED"
        created_doc.setdefault("workflow_status", "DRAFT")
        created_doc.setdefault("id", created_doc.get("session_id"))
        if not created_doc.get("id"):
            raise GovernanceViolation("Session document must include 'id' or 'session_id'")
        created_doc.setdefault("started_at", now_dt)
        created_doc.setdefault("last_heartbeat", now_dt)
        created_doc.setdefault("session_id", created_doc["id"])
        created_doc.setdefault("version", 0)

        await self.validation_service.validate_session(created_doc)
        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.sessions.insert_one(created_doc, **kwargs)
        )

        mirror_doc = {
            "session_id": created_doc["id"],
            "user_id": username,
            "status": "CREATED",
            "started_at": now_dt,
            "last_heartbeat": now_dt,
            "rack_id": created_doc.get("rack_no"),
            "floor": created_doc.get("floor_id"),
            "location_id": created_doc.get("location_id"),
        }
        await self._execute_authorized_write(
            lambda: self.db.verification_sessions.insert_one(mirror_doc, **kwargs)
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="CREATE",
            session_id=str(created_doc["id"]),
            actor_id=username,
            version=int(created_doc.get("version", 0) or 0),
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=str(created_doc["id"]),
            trigger="session.create",
            actor=username,
            db_session=db_session,
        )
        return created_doc

    async def transition_session(
        self,
        *,
        session_id: str,
        target_status: str,
        actor: str,
        note: Optional[str] = None,
        db_session: Optional[Any] = None,
        expected_version: Optional[int] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.transition_session(
                    session_id=session_id,
                    target_status=target_status,
                    actor=actor,
                    note=note,
                    db_session=tx,
                    expected_version=expected_version,
                )

        session = await self.ensure_session_exists(session_id, db_session=db_session)
        current = normalize_session_status(session.get("status"))
        target = normalize_session_status(target_status)
        assert_valid_transition(current, target)
        await assert_valid_write(
            {
                "db": self.db,
                "session": session,
                "session_id": session_id,
                "db_session": db_session,
                "require_active_session": False,
                "require_full_context": False,
                "from_state": current,
                "to_state": target,
            }
        )

        now_dt = _utc_now()
        update_doc: dict[str, Any] = {
            "status": target,
            "last_heartbeat": now_dt,
            "updated_at": now_dt,
            "updated_by": actor,
        }
        if target == "REVIEW":
            update_doc["review_started_at"] = now_dt
            update_doc.setdefault("workflow_status", "REVIEW")
            update_doc.setdefault("submitted_at", now_dt)
            update_doc.setdefault("submitted_by", actor)
        if target == "ACTIVE":
            update_doc.setdefault("workflow_status", "ACTIVE")
        if target == "FINALIZED":
            update_doc["finalized_at"] = now_dt
            update_doc["finalized_by"] = actor
        if note:
            update_doc["lifecycle_note"] = note

        prospective_session = dict(session)
        prospective_session.update(update_doc)
        await self.validation_service.validate_session(prospective_session)

        session_version = coerce_version(session.get("version"))
        effective_expected = session_version if expected_version is None else int(expected_version)
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=update_doc,
            expected_version=effective_expected,
            db_session=db_session,
        )

        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.verification_sessions.update_one(
                {"session_id": session_id},
                {"$set": {"status": target, "last_heartbeat": now_dt}},
                **kwargs,
            )
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="TRANSITION",
            session_id=session_id,
            actor_id=actor,
            version=effective_expected + 1,
            metadata={"from": current, "to": target, "note": note},
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.transition",
            actor=actor,
            db_session=db_session,
        )
        refreshed = await self.ensure_session_exists(session_id, db_session=db_session)
        return refreshed

    async def update_session_totals(
        self,
        session_id: str,
        totals: dict[str, Any],
        *,
        db_session: Optional[Any] = None,
        expected_version: Optional[int] = None,
        actor: str = "system",
        sync_projection: bool = True,
    ) -> None:
        session = await self.ensure_session_not_finalized(session_id, db_session=db_session)
        await assert_valid_write(
            {
                "db": self.db,
                "session": session,
                "session_id": session_id,
                "db_session": db_session,
                "require_active_session": False,
                "require_full_context": False,
            }
        )
        current_version = coerce_version(session.get("version"))
        effective_expected = current_version if expected_version is None else int(expected_version)
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=dict(totals),
            expected_version=effective_expected,
            db_session=db_session,
        )
        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="UPDATE_TOTALS",
            session_id=session_id,
            actor_id=actor,
            version=effective_expected + 1,
            db_session=db_session,
        )
        if sync_projection:
            await self._sync_session_projection(
                session_id=session_id,
                trigger="session.update_totals",
                actor=actor,
                db_session=db_session,
            )

    async def update_session_fields(
        self,
        session_id: str,
        fields: dict[str, Any],
        *,
        db_session: Optional[Any] = None,
        expected_version: Optional[int] = None,
        actor: str = "system",
    ) -> None:
        if not isinstance(fields, dict) or not fields:
            return
        session = await self.ensure_session_not_finalized(session_id, db_session=db_session)
        await assert_valid_write(
            {
                "db": self.db,
                "session": session,
                "session_id": session_id,
                "db_session": db_session,
                "require_active_session": False,
                "require_full_context": False,
            }
        )
        current_version = coerce_version(session.get("version"))
        effective_expected = current_version if expected_version is None else int(expected_version)
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=dict(fields),
            expected_version=effective_expected,
            db_session=db_session,
        )
        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="UPDATE_FIELDS",
            session_id=session_id,
            actor_id=actor,
            version=effective_expected + 1,
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.update_fields",
            actor=actor,
            db_session=db_session,
        )

    async def update_session_assignments(
        self,
        *,
        session_id: str,
        actor: str,
        supervisor_username: Optional[str] = None,
        assigned_users: Optional[list[str]] = None,
        reason_code: Optional[str] = None,
        reason: Optional[str] = None,
        db_session: Optional[Any] = None,
        expected_version: Optional[int] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.update_session_assignments(
                    session_id=session_id,
                    actor=actor,
                    supervisor_username=supervisor_username,
                    assigned_users=assigned_users,
                    reason_code=reason_code,
                    reason=reason,
                    db_session=tx,
                    expected_version=expected_version,
                )

        session = await self.ensure_session_not_finalized(session_id, db_session=db_session)
        await assert_valid_write(
            {
                "db": self.db,
                "session": session,
                "session_id": session_id,
                "db_session": db_session,
                "require_active_session": False,
                "require_full_context": False,
            }
        )

        normalized_assigned: Optional[list[str]] = None
        if assigned_users is not None:
            normalized_assigned = [
                str(user).strip() for user in assigned_users if str(user).strip()
            ]
            normalized_assigned = list(dict.fromkeys(normalized_assigned))
            if not normalized_assigned:
                normalized_assigned = None

        normalized_supervisor = (
            str(supervisor_username).strip()
            if isinstance(supervisor_username, str) and supervisor_username.strip()
            else None
        )

        now_dt = _utc_now()
        update_doc: dict[str, Any] = {
            "updated_at": now_dt,
            "updated_by": actor,
            "assignment_reason_code": str(reason_code).strip()
            if isinstance(reason_code, str) and reason_code.strip()
            else None,
            "assignment_reason": str(reason).strip()
            if isinstance(reason, str) and reason.strip()
            else None,
        }
        if supervisor_username is not None:
            update_doc["supervisor_username"] = normalized_supervisor
        if assigned_users is not None:
            update_doc["assigned_users"] = normalized_assigned or []

        prospective = dict(session)
        prospective.update(update_doc)
        await self.validation_service.validate_session(prospective)

        current_version = coerce_version(session.get("version"))
        effective_expected = current_version if expected_version is None else int(expected_version)
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=update_doc,
            expected_version=effective_expected,
            db_session=db_session,
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="ASSIGNMENTS_UPDATE",
            session_id=session_id,
            actor_id=actor,
            version=effective_expected + 1,
            metadata={
                "supervisor_username": update_doc.get("supervisor_username"),
                "assigned_users": update_doc.get("assigned_users"),
                "reason_code": update_doc.get("assignment_reason_code"),
            },
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.assignments_update",
            actor=actor,
            db_session=db_session,
        )
        return await self.ensure_session_exists(session_id, db_session=db_session)

    async def persist_logic_pin(
        self,
        *,
        session_id: str,
        logic_version: Optional[str],
        logic_scope_source: Optional[str],
        db_session: Optional[Any] = None,
        expected_version: Optional[int] = None,
        actor: str = "system",
    ) -> None:
        await self.update_session_fields(
            session_id,
            {"logic_version": logic_version, "logic_scope_source": logic_scope_source},
            db_session=db_session,
            expected_version=expected_version,
            actor=actor,
        )

    @staticmethod
    def _recount_lookup(recount_id: str) -> dict[str, Any]:
        if ObjectId.is_valid(str(recount_id)):
            return {"_id": ObjectId(str(recount_id))}
        return {"id": str(recount_id)}

    @staticmethod
    def _normalize_recount_status(value: Any) -> str:
        if not isinstance(value, str):
            return "pending"
        normalized = value.strip().lower()
        return normalized or "pending"

    async def get_recount_request(
        self,
        recount_id: str,
        *,
        db_session: Optional[Any] = None,
    ) -> Optional[dict[str, Any]]:
        return await self.db.recount_requests.find_one(
            self._recount_lookup(recount_id),
            **self._kwargs(db_session),
        )

    async def create_recount_request(
        self,
        *,
        recount_doc: dict[str, Any],
        actor: str,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.create_recount_request(
                    recount_doc=recount_doc,
                    actor=actor,
                    db_session=tx,
                )

        if not isinstance(recount_doc, dict) or not recount_doc:
            raise GovernanceViolation("CRITICAL: recount_doc is required")

        session_id = str(recount_doc.get("session_id") or "").strip()
        if session_id:
            await self.ensure_session_not_finalized(session_id, db_session=db_session)

        now_dt = _utc_now()
        created_doc = dict(recount_doc)
        created_doc.setdefault("status", "pending")
        created_doc.setdefault("created_at", now_dt)
        created_doc.setdefault("updated_at", now_dt)
        kwargs = self._kwargs(db_session)

        result = await self._execute_authorized_write(
            lambda: self.db.recount_requests.insert_one(created_doc, **kwargs)
        )
        created_doc["_id"] = getattr(result, "inserted_id", None)
        created_doc["id"] = (
            str(created_doc["_id"]) if created_doc.get("_id") else str(recount_doc.get("id") or "")
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="RECOUNT_CREATE",
            session_id=session_id or "UNKNOWN",
            actor_id=actor,
            metadata={
                "recount_id": created_doc.get("id"),
                "count_line_id": created_doc.get("count_line_id"),
                "status": created_doc.get("status"),
            },
            db_session=db_session,
        )
        return created_doc

    def _assert_recount_transition(self, current_status: str, target_status: str) -> None:
        current = self._normalize_recount_status(current_status)
        target = self._normalize_recount_status(target_status)
        allowed_targets = RECOUNT_ALLOWED_TRANSITIONS.get(current)
        if allowed_targets is None:
            raise GovernanceViolation(f"CRITICAL: Unknown recount status '{current}'")
        if target not in allowed_targets and target != current:
            raise GovernanceViolation(f"CRITICAL: Invalid recount transition {current} -> {target}")

    async def transition_recount_request(
        self,
        *,
        recount_id: str,
        target_status: str,
        actor: str,
        fields: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.transition_recount_request(
                    recount_id=recount_id,
                    target_status=target_status,
                    actor=actor,
                    fields=fields,
                    db_session=tx,
                )

        recount = await self.get_recount_request(recount_id, db_session=db_session)
        if not recount:
            raise GovernanceViolation(f"CRITICAL: Recount request not found: {recount_id}")

        current_status = self._normalize_recount_status(recount.get("status"))
        normalized_target = self._normalize_recount_status(target_status)
        self._assert_recount_transition(current_status, normalized_target)

        session_id = str(recount.get("session_id") or "").strip()
        if session_id:
            await self.ensure_session_not_finalized(session_id, db_session=db_session)

        now_dt = _utc_now()
        update_fields = dict(fields or {})
        update_fields["status"] = normalized_target
        update_fields.setdefault("updated_at", now_dt)
        kwargs = self._kwargs(db_session)
        lookup = (
            {"_id": recount["_id"]}
            if recount.get("_id") is not None
            else self._recount_lookup(recount_id)
        )

        await self._execute_authorized_write(
            lambda: self.db.recount_requests.update_one(
                lookup,
                {"$set": update_fields},
                **kwargs,
            )
        )

        refreshed = await self.get_recount_request(recount_id, db_session=db_session)
        if not refreshed:
            merged = dict(recount)
            merged.update(update_fields)
            refreshed = merged

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="RECOUNT_TRANSITION",
            session_id=session_id or "UNKNOWN",
            actor_id=actor,
            metadata={
                "recount_id": str(recount.get("_id") or recount.get("id") or recount_id),
                "from_status": current_status,
                "to_status": normalized_target,
            },
            db_session=db_session,
        )
        return refreshed

    async def _finalize_session_canonical_core(
        self,
        *,
        session_id: str,
        actor: str,
        note: Optional[str],
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        from backend.services.canonical_inventory import is_blocking_finalization

        kwargs = self._kwargs(db_session)
        session = await self.ensure_session_exists(session_id, db_session=db_session)
        if (
            session.get("finalized_at")
            or normalize_session_status(session.get("status")) == "FINALIZED"
        ):
            raise GovernanceViolation("Session is finalized. Mutation blocked.")

        current = normalize_session_status(session.get("status"))
        if current != "REVIEW":
            raise GovernanceViolation("CRITICAL: Session must be in REVIEW before FINALIZED")

        assert_valid_transition(current, "FINALIZED")
        await assert_valid_write(
            {
                "db": self.db,
                "session": session,
                "session_id": session_id,
                "db_session": db_session,
                "require_active_session": False,
                "require_full_context": False,
                "from_state": current,
                "to_state": "FINALIZED",
            }
        )

        lines = await self.db.count_lines.find({"session_id": session_id}, **kwargs).to_list(
            length=50000
        )
        blocking_lines = [line for line in lines if is_blocking_finalization(line)]
        if blocking_lines:
            raise GovernanceViolation(
                "CRITICAL: Session has unresolved count lines and cannot be finalized"
            )

        finalized_at = _utc_now()
        count_lines_to_finalize = [
            line
            for line in lines
            if str(line.get("status") or "") not in {"locked", "SUPERSEDED", "superseded"}
            and str(line.get("approval_status") or "") not in {"REJECTED", "NEEDS_REVIEW"}
        ]
        if count_lines_to_finalize:
            if self.count_line_finalizer is None:
                raise GovernanceViolation(
                    "CRITICAL: Session finalization requires configured count-line finalizer"
                )
            await self.count_line_finalizer(
                session_id=session_id,
                actor=actor,
                finalized_at=finalized_at,
                note=note,
                db_session=db_session,
            )

        totals = await self._compute_session_totals(session_id, db_session=db_session)
        session_update: dict[str, Any] = {
            "status": "FINALIZED",
            "finalization_status": "FINALIZED",
            "workflow_status": "CLOSED",
            "approved_at": finalized_at,
            "approved_by": actor,
            "completed_at": finalized_at,
            "closed_at": finalized_at,
            "last_heartbeat": finalized_at,
            "finalized_at": finalized_at,
            "finalized_by": actor,
            "updated_at": finalized_at,
            "updated_by": actor,
            **totals,
        }
        if note:
            session_update["finalization_note"] = note

        expected_version = coerce_version(session.get("version"))
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=session_update,
            expected_version=expected_version,
            db_session=db_session,
        )

        await self._execute_authorized_write(
            lambda: self.db.verification_sessions.update_one(
                {"session_id": session_id},
                {
                    "$set": {
                        "status": "FINALIZED",
                        "last_heartbeat": finalized_at,
                        "completed_at": finalized_at,
                        "updated_by": actor,
                    }
                },
                **kwargs,
            )
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="FINALIZE",
            session_id=session_id,
            actor_id=actor,
            version=expected_version + 1,
            metadata={"note": note},
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.finalize",
            actor=actor,
            db_session=db_session,
        )

        refreshed = await self.ensure_session_exists(session_id, db_session=db_session)
        return {
            "session": refreshed,
            "finalized_at": finalized_at,
            "totals": totals,
        }

    async def finalize_session_canonical(
        self,
        *,
        session_id: str,
        actor: str,
        note: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is not None:
            return await self._finalize_session_canonical_core(
                session_id=session_id,
                actor=actor,
                note=note,
                db_session=db_session,
            )

        async with mongo_transaction(self.db.client) as tx:
            return await self._finalize_session_canonical_core(
                session_id=session_id,
                actor=actor,
                note=note,
                db_session=tx,
            )

    async def archive_session(
        self,
        *,
        session_id: str,
        actor: str,
        reason_code: str,
        reason: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.archive_session(
                    session_id=session_id,
                    actor=actor,
                    reason_code=reason_code,
                    reason=reason,
                    db_session=tx,
                )

        session = await self.ensure_session_exists(session_id, db_session=db_session)
        current = normalize_session_status(session.get("status"))
        if current != "FINALIZED":
            raise GovernanceViolation("CRITICAL: Session must be FINALIZED before archiving")

        assert_valid_transition(current, "ARCHIVED")
        with write_authority("SessionLifecycleService"):
            await assert_valid_write(
                {
                    "db": self.db,
                    "session": session,
                    "session_id": session_id,
                    "db_session": db_session,
                    "require_active_session": False,
                    "require_full_context": False,
                    "from_state": current,
                    "to_state": "ARCHIVED",
                    "allow_finalized_mutation": True,
                }
            )

        now_dt = _utc_now()
        update_doc = {
            "status": "ARCHIVED",
            "workflow_status": "ARCHIVED",
            "archived": True,
            "archived_at": now_dt,
            "archived_by": actor,
            "archive_reason_code": str(reason_code).strip(),
            "archive_reason": str(reason).strip()
            if isinstance(reason, str) and reason.strip()
            else None,
            "updated_at": now_dt,
            "updated_by": actor,
            "last_heartbeat": now_dt,
        }

        prospective = dict(session)
        prospective.update(update_doc)
        await self.validation_service.validate_session(prospective)

        expected_version = coerce_version(session.get("version"))
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=update_doc,
            expected_version=expected_version,
            db_session=db_session,
        )

        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.verification_sessions.update_one(
                {"session_id": session_id},
                {"$set": {"status": "ARCHIVED", "last_heartbeat": now_dt}},
                **kwargs,
            )
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="ARCHIVE",
            session_id=session_id,
            actor_id=actor,
            version=expected_version + 1,
            metadata={
                "reason_code": update_doc.get("archive_reason_code"),
                "reason": update_doc.get("archive_reason"),
            },
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.archive",
            actor=actor,
            db_session=db_session,
        )
        return await self.ensure_session_exists(session_id, db_session=db_session)

    async def reopen_session(
        self,
        *,
        session_id: str,
        actor: str,
        reason_code: str,
        reason: str,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if db_session is None:
            async with mongo_transaction(self.db.client) as tx:
                return await self.reopen_session(
                    session_id=session_id,
                    actor=actor,
                    reason_code=reason_code,
                    reason=reason,
                    db_session=tx,
                )

        session = await self.ensure_session_exists(session_id, db_session=db_session)
        current = normalize_session_status(session.get("status"))
        if current != "FINALIZED":
            raise GovernanceViolation("CRITICAL: Only FINALIZED sessions can be reopened")
        if bool(session.get("archived")) or current == "ARCHIVED":
            raise GovernanceViolation("CRITICAL: Archived sessions cannot be reopened")

        assert_valid_transition(current, "REVIEW")
        with write_authority("SessionLifecycleService"):
            await assert_valid_write(
                {
                    "db": self.db,
                    "session": session,
                    "session_id": session_id,
                    "db_session": db_session,
                    "require_active_session": False,
                    "require_full_context": False,
                    "from_state": current,
                    "to_state": "REVIEW",
                    "allow_finalized_mutation": True,
                }
            )

        normalized_reason_code = str(reason_code or "").strip()
        normalized_reason = str(reason or "").strip()
        if not normalized_reason_code:
            raise GovernanceViolation("CRITICAL: reason_code is required to reopen a session")
        if not normalized_reason:
            raise GovernanceViolation("CRITICAL: reason is required to reopen a session")

        now_dt = _utc_now()
        update_doc = {
            "status": "REVIEW",
            "workflow_status": "REVIEW",
            "finalization_status": "REOPENED",
            "reopened_at": now_dt,
            "reopened_by": actor,
            "reopen_reason_code": normalized_reason_code,
            "reopen_reason": normalized_reason,
            "last_finalized_at": session.get("finalized_at"),
            "last_finalized_by": session.get("finalized_by"),
            "finalized_at": None,
            "finalized_by": None,
            "closed_at": None,
            "completed_at": None,
            "review_started_at": now_dt,
            "updated_at": now_dt,
            "updated_by": actor,
            "last_heartbeat": now_dt,
            "reopen_count": int(session.get("reopen_count") or 0) + 1,
        }

        prospective = dict(session)
        prospective.update(update_doc)
        await self.validation_service.validate_session(prospective)

        expected_version = coerce_version(session.get("version"))
        await self._update_session_with_occ(
            session_id=session_id,
            set_doc=update_doc,
            expected_version=expected_version,
            db_session=db_session,
        )

        kwargs = self._kwargs(db_session)
        await self._execute_authorized_write(
            lambda: self.db.verification_sessions.update_one(
                {"session_id": session_id},
                {"$set": {"status": "REVIEW", "last_heartbeat": now_dt}},
                **kwargs,
            )
        )

        await self.audit_service.log_write_event(
            event="SESSION_WRITE",
            operation="REOPEN",
            session_id=session_id,
            actor_id=actor,
            version=expected_version + 1,
            metadata={
                "reason_code": normalized_reason_code,
                "reason": normalized_reason,
                "last_finalized_at": str(session.get("finalized_at") or ""),
                "last_finalized_by": str(session.get("finalized_by") or ""),
            },
            db_session=db_session,
        )
        await self._sync_session_projection(
            session_id=session_id,
            trigger="session.reopen",
            actor=actor,
            db_session=db_session,
        )
        return await self.ensure_session_exists(session_id, db_session=db_session)
