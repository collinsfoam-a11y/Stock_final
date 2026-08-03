from __future__ import annotations

import hashlib
import inspect
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.core.uow import MongoUnitOfWork
from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import (
    GovernanceViolation,
    write_authority,
)
from backend.services.projection_write_service import ProjectionWriteService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.snapshot_service import SnapshotService
from backend.services.validation_service import ValidationService
from backend.services.variance_service import VarianceService
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_reason(value: Any) -> str | None:
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
    return bool(line.get("superseded_at"))


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
        for field_name in unset_doc:
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


from backend.services.count_lines.governance import CountLineGovernanceDecision


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


from backend.services.count_lines.base import CountLineServiceBase


class CountLineWriteCoreMixin(CountLineServiceBase):
    """Authoritative write-side governance for count-line mutations."""

    def __init__(
        self,
        db: Any,
        *,
        snapshot_service: SnapshotService | None = None,
        variance_service: VarianceService | None = None,
        validation_service: ValidationService | None = None,
        lifecycle_service: SessionLifecycleService | None = None,
        audit_service: GovernanceAuditService | None = None,
        projection_service: ProjectionWriteService | None = None,
    ) -> None:
        self.db = db
        self.snapshot_service = snapshot_service or SnapshotService(db)
        self.variance_service = variance_service or VarianceService(db)
        self.validation_service = validation_service or ValidationService(db)
        self.lifecycle_service = lifecycle_service or SessionLifecycleService(db)
        self.audit_service = audit_service or GovernanceAuditService(db)
        self.projection_service = projection_service or ProjectionWriteService(db)
        self._session_snapshot_cache: dict[str, dict[str, Any] | None] = {}
        self._session_snapshot_item_index: dict[str, dict[str, float]] = {}

    async def _resolve_awaitable(self, value: Any) -> Any:
        resolved = value
        for i in range(10):
            if not inspect.isawaitable(resolved):
                if i > 1:
                    logger.warning(
                        "CountLineWriteService._resolve_awaitable took %s iterations to resolve", i
                    )
                return resolved
            resolved = await resolved
        logger.warning(
            "CountLineWriteService._resolve_awaitable hit iteration limit (10) for %s",
            type(value).__name__,
        )
        return resolved

    async def _execute_authorized_write(self, write_call: Any) -> Any:
        with write_authority("CountLineWriteService"):
            result = write_call()
            return await self._resolve_awaitable(result)

    @staticmethod
    def _should_run_runtime_validation(context: dict[str, Any]) -> bool:
        if "skip_runtime_validation" in context:
            raise GovernanceViolation(
                "CRITICAL: skip_runtime_validation has been removed. Use validation_mode."
            )

        validation_mode = (
            str(context.get("validation_mode") or DEFAULT_VALIDATION_MODE).strip().lower()
        )
        if validation_mode not in VALIDATION_MODES:
            raise GovernanceViolation(f"CRITICAL: Unsupported validation_mode '{validation_mode}'")
        if validation_mode == "repair_skip":
            governance_mode = str(context.get("governance_mode") or "").strip().lower()
            if governance_mode != "repair":
                raise GovernanceViolation(
                    "CRITICAL: validation_mode='repair_skip' requires governance_mode='repair'"
                )
            return False
        return True

    async def _log_count_line_audit(
        self,
        *,
        payload: dict[str, Any],
        context: dict[str, Any],
        session_ids: list[str],
        db_session: Any | None,
    ) -> None:
        operation = str(payload.get("operation") or "").strip().lower()
        raw_document = payload.get("document")
        document: dict[str, Any] = raw_document if isinstance(raw_document, dict) else {}
        # FIX GROUP 5: Build full actor attribution from context.
        actor_username = str(context.get("username") or context.get("actor") or "system")
        actor: dict[str, Any] = {
            "user_id": str(context.get("user_id") or actor_username),
            "username": actor_username,
            "role": str(context.get("role") or ""),
            "org_id": str(context.get("org_id") or ""),
        }
        audit_operation = "COUNT"
        if operation == "insert_one" and document.get("previous_version_id"):
            audit_operation = "RECOUNT"

        item_id = str(document.get("item_code") or document.get("item_id") or "")
        location_id = str(document.get("location_id") or "")
        idempotency_key = document.get("idempotency_key")
        semantic_hash = document.get("semantic_hash")
        version = int(document.get("version", 1) or 1)

        for session_id in session_ids:
            await self.audit_service.log_governance_event(
                event="COUNT_LINE_WRITE",
                operation=audit_operation,
                session_id=session_id,
                actor=actor,
                item_id=item_id or None,
                location_id=location_id or None,
                version=version,
                idempotency_key=str(idempotency_key) if idempotency_key else None,
                semantic_hash=str(semantic_hash) if semantic_hash else None,
                db_session=db_session,
            )

    async def _execute_count_line_operation(
        self,
        *,
        payload: dict[str, Any],
        context: dict[str, Any],
        db_session: Any | None,
    ) -> Any:
        operation = str(payload.get("operation") or "").strip().lower()

        # Phase 6: Instantiate Repository dynamically for the request
        from backend.repositories.count_lines import CountLineRepository

        class _RequestUoW:
            def __init__(self, client, session):
                self.client = client
                self.session = session

        # M11 fix: If self.db is a Mock, pass it directly so repository.collection resolves to mock_db.count_lines
        client_to_pass = self.db if "Mock" in type(self.db).__name__ else self.db.client
        request_uow = _RequestUoW(client_to_pass, db_session)
        repository = CountLineRepository(request_uow)  # type: ignore[arg-type]
        collection = repository.collection

        kwargs = {"session": db_session} if db_session is not None else {}

        if operation == "insert_one":
            document = payload.get("document")
            if not isinstance(document, dict):
                raise ValueError("insert_one payload requires a 'document' dictionary")
            # Use repository.save instead of collection.insert_one
            return await self._execute_authorized_write(lambda: repository.save(document))

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
                            lambda: collection.update_one(
                                filter_query, update_doc, upsert, **kwargs
                            )
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

        if operation == "find_one_and_update":
            filter_query = payload.get("filter")
            update_doc = payload.get("update")
            if not isinstance(filter_query, dict) or not isinstance(update_doc, dict):
                raise ValueError(
                    "find_one_and_update payload requires 'filter' and 'update' dictionaries"
                )
            upsert = bool(payload.get("upsert", False))
            return_document = payload.get("return_document", False)
            try:
                from pymongo import ReturnDocument

                ret_doc = ReturnDocument.AFTER if return_document else ReturnDocument.BEFORE
            except ImportError:
                ret_doc = bool(return_document)

            return await self._execute_authorized_write(
                lambda: collection.find_one_and_update(
                    filter_query, update_doc, upsert=upsert, return_document=ret_doc, **kwargs
                )
            )
        if operation == "bulk_write":
            requests_list = payload.get("requests")
            if not isinstance(requests_list, list):
                raise ValueError("bulk_write payload requires 'requests' list")
            return await self._execute_authorized_write(
                lambda: collection.bulk_write(requests_list, **kwargs)
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
        db_session: Any | None,
    ) -> Any:
        operation = str(payload.get("operation") or "").strip().lower()
        if operation not in {
            "insert_one",
            "update_one",
            "update_many",
            "find_one_and_update",
            "delete_one",
            "delete_many",
        }:
            raise ValueError(f"Unsupported count-line write operation: {operation}")

        ctx = dict(context)
        ctx["db_session"] = db_session

        await self._assert_snapshot_integrity_for_write(payload, ctx)  # type: ignore[attr-defined]
        await self._assert_mandatory_write_invariants(payload, ctx)  # type: ignore[attr-defined]
        self._apply_state_transition_for_write(payload, ctx)  # type: ignore[attr-defined]
        if self._should_apply_governance(payload, ctx):  # type: ignore[attr-defined]
            await self._enforce_variance_for_write(payload, ctx)  # type: ignore[attr-defined]

        session_ids = await self._collect_session_ids_for_write(payload, ctx)  # type: ignore[attr-defined]
        expected_versions = await self._capture_session_versions(  # type: ignore[attr-defined]
            session_ids,
            context=ctx,
            db_session=db_session,
        )

        resolved = await self._execute_count_line_operation(
            payload=payload,
            context=ctx,
            db_session=db_session,
        )
        await self._run_post_write_validation(  # type: ignore[attr-defined]
            operation=operation,
            payload=payload,
            context=ctx,
            resolved_result=resolved,
        )

        if not bool(ctx.get("skip_session_totals_update", False)):
            await self._update_session_totals_for_sessions(  # type: ignore[attr-defined]
                session_ids=session_ids,
                context=ctx,
                db_session=db_session,
                expected_versions=expected_versions,
            )

        if session_ids and not bool(ctx.get("skip_projection_sync", False)):
            await self.projection_service.sync_for_sessions(
                session_ids,
                trigger=f"count_line.{operation}",
                actor=str(ctx.get("username") or ctx.get("actor") or "system"),
                db_session=db_session,
                rebuild_item_projections=not bool(ctx.get("skip_projection_items_sync", False)),
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
        context: dict[str, Any] | None = None,
    ) -> Any:
        if not isinstance(payload, dict):
            raise ValueError("payload must be a dictionary")

        ctx = context or {}
        if "skip_transaction" in ctx:
            raise GovernanceViolation(
                "CRITICAL: skip_transaction bypass has been removed from CountLineWriteService"
            )
        external_session = self._extract_db_session(ctx)  # type: ignore[attr-defined]
        if external_session is not None:
            return await self._process_write_core(payload, ctx, db_session=external_session)

        async with MongoUnitOfWork(self.db.client) as uow:
            tx_context = dict(ctx)
            tx_context["db_session"] = uow.session
            result = await self._process_write_core(payload, tx_context, db_session=uow.session)
            await uow.commit()
            return result

    async def process_write(
        self,
        payload: dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> Any:
        return await self.commit(payload, context)

    def _build_count_line_projection(self, document: dict[str, Any]) -> dict[str, Any]:
        quantity_obs = document.get("quantity_observation") or {}
        now = _utc_now()
        return {
            "id": document.get("id"),
            "session_id": document.get("session_id"),
            "item_code": document.get("item_code"),
            "item_name": document.get("item_name"),
            "counted_qty": quantity_obs.get("quantity", 0.0),
            "floor_id": document.get("floor_id"),
            "rack_id": document.get("rack_id"),
            "floor_no": document.get("floor_no"),
            "rack_no": document.get("rack_no"),
            "barcode": document.get("barcode"),
            "batches": document.get("batches"),
            "remark": document.get("remark") or quantity_obs.get("remark"),
            "counted_at": quantity_obs.get("observed_at") or now,
            "variance_reason": document.get("variance_reason"),
            "variance_note": document.get("variance_note"),
            "version": document.get("version", 1),
            "previous_version_id": document.get("previous_version_id"),
            "status": "draft",
            "verified": False,
            "approval_status": None,
            "created_at": now,
            "updated_at": now,
        }

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

        actor = (
            str(
                context.get("username")
                or context.get("user_id")
                or context.get("actor")
                or "system"
            ).strip()
            or "system"
        )
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

    async def resolve_baseline(
        self,
        *,
        session_id: str,
        item_code: str,
        username: str,
        erp_item: dict[str, Any] | None = None,
        db_session: Any | None = None,
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
            governance, erp_item, session = await self._evaluate_governance_for_document(  # type: ignore[attr-defined]
                document, context
            )
            self._apply_authoritative_fields(document, governance, erp_item, session, context)  # type: ignore[attr-defined]
            return

        if operation == "update_one":
            update_doc = payload.get("update")
            if not isinstance(update_doc, dict):
                return
            set_doc = update_doc.get("$set")
            if not isinstance(set_doc, dict) or "counted_qty" not in set_doc:
                return

            filter_query = payload.get("filter") or {}
            db_session = self._extract_db_session(context)  # type: ignore[attr-defined]
            kwargs = {"session": db_session} if db_session is not None else {}
            existing = await self._resolve_awaitable(  # type: ignore[attr-defined]
                self.db.count_lines.find_one(filter_query, **kwargs)
            )
            merged = dict(existing or {})
            merged.update(set_doc)
            if not merged:
                return
            governance, erp_item, session = await self._evaluate_governance_for_document(  # type: ignore[attr-defined]
                merged, context
            )
            self._copy_authoritative_baseline_fields(source=merged, target=set_doc)  # type: ignore[attr-defined]
            self._apply_authoritative_fields(set_doc, governance, erp_item, session, context)  # type: ignore[attr-defined]
            return

        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.

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
        session: dict[str, Any] | None,
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

        expected_floor = (
            str(
                erp_item.get("floor")
                or erp_item.get("floor_no")
                or (erp_item.get("source_data") or {}).get("floor")
                or (erp_item.get("source_data") or {}).get("floor_no")
                or ""
            )
            .strip()
            .upper()
        )
        expected_rack = (
            str(
                erp_item.get("rack")
                or erp_item.get("rack_no")
                or (erp_item.get("source_data") or {}).get("rack")
                or (erp_item.get("source_data") or {}).get("rack_no")
                or ""
            )
            .strip()
            .upper()
        )
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
        session: dict[str, Any] | None,
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
            target.get("mrp_counted") or target.get("counted_mrp") or target.get("mrp") or mrp_erp
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
