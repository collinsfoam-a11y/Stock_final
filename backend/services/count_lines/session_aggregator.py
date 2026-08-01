from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import logging
from typing import Any, Optional


from backend.services.concurrency import ConcurrencyError, coerce_version
from backend.services.governance_guard import (
    GovernanceViolation,
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


class CountLineSessionAggregatorMixin(CountLineServiceBase):
    """Authoritative write-side governance for count-line mutations."""




    async def finalize_session_count_lines(
        self,
        *,
        session_id: str,
        actor: str,
        finalized_at: datetime,
        note: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> int:
        """Lock and approve mutable count lines for a finalized session."""
        line_update: dict[str, Any] = {
            "status": "locked",
            "approval_status": "APPROVED",
            "verified": True,
            "verified_by": actor,
            "verified_at": finalized_at,
            "approved_by": actor,
            "approved_at": finalized_at,
            "finalized_by": actor,
            "finalized_at": finalized_at,
            "updated_at": finalized_at,
            "updated_by": actor,
        }
        if note:
            line_update["finalization_note"] = note

        count_line_filter = {
            "session_id": session_id,
            "status": {"$nin": ["locked", "SUPERSEDED", "superseded"]},
            "approval_status": {"$nin": ["REJECTED", "NEEDS_REVIEW"]},
        }
        kwargs = {"session": db_session} if db_session is not None else {}
        result = await self._execute_authorized_write(
            lambda: self.db.count_lines.update_many(
                count_line_filter,
                {"$set": line_update},
                **kwargs,
            )
        )
        return int(getattr(result, "modified_count", 0) or 0)

    async def archive_orphan_session_lines(
        self,
        *,
        session_ids: list[str],
        archive_marker: dict[str, Any],
    ) -> Any:
        """
        One-time reconciliation hook for historical count lines that have no
        parent session. This deliberately does not create or edit business
        counts; it only removes invalid orphan rows from active reporting scope.
        """
        normalized_session_ids = sorted(
            {str(session_id).strip() for session_id in session_ids if str(session_id).strip()}
        )
        if not normalized_session_ids:
            return None
        return await self._execute_authorized_write(
            lambda: self.db.count_lines.update_many(
                {"session_id": {"$in": normalized_session_ids}, "archived": {"$ne": True}},
                {"$set": archive_marker},
            )
        )



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
                sync_projection=False,
            )



















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
        if operation not in {"update_one", "update_many", "find_one_and_update", "bulk_write", "delete_one", "delete_many"}:
            return []

        if not isinstance(filter_query, dict):
            return []

        projection = {"_id": 0, "session_id": 1}
        if operation in {"update_one", "find_one_and_update", "delete_one"}:
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


        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.


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




