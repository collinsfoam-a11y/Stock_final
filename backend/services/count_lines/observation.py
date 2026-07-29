from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import inspect
import json
import logging
import uuid
from typing import Any, Optional

from bson import ObjectId
from fastapi import HTTPException

from backend.services.concurrency import ConcurrencyError, coerce_version
from backend.services.governance_audit_service import GovernanceAuditService
from backend.services.governance_guard import (
    GovernanceViolation,
    assert_valid_write,
    write_authority,
)
from backend.services.projection_write_service import ProjectionWriteService
from backend.services.session_lifecycle_service import SessionLifecycleService
from backend.services.snapshot_service import SnapshotService
from backend.services.validation_service import ValidationService
from backend.services.variance_service import VarianceService

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


class CountLineObservationMixin:
    """Authoritative write-side governance for count-line mutations."""


















    @staticmethod
    def _build_count_observation_semantic_hash(document: dict[str, Any]) -> str:
        payload = {
            "session_id": str(document.get("session_id") or ""),
            "item_code": str(document.get("item_code") or document.get("item_id") or ""),
            "qty": float(document.get("quantity_observation", {}).get("quantity") or 0.0),
            "version": int(document.get("version", 1) or 1),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    async def write_count_observation(
        self,
        document: dict[str, Any],
        context: Optional[dict[str, Any]] = None,
        *,
        db_session: Optional[Any] = None,
    ) -> Any:
        ctx = context or {}
        db_session = db_session or self._extract_db_session(ctx)
        kwargs = {"session": db_session} if db_session is not None else {}

        now = _utc_now()
        document.setdefault("id", str(uuid.uuid4()))
        document.setdefault("version", 1)
        document.setdefault("status", "draft")
        document.setdefault("quantity_observation", {})
        quantity_obs = document.get("quantity_observation") or {}
        if not quantity_obs.get("observed_at") and not document.get("submitted_at"):
            quantity_obs["observed_at"] = now
            document["quantity_observation"] = quantity_obs

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
                self.db.count_observation.find_one(previous_filter, **kwargs)
            )
            if not isinstance(previous_doc, dict):
                raise GovernanceViolation(
                    "CRITICAL: previous_version_id references missing count observation"
                )
            incoming_version = int(document.get("version", 0) or 0)
            expected_version = int(previous_doc.get("version", 1) or 1) + 1
            if incoming_version != expected_version:
                raise GovernanceViolation(
                    "CRITICAL: Invalid version progression for recount observation"
                )
            document["version"] = expected_version
            document.setdefault("parent_observation_id", str(previous_doc.get("id")))
            lineage = list(previous_doc.get("lineage") or [])
            lineage.append(str(previous_doc.get("id")))
            document["lineage"] = lineage
        else:
            document.setdefault("lineage", [document.get("id")])

        semantic_hash = self._build_count_observation_semantic_hash(document)
        document["semantic_hash"] = semantic_hash
        existing_semantic = await self._resolve_awaitable(
            self.db.count_observation.find_one({"semantic_hash": semantic_hash}, **kwargs)
        )
        if isinstance(existing_semantic, dict):
            raise GovernanceViolation(
                "CRITICAL: Duplicate semantic hash for count observation"
            )

        idempotency_key = document.get("idempotency_key")
        if idempotency_key:
            existing_idempotency = await self._resolve_awaitable(
                self.db.count_observation.find_one({"idempotency_key": idempotency_key}, **kwargs)
            )
            if isinstance(existing_idempotency, dict):
                raise GovernanceViolation(
                    "CRITICAL: Duplicate idempotency_key for count observation"
                )

        result = await self._execute_authorized_write(
            lambda: self.db.count_observation.insert_one(document, **kwargs)
        )
        document["_id"] = result.inserted_id
        session_id = str(document.get("session_id") or ctx.get("session_id") or "")
        if session_id:
            count_line_doc = self._build_count_line_projection(document)
            await self._execute_authorized_write(
                lambda: self.db.count_lines.insert_one(count_line_doc, **kwargs)
            )
        return result.inserted_id














        # update_many/delete mutations intentionally skip variance stamping;
        # callers should use update_one-per-line when quantity is being changed in bulk.






