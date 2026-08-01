from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.services.governance_guard import (
    GovernanceViolation,
    assert_valid_write,
)

logger = logging.getLogger(__name__)


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
    """Fingerprint the logical identity of a count line.

    Two writes that hash the same are treated as the same logical count and the
    second is rejected. The fingerprint therefore has to carry every dimension a
    counter can legitimately vary while counting the same item in the same
    session: the physical location (a SKU counted on two racks is two counts) and
    the batch/variant barcode (two batches of one SKU are two counts). Omitting
    either collapses distinct physical counts into a false duplicate.
    """
    payload = {
        "session_id": str(document.get("session_id") or ""),
        "item_id": str(document.get("item_code") or document.get("item_id") or ""),
        "location_id": str(document.get("location_id") or ""),
        "floor_no": str(document.get("floor_no") or document.get("floor_id") or ""),
        "rack_no": str(document.get("rack_no") or document.get("rack_id") or ""),
        "barcode": str(document.get("barcode") or ""),
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


class CountLineValidationMixin(CountLineServiceBase):
    """Authoritative write-side governance for count-line mutations."""





















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
                    document["_id"] = resolved_result.inserted_id
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
                    set_doc = (
                        update_doc.setdefault("$set", {}) if isinstance(update_doc, dict) else {}
                    )
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



        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.






