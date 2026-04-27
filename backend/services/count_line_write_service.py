from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import inspect
import json
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.services.concurrency import ConcurrencyError, coerce_version
from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import GovernanceViolation, assert_valid_write, write_authority
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.snapshot_service import SnapshotService
from backend.services.transaction_manager import mongo_transaction
from backend.services.validation_service import ValidationService
from backend.services.variance_service import VarianceService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_reason(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _is_superseded_status(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    return value.strip().lower() == "superseded"


def _is_superseded_count_line(line: Any) -> bool:
    if not isinstance(line, dict):
        return False
    if _is_superseded_status(line.get("status")):
        return True
    if line.get("superseded_by_version_id"):
        return True
    if line.get("superseded_at"):
        return True
    return False


def _resolve_unit_price(item: dict[str, Any]) -> float:
    for field_name in ("last_cost", "sale_price", "sales_price", "mrp"):
        value = _as_float(item.get(field_name), default=0.0)
        if value != 0.0 or item.get(field_name) not in (None, ""):
            return value
    return 0.0


def _build_semantic_hash(document: dict[str, Any]) -> str:
    payload = {
        "session_id": str(document.get("session_id") or ""),
        "item_id": str(document.get("item_code") or document.get("item_id") or ""),
        "location_id": str(document.get("location_id") or ""),
        "counted_qty": _as_float(document.get("counted_qty")),
        "version": int(document.get("version", 1) or 1),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _normalize_update_array_values(value: Any) -> list[Any]:
    if isinstance(value, dict) and isinstance(value.get("$each"), list):
        return list(value.get("$each") or [])
    if isinstance(value, list):
        return list(value)
    return [value]


def _apply_update_document_to_merged(
    merged_document: dict[str, Any],
    update_doc: dict[str, Any],
) -> None:
    # Replacement-style updates (no operators) behave like top-level key updates.
    if not any(str(key).startswith("$") for key in update_doc):
        merged_document.update(update_doc)
        return

    set_doc = update_doc.get("$set")
    if isinstance(set_doc, dict):
        merged_document.update(set_doc)

    inc_doc = update_doc.get("$inc")
    if isinstance(inc_doc, dict):
        for field_name, delta in inc_doc.items():
            current_value = merged_document.get(field_name)
            if isinstance(current_value, (int, float)) and isinstance(delta, (int, float)):
                merged_document[field_name] = current_value + delta
            elif isinstance(delta, (int, float)):
                merged_document[field_name] = delta

    unset_doc = update_doc.get("$unset")
    if isinstance(unset_doc, dict):
        for field_name in unset_doc.keys():
            merged_document.pop(field_name, None)

    for operator in ("$push", "$addToSet"):
        push_doc = update_doc.get(operator)
        if not isinstance(push_doc, dict):
            continue
        for field_name, raw_values in push_doc.items():
            values = _normalize_update_array_values(raw_values)
            existing = merged_document.get(field_name)
            if not isinstance(existing, list):
                existing = [] if existing is None else [existing]
            if operator == "$addToSet":
                for value in values:
                    if value not in existing:
                        existing.append(value)
            else:
                existing.extend(values)
            merged_document[field_name] = existing

    pull_doc = update_doc.get("$pull")
    if isinstance(pull_doc, dict):
        for field_name, raw_condition in pull_doc.items():
            existing = merged_document.get(field_name)
            if not isinstance(existing, list):
                continue
            if isinstance(raw_condition, dict) and isinstance(raw_condition.get("$in"), list):
                disallowed_values = list(raw_condition.get("$in") or [])
                merged_document[field_name] = [
                    value for value in existing if value not in disallowed_values
                ]
            else:
                merged_document[field_name] = [
                    value for value in existing if value != raw_condition
                ]


@dataclass(frozen=True)
class CountLineGovernanceDecision:
    approval_status: str
    approved_at: Optional[datetime]
    approved_by: Optional[str]
    requires_supervisor_approval: bool
    status: str
    variance: float
    variance_data: dict[str, Any]
    violated_thresholds: list[dict[str, Any]]


@dataclass(frozen=True)
class CountLineGovernanceModeProfile:
    require_active_session: bool
    require_full_context: bool


DEFAULT_GOVERNANCE_MODE = "active_session"
GOVERNANCE_MODE_PROFILES: dict[str, CountLineGovernanceModeProfile] = {
    "active_session": CountLineGovernanceModeProfile(
        require_active_session=True,
        require_full_context=True,
    ),
    "mutable_session": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=True,
    ),
    "finalization": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=False,
    ),
    "repair": CountLineGovernanceModeProfile(
        require_active_session=False,
        require_full_context=False,
    ),
}
DEFAULT_VALIDATION_MODE = "enforce"
VALIDATION_MODES = {"enforce", "repair_skip"}


class CountLineWriteService:
    """Authoritative write-side governance for count-line mutations."""

    def __init__(
        self,
        db: Any,
        *,
        snapshot_service: Optional[SnapshotService] = None,
        variance_service: Optional[VarianceService] = None,
        validation_service: Optional[ValidationService] = None,
        lifecycle_service: Optional[SessionLifecycleService] = None,
        audit_service: Optional[GovernanceAuditService] = None,
    ) -> None:
        self.db = db
        self.snapshot_service = snapshot_service or SnapshotService(db)
        self.variance_service = variance_service or VarianceService(db)
        self.validation_service = validation_service or ValidationService(db)
        self.lifecycle_service = lifecycle_service or SessionLifecycleService(db)
        self.audit_service = audit_service or GovernanceAuditService(db)
        self._session_snapshot_cache: dict[str, Optional[dict[str, Any]]] = {}
        self._session_snapshot_item_index: dict[str, dict[str, float]] = {}

    async def _resolve_awaitable(self, value: Any) -> Any:
        resolved = value
        for _ in range(10):
            if not inspect.isawaitable(resolved):
                break
            resolved = await resolved
        return resolved

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority("CountLineWriteService"):
            result = write_call()
            return await self._resolve_awaitable(result)

    @staticmethod
    def _resolve_governance_mode_profile(
        context: dict[str, Any],
    ) -> CountLineGovernanceModeProfile:
        if "require_active_session" in context or "require_full_context" in context:
            raise GovernanceViolation(
                "CRITICAL: free-form governance flags have been removed. "
                "Use governance_mode."
            )

        mode_name = str(context.get("governance_mode") or DEFAULT_GOVERNANCE_MODE).strip().lower()
        profile = GOVERNANCE_MODE_PROFILES.get(mode_name)
        if profile is None:
            raise GovernanceViolation(
                f"CRITICAL: Unsupported governance_mode '{mode_name}'"
            )
        return profile

    @staticmethod
    def _should_run_runtime_validation(context: dict[str, Any]) -> bool:
        if "skip_runtime_validation" in context:
            raise GovernanceViolation(
                "CRITICAL: skip_runtime_validation has been removed. Use validation_mode."
            )

        validation_mode = str(
            context.get("validation_mode") or DEFAULT_VALIDATION_MODE
        ).strip().lower()
        if validation_mode not in VALIDATION_MODES:
            raise GovernanceViolation(
                f"CRITICAL: Unsupported validation_mode '{validation_mode}'"
            )
        if validation_mode == "repair_skip":
            governance_mode = str(context.get("governance_mode") or "").strip().lower()
            if governance_mode != "repair":
                raise GovernanceViolation(
                    "CRITICAL: validation_mode='repair_skip' requires governance_mode='repair'"
                )
            return False
        return True

    @staticmethod
    def _extract_db_session(context: dict[str, Any]) -> Optional[Any]:
        return context.get("db_session") or context.get("mongo_session")

    async def _load_session_for_write(
        self,
        session_id: str,
        *,
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        kwargs = {"session": db_session} if db_session is not None else {}
        session = await self._resolve_awaitable(
            self.db.sessions.find_one(
                {"$or": [{"id": session_id}, {"session_id": session_id}]},
                **kwargs,
            )
        )
        if not isinstance(session, dict):
            raise GovernanceViolation(f"CRITICAL: Session not found: {session_id}")
        return session

    async def _capture_session_versions(
        self,
        session_ids: list[str],
        *,
        context: dict[str, Any],
        db_session: Optional[Any],
    ) -> dict[str, int]:
        expected_map: dict[str, int] = {}
        expected_ctx = context.get("expected_session_version")
        if isinstance(expected_ctx, int):
            for session_id in session_ids:
                expected_map[session_id] = int(expected_ctx)
        elif isinstance(expected_ctx, dict):
            for session_id in session_ids:
                if session_id in expected_ctx:
                    expected_map[session_id] = int(expected_ctx[session_id])

        versions: dict[str, int] = {}
        for session_id in session_ids:
            session_doc = await self._load_session_for_write(session_id, db_session=db_session)
            current_version = coerce_version(session_doc.get("version"))
            expected = expected_map.get(session_id)
            if expected is not None and expected != current_version:
                raise ConcurrencyError(
                    f"CRITICAL: Session version mismatch for {session_id}: "
                    f"expected {expected}, current {current_version}"
                )
            versions[session_id] = current_version
        return versions

    async def _compute_session_totals(
        self,
        session_id: str,
        *,
        db_session: Optional[Any],
    ) -> dict[str, Any]:
        from backend.services.canonical_inventory import is_count_line_effectively_reviewed

        total_items = 0
        total_variance = 0.0
        verified_items = 0
        damage_items = 0
        last_activity: Optional[datetime] = None
        kwargs = {"session": db_session} if db_session is not None else {}
        cursor = self.db.count_lines.find({"session_id": session_id}, **kwargs)
        async for line in cursor:
            if _is_superseded_count_line(line):
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

    async def _update_session_totals_for_sessions(
        self,
        *,
        session_ids: list[str],
        context: dict[str, Any],
        db_session: Optional[Any],
        expected_versions: dict[str, int],
    ) -> None:
        actor = str(context.get("username") or context.get("actor") or "system")
        for session_id in session_ids:
            totals = await self._compute_session_totals(session_id, db_session=db_session)
            await self.lifecycle_service.update_session_totals(
                session_id,
                totals,
                db_session=db_session,
                expected_version=expected_versions.get(session_id),
                actor=actor,
            )

    async def _log_count_line_audit(
        self,
        *,
        payload: dict[str, Any],
        context: dict[str, Any],
        session_ids: list[str],
        db_session: Optional[Any],
    ) -> None:
        operation = str(payload.get("operation") or "").strip().lower()
        document = payload.get("document") if isinstance(payload.get("document"), dict) else {}
        actor = str(context.get("username") or context.get("actor") or "system")
        audit_operation = "COUNT"
        if operation == "insert_one" and document.get("previous_version_id"):
            audit_operation = "RECOUNT"

        item_id = str(document.get("item_code") or document.get("item_id") or "")
        location_id = str(document.get("location_id") or "")
        idempotency_key = document.get("idempotency_key")
        semantic_hash = document.get("semantic_hash")
        version = int(document.get("version", 1) or 1)

        for session_id in session_ids:
            await self.audit_service.log_write_event(
                event="COUNT_LINE_WRITE",
                operation=audit_operation,
                session_id=session_id,
                item_id=item_id or None,
                location_id=location_id or None,
                version=version,
                idempotency_key=str(idempotency_key) if idempotency_key else None,
                semantic_hash=str(semantic_hash) if semantic_hash else None,
                actor_id=actor,
                db_session=db_session,
            )

    async def _execute_count_line_operation(
        self,
        *,
        payload: dict[str, Any],
        context: dict[str, Any],
        db_session: Optional[Any],
    ) -> Any:
        operation = str(payload.get("operation") or "").strip().lower()
        collection = self.db.count_lines
        kwargs = {"session": db_session} if db_session is not None else {}

        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict):
                raise ValueError("insert_one payload requires a 'document' dictionary")
            return await self._execute_authorized_write(
                lambda: collection.insert_one(document, **kwargs)
            )

        if operation == "update_one":
            filter_query = payload.get("filter")
            update_doc = payload.get("update")
            if not isinstance(filter_query, dict) or not isinstance(update_doc, dict):
                raise ValueError("update_one payload requires 'filter' and 'update' dictionaries")
            upsert = bool(payload.get("upsert", False))
            prefer_keyword = bool(context.get("keyword_update", False))
            if prefer_keyword:
                try:
                    return await self._execute_authorized_write(
                        lambda: collection.update_one(
                            filter_query,
                            update=update_doc,
                            upsert=upsert,
                            **kwargs,
                        )
                    )
                except TypeError:
                    if upsert:
                        return await self._execute_authorized_write(
                            lambda: collection.update_one(filter_query, update_doc, upsert, **kwargs)
                        )
                    return await self._execute_authorized_write(
                        lambda: collection.update_one(filter_query, update_doc, **kwargs)
                    )
            try:
                return await self._execute_authorized_write(
                    lambda: collection.update_one(filter_query, update_doc, upsert=upsert, **kwargs)
                )
            except TypeError:
                try:
                    return await self._execute_authorized_write(
                        lambda: collection.update_one(filter_query, update_doc, **kwargs)
                    )
                except TypeError:
                    return await self._execute_authorized_write(
                        lambda: collection.update_one(
                            filter_query,
                            update=update_doc,
                            upsert=upsert,
                            **kwargs,
                        )
                    )

        if operation == "update_many":
            filter_query = payload.get("filter")
            update_doc = payload.get("update")
            if not isinstance(filter_query, dict) or not isinstance(update_doc, dict):
                raise ValueError("update_many payload requires 'filter' and 'update' dictionaries")
            prefer_keyword = bool(context.get("keyword_update", False))
            if prefer_keyword:
                try:
                    return await self._execute_authorized_write(
                        lambda: collection.update_many(filter_query, update=update_doc, **kwargs)
                    )
                except TypeError:
                    return await self._execute_authorized_write(
                        lambda: collection.update_many(filter_query, update_doc, **kwargs)
                    )
            try:
                return await self._execute_authorized_write(
                    lambda: collection.update_many(filter_query, update_doc, **kwargs)
                )
            except TypeError:
                return await self._execute_authorized_write(
                    lambda: collection.update_many(filter_query, update=update_doc, **kwargs)
                )

        if operation == "delete_one":
            filter_query = payload.get("filter")
            if not isinstance(filter_query, dict):
                raise ValueError("delete_one payload requires a 'filter' dictionary")
            return await self._execute_authorized_write(
                lambda: collection.delete_one(filter_query, **kwargs)
            )

        filter_query = payload.get("filter")
        if not isinstance(filter_query, dict):
            raise ValueError("delete_many payload requires a 'filter' dictionary")
        return await self._execute_authorized_write(
            lambda: collection.delete_many(filter_query, **kwargs)
        )

    async def _process_write_core(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
        *,
        db_session: Optional[Any],
    ) -> Any:
        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"insert_one", "update_one", "update_many", "delete_one", "delete_many"}:
            raise ValueError(f"Unsupported count-line write operation: {operation}")

        ctx = dict(context)
        ctx["db_session"] = db_session

        await self._assert_snapshot_integrity_for_write(payload, ctx)
        await self._assert_mandatory_write_invariants(payload, ctx)
        self._apply_state_transition_for_write(payload, ctx)
        if self._should_apply_governance(payload, ctx):
            await self._enforce_variance_for_write(payload, ctx)

        session_ids = await self._collect_session_ids_for_write(payload, ctx)
        expected_versions = await self._capture_session_versions(
            session_ids,
            context=ctx,
            db_session=db_session,
        )

        resolved = await self._execute_count_line_operation(
            payload=payload,
            context=ctx,
            db_session=db_session,
        )
        await self._run_post_write_validation(
            operation=operation,
            payload=payload,
            context=ctx,
            resolved_result=resolved,
        )

        if not bool(ctx.get("skip_session_totals_update", False)):
            await self._update_session_totals_for_sessions(
                session_ids=session_ids,
                context=ctx,
                db_session=db_session,
                expected_versions=expected_versions,
            )

        await self._log_count_line_audit(
            payload=payload,
            context=ctx,
            session_ids=session_ids,
            db_session=db_session,
        )
        return resolved

    async def commit(
        self,
        payload: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
    ) -> Any:
        if not isinstance(payload, dict):
            raise ValueError("payload must be a dictionary")

        ctx = context or {}
        if "skip_transaction" in ctx:
            raise GovernanceViolation(
                "CRITICAL: skip_transaction bypass has been removed from CountLineWriteService"
            )
        external_session = self._extract_db_session(ctx)
        if external_session is not None:
            return await self._process_write_core(payload, ctx, db_session=external_session)

        async with mongo_transaction(self.db.client) as tx:
            tx_context = dict(ctx)
            tx_context["db_session"] = tx
            return await self._process_write_core(payload, tx_context, db_session=tx)

    async def process_write(
        self,
        payload: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
    ) -> Any:
        return await self.commit(payload, context)

    async def _run_post_write_validation(
        self,
        *,
        operation: str,
        payload: dict[str, Any],
        context: dict[str, Any],
        resolved_result: Any,
    ) -> None:
        if not self._should_run_runtime_validation(context):
            return
        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}

        if operation == "insert_one":
            document = payload.get("document")
            if isinstance(document, dict):
                if hasattr(resolved_result, "inserted_id") and "_id" not in document:
                    document["_id"] = getattr(resolved_result, "inserted_id")
                await self.validation_service.validate_count_line(document)
            return

        if operation == "update_one":
            filter_query = payload.get("filter")
            updated = None
            upserted_id = getattr(resolved_result, "upserted_id", None)
            if upserted_id is not None:
                updated = await self._resolve_awaitable(
                    self.db.count_lines.find_one({"_id": upserted_id}, **kwargs)
                )
            elif isinstance(filter_query, dict):
                updated = await self._resolve_awaitable(
                    self.db.count_lines.find_one(filter_query, **kwargs)
                )
            if isinstance(updated, dict):
                await self.validation_service.validate_count_line(updated)
            return

        if operation == "update_many":
            filter_query = payload.get("filter")
            if isinstance(filter_query, dict):
                updated_lines = await self._resolve_awaitable(
                    self.db.count_lines.find(filter_query, **kwargs).to_list(length=5000)
                )
                for line in updated_lines or []:
                    if isinstance(line, dict):
                        await self.validation_service.validate_count_line(line)
            return

    async def _assert_mandatory_write_invariants(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        mode_profile = self._resolve_governance_mode_profile(context)
        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}
        operation = str(payload.get("operation") or "").strip().lower()
        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict):
                raise GovernanceViolation("CRITICAL: insert_one requires document context")
            session_id = document.get("session_id") or context.get("session_id")
            idempotency_key = document.get("idempotency_key")
            if session_id and idempotency_key:
                existing = await self._resolve_awaitable(
                    self.db.count_lines.find_one(
                        {
                            "session_id": session_id,
                            "idempotency_key": idempotency_key,
                        },
                        **kwargs,
                    )
                )
                if isinstance(existing, dict):
                    raise GovernanceViolation(
                        "CRITICAL: Duplicate idempotency_key for count-line write"
                    )

            previous_version_id = document.get("previous_version_id")
            if previous_version_id:
                previous_filter: dict[str, Any] = {"id": str(previous_version_id)}
                if ObjectId.is_valid(str(previous_version_id)):
                    previous_filter = {
                        "$or": [
                            {"id": str(previous_version_id)},
                            {"_id": ObjectId(str(previous_version_id))},
                        ]
                    }
                previous_doc = await self._resolve_awaitable(
                    self.db.count_lines.find_one(previous_filter, **kwargs)
                )
                if not isinstance(previous_doc, dict):
                    raise GovernanceViolation(
                        "CRITICAL: previous_version_id references missing count line"
                    )
                incoming_version = int(document.get("version", 0) or 0)
                expected_version = int(previous_doc.get("version", 1) or 1) + 1
                if incoming_version != expected_version:
                    raise GovernanceViolation(
                        "CRITICAL: Invalid version progression for recount write"
                    )

            semantic_hash = document.get("semantic_hash") or _build_semantic_hash(document)
            document["semantic_hash"] = semantic_hash
            existing_semantic = await self._resolve_awaitable(
                self.db.count_lines.find_one({"semantic_hash": semantic_hash}, **kwargs)
            )
            if isinstance(existing_semantic, dict):
                raise GovernanceViolation(
                    "CRITICAL: Duplicate semantic hash for logical count write"
                )

            await assert_valid_write(
                {
                    "db": self.db,
                    "session": context.get("session"),
                    "session_id": session_id,
                    "document": document,
                    "db_session": db_session,
                    "require_active_session": mode_profile.require_active_session,
                    "require_full_context": mode_profile.require_full_context,
                }
            )
            return

        if operation in {"update_one", "delete_one"}:
            filter_query = payload.get("filter")
            if not isinstance(filter_query, dict):
                raise GovernanceViolation("CRITICAL: Missing filter for single-document mutation")
            existing = await self._resolve_awaitable(
                self.db.count_lines.find_one(filter_query, **kwargs)
            )
            if not isinstance(existing, dict):
                raise GovernanceViolation("CRITICAL: Count line not found for guarded mutation")

            merged_document = dict(existing)
            if operation == "update_one":
                update_doc = payload.get("update")
                if isinstance(update_doc, dict):
                    _apply_update_document_to_merged(merged_document, update_doc)
                if "counted_qty" in merged_document:
                    semantic_hash = _build_semantic_hash(merged_document)
                    set_doc = update_doc.setdefault("$set", {}) if isinstance(update_doc, dict) else {}
                    if isinstance(set_doc, dict):
                        set_doc["semantic_hash"] = semantic_hash
                    existing_collision = await self._resolve_awaitable(
                        self.db.count_lines.find_one({"semantic_hash": semantic_hash}, **kwargs)
                    )
                    existing_collision_id = (
                        str(existing_collision.get("id") or existing_collision.get("_id"))
                        if isinstance(existing_collision, dict)
                        else None
                    )
                    current_id = str(existing.get("id") or existing.get("_id") or "")
                    if existing_collision_id and existing_collision_id != current_id:
                        raise GovernanceViolation(
                            "CRITICAL: Duplicate semantic hash for logical count write"
                        )
            await assert_valid_write(
                {
                    "db": self.db,
                    "session": context.get("session"),
                    "session_id": merged_document.get("session_id") or context.get("session_id"),
                    "document": merged_document,
                    "db_session": db_session,
                    "require_active_session": mode_profile.require_active_session,
                    "require_full_context": mode_profile.require_full_context,
                }
            )
            return

        if operation in {"update_many", "delete_many"}:
            candidate_lines = context.get("candidate_lines")
            if not isinstance(candidate_lines, list):
                filter_query = payload.get("filter")
                if not isinstance(filter_query, dict):
                    raise GovernanceViolation("CRITICAL: Missing filter for bulk mutation")
                candidate_lines = await self._resolve_awaitable(
                    self.db.count_lines.find(filter_query, **kwargs).to_list(length=5000)
                )
            if not candidate_lines:
                raise GovernanceViolation("CRITICAL: No candidate lines for guarded bulk mutation")
            for line in candidate_lines:
                if not isinstance(line, dict):
                    continue
                await assert_valid_write(
                    {
                        "db": self.db,
                        "session": context.get("session"),
                        "session_id": line.get("session_id") or context.get("session_id"),
                        "document": line,
                        "db_session": db_session,
                        "require_active_session": mode_profile.require_active_session,
                        "require_full_context": mode_profile.require_full_context,
                    }
                )

    def _apply_state_transition_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        transition = str(context.get("transition") or "").strip().lower()
        if not transition:
            return

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"update_one", "update_many"}:
            raise ValueError(f"State transition '{transition}' requires update_one or update_many")

        update_doc = payload.setdefault("update", {})
        if not isinstance(update_doc, dict):
            raise ValueError("State transition writes require an update document")

        set_doc = update_doc.setdefault("$set", {})
        if not isinstance(set_doc, dict):
            raise ValueError("State transition writes require a '$set' dictionary")

        actor = str(
            context.get("username")
            or context.get("user_id")
            or context.get("actor")
            or "system"
        ).strip() or "system"
        occurred_at = context.get("transitioned_at")
        if not isinstance(occurred_at, datetime):
            occurred_at = _utc_now()

        if transition == "verify":
            set_doc["verified"] = True
            set_doc["verified_by"] = actor
            set_doc["verified_at"] = occurred_at
            return

        if transition == "unverify":
            set_doc["verified"] = False
            set_doc["verified_by"] = None
            set_doc["verified_at"] = None
            return

        if transition == "approve":
            set_doc["status"] = "approved"
            set_doc["approval_status"] = "APPROVED"
            set_doc["approved_by"] = actor
            set_doc["approved_at"] = occurred_at
            set_doc["approval_note"] = _normalize_reason(context.get("approval_note"))
            set_doc["rejected_by"] = None
            set_doc["rejected_at"] = None
            set_doc["rejection_reason"] = None
            set_doc["assigned_to"] = None
            set_doc["recount_requested_at"] = None
            set_doc["recount_requested_by"] = None
            if bool(context.get("mark_verified_on_approval", False)):
                set_doc["verified"] = True
                set_doc["verified_by"] = actor
                set_doc["verified_at"] = occurred_at
            return

        if transition == "reject":
            set_doc["status"] = "rejected"
            set_doc["approval_status"] = "REJECTED"
            set_doc["approved_by"] = None
            set_doc["approved_at"] = None
            set_doc["approval_note"] = None
            set_doc["verified"] = False
            set_doc["verified_by"] = None
            set_doc["verified_at"] = None
            set_doc["rejected_by"] = actor
            set_doc["rejected_at"] = occurred_at
            set_doc["rejection_reason"] = _normalize_reason(
                context.get("rejection_reason")
                or context.get("approval_note")
                or context.get("transition_note")
            )
            if bool(context.get("mark_recount_requested", True)):
                set_doc["recount_requested_at"] = occurred_at
                set_doc["recount_requested_by"] = actor
                set_doc["assigned_to"] = _normalize_reason(context.get("assigned_to"))
            else:
                set_doc["recount_requested_at"] = None
                set_doc["recount_requested_by"] = None
                set_doc["assigned_to"] = None
            return

        raise ValueError(f"Unsupported count-line state transition: {transition}")

    def _should_apply_governance(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> bool:
        if "skip_governance" in context:
            raise GovernanceViolation(
                "CRITICAL: skip_governance bypass has been removed from CountLineWriteService"
            )

        operation = str(payload.get("operation") or "").strip().lower()
        if operation == "insert_one":
            document = payload.get("document")
            return isinstance(document, dict) and "counted_qty" in document

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return False
            set_doc = update_doc.get("$set")
            return isinstance(set_doc, dict) and "counted_qty" in set_doc

        return bool(context.get("enforce_variance"))

    async def assert_session_integrity(
        self, *, session: Optional[dict[str, Any]] = None, session_id: Optional[str] = None
    ) -> Optional[dict[str, Any]]:
        if not hasattr(self.snapshot_service, "assert_session_snapshot_integrity"):
            return None
        try:
            result = self.snapshot_service.assert_session_snapshot_integrity(
                session, session_id=session_id
            )
            return await self._resolve_awaitable(result)
        except Exception as exc:
            if exc.__class__.__name__ != "SnapshotIntegrityError":
                raise
            raise HTTPException(
                status_code=409,
                detail="Snapshot integrity violated for this session",
            ) from exc

    async def resolve_baseline(
        self,
        *,
        session_id: str,
        item_code: str,
        username: str,
        erp_item: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> tuple[float, str]:
        kwargs = {"session": db_session} if db_session is not None else {}
        normalized_item_code = str(item_code or "").strip()
        if db_session is None and session_id in self._session_snapshot_cache:
            session_snapshot = self._session_snapshot_cache[session_id]
        else:
            session_snapshot = await self._resolve_awaitable(
                self.db.session_snapshots.find_one({"session_id": session_id}, **kwargs)
            )
            if db_session is None:
                self._session_snapshot_cache[session_id] = (
                    session_snapshot if isinstance(session_snapshot, dict) else None
                )

        if isinstance(session_snapshot, dict):
            snapshot_hash = str(session_snapshot.get("snapshot_hash") or "").strip()
            item_index = self._session_snapshot_item_index.get(session_id)
            if item_index is None:
                item_index = {}
                for item in session_snapshot.get("items") or []:
                    indexed_item_code = str(item.get("item_code") or "").strip()
                    if not indexed_item_code:
                        continue
                    item_index[indexed_item_code] = _as_float(item.get("stock_qty"))
                self._session_snapshot_item_index[session_id] = item_index
            if normalized_item_code in item_index:
                return item_index[normalized_item_code], snapshot_hash or "SESSION_SNAPSHOT"
            # Item absent in frozen baseline: treat baseline as zero, never live ERP qty.
            return 0.0, snapshot_hash or "SESSION_SNAPSHOT_MISS"

        # Legacy fallback: read-only lookup from pre-existing stock_snapshots.
        try:
            legacy_snapshot = await self._resolve_awaitable(
                self.db.stock_snapshots.find_one(
                    {"session_id": session_id, "item_code": normalized_item_code},
                    **kwargs,
                )
            )
        except Exception:
            legacy_snapshot = None
        if isinstance(legacy_snapshot, dict):
            return float(legacy_snapshot.get("erp_qty") or 0.0), str(
                legacy_snapshot.get("baseline_hash") or "STOCK_SNAPSHOT"
            )

        raise HTTPException(
            status_code=409,
            detail="Baseline snapshot missing for session/item. Write blocked.",
        )

    async def evaluate_policy(
        self,
        *,
        item_code: str,
        counted_qty: float,
        expected_qty: float,
        item: dict[str, Any],
        location: Optional[str] = None,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        variance = float(counted_qty) - float(expected_qty)
        reason_present = bool(_normalize_reason(variance_reason)) or bool(correction_reason)
        if require_correction_reason_for_variance and abs(variance) > 0 and not reason_present:
            raise HTTPException(
                status_code=400,
                detail="Correction reason is mandatory when variance exists",
            )

        variance_data = await self.variance_service.calculate_variance(
            item_code=item_code,
            counted_qty=float(counted_qty),
            expected_qty=float(expected_qty),
            unit_price=_resolve_unit_price(item),
            valuation_basis="last_cost",
        )
        requires_approval, violated_thresholds = await self.variance_service.check_thresholds(
            variance_data,
            item_category=item.get("category"),
            location=location,
        )

        if any(threshold.get("require_reason") for threshold in violated_thresholds) and not reason_present:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Variance reason is required for this count",
                    "violated_thresholds": violated_thresholds,
                    "variance_data": variance_data,
                },
            )

        approved_at = None if requires_approval else _utc_now()
        approved_by = None if requires_approval else "system"
        return CountLineGovernanceDecision(
            approval_status="NEEDS_REVIEW" if requires_approval else "APPROVED",
            approved_at=approved_at,
            approved_by=approved_by,
            requires_supervisor_approval=requires_approval,
            status="pending" if requires_approval else "approved",
            variance=variance,
            variance_data=variance_data,
            violated_thresholds=violated_thresholds,
        )

    async def evaluate_new_count_line(
        self,
        *,
        session: dict[str, Any],
        item_code: str,
        counted_qty: float,
        erp_item: dict[str, Any],
        expected_qty: float,
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        return await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=True,
        )

    async def evaluate_existing_count_line(
        self,
        *,
        session: dict[str, Any],
        count_line: dict[str, Any],
        counted_qty: float,
        erp_item: dict[str, Any],
        variance_reason: Optional[str] = None,
        correction_reason: Optional[Any] = None,
        location: Optional[str] = None,
        require_correction_reason_for_variance: bool = False,
    ) -> CountLineGovernanceDecision:
        await self.assert_session_integrity(session=session)
        expected_qty = float(count_line.get("erp_qty") or 0.0)
        return await self.evaluate_policy(
            item_code=str(count_line.get("item_code") or ""),
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=location,
            variance_reason=variance_reason,
            correction_reason=correction_reason,
            require_correction_reason_for_variance=require_correction_reason_for_variance,
        )

    async def _assert_snapshot_integrity_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        if context.get("enforce_snapshot", True) is False:
            return

        explicit_session = context.get("session")
        if isinstance(explicit_session, dict):
            await self.assert_session_integrity(session=explicit_session)
            return

        session_ids = await self._collect_session_ids_for_write(payload, context)
        if not session_ids and not context.get("allow_missing_session", False):
            raise HTTPException(
                status_code=409,
                detail="Count line mutation requires session context",
            )

        checked = context.setdefault("_checked_session_ids", set())
        for session_id in session_ids:
            if session_id in checked:
                continue
            await self.assert_session_integrity(session_id=session_id)
            checked.add(session_id)

    async def _collect_session_ids_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> list[str]:
        session_ids: set[str] = set()
        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}

        context_session_id = context.get("session_id")
        if context_session_id:
            session_ids.add(str(context_session_id))

        for session_id in context.get("session_ids") or []:
            if session_id:
                session_ids.add(str(session_id))

        for candidate in context.get("candidate_lines") or []:
            if isinstance(candidate, dict) and candidate.get("session_id"):
                session_ids.add(str(candidate["session_id"]))

        document = payload.get("document")
        if isinstance(document, dict) and document.get("session_id"):
            session_ids.add(str(document["session_id"]))

        filter_query = payload.get("filter")
        if isinstance(filter_query, dict):
            if filter_query.get("session_id"):
                session_ids.add(str(filter_query["session_id"]))
            if isinstance(filter_query.get("$or"), list):
                for branch in filter_query["$or"]:
                    if isinstance(branch, dict) and branch.get("session_id"):
                        session_ids.add(str(branch["session_id"]))

        if session_ids:
            return sorted(session_ids)

        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {"update_one", "update_many", "delete_one", "delete_many"}:
            return []

        if not isinstance(filter_query, dict):
            return []

        projection = {"_id": 0, "session_id": 1}
        if operation in {"update_one", "delete_one"}:
            try:
                existing_result = self.db.count_lines.find_one(filter_query, projection, **kwargs)
            except TypeError:
                existing_result = self.db.count_lines.find_one(filter_query, **kwargs)
            existing = await self._resolve_awaitable(existing_result)
            if existing and existing.get("session_id"):
                session_ids.add(str(existing["session_id"]))
            return sorted(session_ids)

        try:
            cursor = self.db.count_lines.find(filter_query, projection, **kwargs)
        except TypeError:
            cursor = self.db.count_lines.find(filter_query, **kwargs)
        matched_result = cursor.to_list(length=5000)
        matched = await self._resolve_awaitable(matched_result)
        for doc in matched:
            if isinstance(doc, dict) and doc.get("session_id"):
                session_ids.add(str(doc["session_id"]))
        return sorted(session_ids)

    async def _enforce_variance_for_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> None:
        operation = str(payload.get("operation") or "").strip().lower()

        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict) or "counted_qty" not in document:
                return
            governance, erp_item, session = await self._evaluate_governance_for_document(
                document, context
            )
            self._apply_authoritative_fields(document, governance, erp_item, session, context)
            return

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return
            set_doc = update_doc.get("$set")
            if not isinstance(set_doc, dict) or "counted_qty" not in set_doc:
                return

            filter_query = payload.get("filter") or {}
            db_session = self._extract_db_session(context)
            kwargs = {"session": db_session} if db_session is not None else {}
            existing = await self._resolve_awaitable(
                self.db.count_lines.find_one(filter_query, **kwargs)
            )
            merged = dict(existing or {})
            merged.update(set_doc)
            if not merged:
                return
            governance, erp_item, session = await self._evaluate_governance_for_document(
                merged, context
            )
            self._copy_authoritative_baseline_fields(source=merged, target=set_doc)
            self._apply_authoritative_fields(set_doc, governance, erp_item, session, context)
            return

        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.

    async def _evaluate_governance_for_document(
        self,
        document: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[CountLineGovernanceDecision, dict[str, Any], Optional[dict[str, Any]]]:
        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}
        item_code = str(document.get("item_code") or context.get("item_code") or "").strip()
        if not item_code:
            raise HTTPException(status_code=409, detail="Count line is missing item_code")

        counted_qty = float(document.get("counted_qty") or 0.0)
        expected_qty = float(document.get("erp_qty") or 0.0)
        session_id = str(document.get("session_id") or context.get("session_id") or "").strip()

        erp_item = context.get("erp_item")
        if not isinstance(erp_item, dict):
            erp_item = None
        if erp_item is None:
            barcode = str(document.get("barcode") or "").strip()
            if barcode:
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one({"barcode": barcode}, **kwargs)
                )
            if erp_item is None:
                erp_item = await self._resolve_awaitable(
                    self.db.erp_items.find_one({"item_code": item_code}, **kwargs)
                )
            erp_item = erp_item or {}

        if session_id:
            baseline_qty, baseline_hash = await self.resolve_baseline(
                session_id=session_id,
                item_code=item_code,
                username=str(context.get("username") or "system"),
                erp_item=erp_item,
                db_session=db_session,
            )
            expected_qty = baseline_qty
            document["erp_qty"] = baseline_qty
            document["baseline_hash"] = baseline_hash
        elif expected_qty == 0.0:
            expected_qty = float((erp_item or {}).get("stock_qty") or 0.0)
            document.setdefault("erp_qty", expected_qty)

        governance = await self.evaluate_policy(
            item_code=item_code,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            item=erp_item,
            location=context.get("location") or document.get("floor_no"),
            variance_reason=context.get("variance_reason") or document.get("variance_reason"),
            correction_reason=(
                context.get("correction_reason") if "correction_reason" in context else document.get("correction_reason")
            ),
            require_correction_reason_for_variance=bool(
                context.get("require_correction_reason_for_variance", False)
            ),
        )
        session = await self._resolve_session_document(document, context)
        return governance, erp_item, session

    async def _resolve_session_document(
        self,
        document: dict[str, Any],
        context: dict[str, Any],
    ) -> Optional[dict[str, Any]]:
        explicit_session = context.get("session")
        if isinstance(explicit_session, dict):
            return explicit_session

        session_id = str(document.get("session_id") or context.get("session_id") or "").strip()
        if not session_id:
            return None

        db_session = self._extract_db_session(context)
        kwargs = {"session": db_session} if db_session is not None else {}
        return await self._resolve_awaitable(
            self.db.sessions.find_one(
                {"$or": [{"id": session_id}, {"session_id": session_id}]},
                **kwargs,
            )
        )

    def _copy_authoritative_baseline_fields(
        self,
        *,
        source: dict[str, Any],
        target: dict[str, Any],
    ) -> None:
        for field in ("erp_qty", "baseline_hash"):
            if field in source and field not in target:
                target[field] = source[field]

    def _collect_risk_flags(
        self,
        *,
        document: dict[str, Any],
        erp_item: dict[str, Any],
        governance: CountLineGovernanceDecision,
        session: Optional[dict[str, Any]],
        counted_qty: float,
        expected_qty: float,
        mrp_erp: float,
        mrp_counted: float,
    ) -> list[str]:
        risk_flags: list[str] = []
        variance = governance.variance
        if expected_qty > 0:
            variance_percent = abs(variance) / expected_qty * 100
        elif counted_qty == 0:
            variance_percent = 0.0
        else:
            variance_percent = 100.0

        mrp_change_percent = ((mrp_counted - mrp_erp) / mrp_erp * 100) if mrp_erp > 0 else 0.0
        correction_reason = document.get("correction_reason")
        variance_reason = document.get("variance_reason")
        serial_numbers = document.get("serial_numbers") or []
        photo_proofs = document.get("photo_proofs") or []

        if abs(variance) > 100 or variance_percent > 50:
            risk_flags.append("LARGE_VARIANCE")
        if mrp_change_percent < -20:
            risk_flags.append("MRP_REDUCED_SIGNIFICANTLY")
        if mrp_erp > 10000 and variance_percent > 5:
            risk_flags.append("HIGH_VALUE_VARIANCE")
        if mrp_erp > 5000 and not serial_numbers:
            risk_flags.append("SERIAL_MISSING_HIGH_VALUE")
        if abs(variance) > 0 and not correction_reason and not variance_reason:
            risk_flags.append("MISSING_CORRECTION_REASON")
        if abs(mrp_change_percent) > 5 and not correction_reason and not variance_reason:
            risk_flags.append("MRP_CHANGE_WITHOUT_REASON")

        photo_required = (
            abs(variance) > 100
            or variance_percent > 50
            or abs(mrp_change_percent) > 20
            or mrp_erp > 10000
        )
        if photo_required and not document.get("photo_base64") and not photo_proofs:
            risk_flags.append("PHOTO_PROOF_REQUIRED")

        expected_floor = str(
            erp_item.get("floor")
            or erp_item.get("floor_no")
            or (erp_item.get("source_data") or {}).get("floor")
            or (erp_item.get("source_data") or {}).get("floor_no")
            or ""
        ).strip().upper()
        expected_rack = str(
            erp_item.get("rack")
            or erp_item.get("rack_no")
            or (erp_item.get("source_data") or {}).get("rack")
            or (erp_item.get("source_data") or {}).get("rack_no")
            or ""
        ).strip().upper()
        found_floor = str(document.get("floor_no") or "").strip().upper()
        found_rack = str(document.get("rack_no") or "").strip().upper()
        floor_mismatch = found_floor and expected_floor and found_floor != expected_floor
        rack_mismatch = found_rack and expected_rack and found_rack != expected_rack
        if floor_mismatch or rack_mismatch:
            risk_flags.append("MISPLACED_ITEM")
            document["is_misplaced"] = True
            document["expected_location"] = f"{expected_floor}/{expected_rack}"
            document["found_location"] = f"{found_floor}/{found_rack}"
            document["relocation_status"] = document.get("relocation_status") or "PENDING"
        else:
            document["is_misplaced"] = bool(document.get("is_misplaced", False))

        if str((session or {}).get("type") or "").upper() == "STRICT" and abs(variance) > 0:
            risk_flags.append("STRICT_MODE_VARIANCE")

        return sorted(set(risk_flags))

    def _apply_review_reset_fields(self, target: dict[str, Any]) -> None:
        target["assigned_to"] = None
        target["recount_requested_at"] = None
        target["recount_requested_by"] = None
        target["rejected_at"] = None
        target["rejected_by"] = None
        target["rejection_reason"] = None
        target["verified"] = False
        target["verified_at"] = None
        target["verified_by"] = None
        if "approval_note" in target or target.get("approval_note") is not None:
            target["approval_note"] = None

    def _apply_authoritative_fields(
        self,
        target: dict[str, Any],
        governance: CountLineGovernanceDecision,
        erp_item: dict[str, Any],
        session: Optional[dict[str, Any]],
        context: dict[str, Any],
    ) -> None:
        counted_qty = _as_float(target.get("counted_qty"))
        expected_qty = _as_float(target.get("erp_qty"))
        mrp_erp = _as_float(
            target.get("mrp_erp")
            or erp_item.get("mrp")
            or erp_item.get("sale_price")
            or erp_item.get("sales_price")
        )
        mrp_counted = _as_float(
            target.get("mrp_counted")
            or target.get("counted_mrp")
            or target.get("mrp")
            or mrp_erp
        )
        target["item_name"] = target.get("item_name") or erp_item.get("item_name") or "Unknown"
        if not target.get("barcode") and erp_item.get("barcode"):
            target["barcode"] = erp_item.get("barcode")
        current_sql_qty = _as_float(erp_item.get("stock_qty"), default=expected_qty)
        target["current_sql_qty"] = current_sql_qty
        target["erp_drift"] = current_sql_qty - expected_qty
        target["final_gap"] = counted_qty - current_sql_qty
        target["mrp_erp"] = mrp_erp
        target["mrp_counted"] = mrp_counted
        target["financial_impact"] = (mrp_counted * counted_qty) - (mrp_erp * expected_qty)
        target["risk_flags"] = self._collect_risk_flags(
            document=target,
            erp_item=erp_item,
            governance=governance,
            session=session,
            counted_qty=counted_qty,
            expected_qty=expected_qty,
            mrp_erp=mrp_erp,
            mrp_counted=mrp_counted,
        )
        set_status = bool(context.get("set_status_from_governance", True))
        self._apply_review_reset_fields(target)
        target["variance"] = governance.variance
        target["approval_status"] = governance.approval_status
        target["approved_at"] = governance.approved_at
        target["approved_by"] = governance.approved_by
        target["requires_supervisor_approval"] = governance.requires_supervisor_approval
        target["variance_data"] = governance.variance_data
        target["violated_thresholds"] = governance.violated_thresholds
        if set_status:
            target["status"] = governance.status
