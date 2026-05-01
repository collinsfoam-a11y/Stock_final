"""
Runtime and background validation service for governance invariants.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.governance_guard import GovernanceViolation

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", ""}:
        return False
    return default


class ValidationService:
    """
    Validates count-lines and sessions for mandatory invariants.
    """

    def __init__(
        self,
        db: Any,
        *,
        strict_mode: Optional[bool] = None,
        write_logs: bool = True,
    ) -> None:
        self.db = db
        self.strict_mode = (
            _as_bool(os.getenv("STRICT_VALIDATION"), default=False)
            if strict_mode is None
            else bool(strict_mode)
        )
        self.write_logs = bool(write_logs)

    def _validation_logs_collection(self) -> Any:
        collection = getattr(self.db, "validation_logs", None)
        if collection is not None:
            return collection
        try:
            return self.db["validation_logs"]
        except (KeyError, TypeError, AttributeError) as exc:
            logger.debug("validation_logs collection unavailable: %s", exc)
            return None
        except (RuntimeError, TypeError, ValueError, OSError) as exc:
            logger.error("Failed to resolve validation_logs collection: %s", exc)
            raise

    async def validate_count_line(
        self,
        doc: Optional[dict[str, Any]],
        *,
        raise_on_error: Optional[bool] = None,
    ) -> list[str]:
        if not isinstance(doc, dict):
            return []

        errors: list[str] = []

        if not doc.get("session_id"):
            errors.append("Missing session_id")
        if not doc.get("location_id"):
            errors.append("Missing location_id")
        if not doc.get("floor_id"):
            errors.append("Missing floor_id")
        if not doc.get("rack_id"):
            errors.append("Missing rack_id")

        status = str(doc.get("status") or "").strip().upper()
        if status == "FINALIZED" and bool(doc.get("mutable", False)):
            errors.append("Finalized line is mutable")

        await self._handle_errors(
            entity="count_line",
            doc=doc,
            errors=errors,
            raise_on_error=raise_on_error,
        )
        return errors

    async def validate_session(
        self,
        session: Optional[dict[str, Any]],
        *,
        raise_on_error: Optional[bool] = None,
    ) -> list[str]:
        if not isinstance(session, dict):
            return []

        errors: list[str] = []

        if not session.get("session_id"):
            errors.append("Missing session_id")

        status = str(session.get("status") or "").strip().upper()
        if status == "FINALIZED" and not session.get("finalized_at"):
            errors.append("Finalized session missing timestamp")

        await self._handle_errors(
            entity="session",
            doc=session,
            errors=errors,
            raise_on_error=raise_on_error,
        )
        return errors

    async def log_violation(self, entity: str, doc: dict[str, Any], errors: list[str]) -> None:
        if not self.write_logs:
            return

        collection = self._validation_logs_collection()
        if collection is None:
            return

        await collection.insert_one(
            {
                "entity": entity,
                "doc_id": str(doc.get("_id") or ""),
                "session_id": str(doc.get("session_id") or ""),
                "errors": list(errors),
                "timestamp": _utc_now(),
            }
        )

    async def check_duplicates(self) -> list[dict[str, Any]]:
        pipeline = [
            {
                "$group": {
                    "_id": {
                        "session_id": "$session_id",
                        "item_code": "$item_code",
                        "rack_id": "$rack_id",
                        "version": "$version",
                    },
                    "count": {"$sum": 1},
                }
            },
            {"$match": {"count": {"$gt": 1}}},
        ]
        cursor = self.db.count_lines.aggregate(pipeline)
        return [doc async for doc in cursor]

    async def count_missing_context(self) -> int:
        return int(
            await self.db.count_lines.count_documents(
                {
                    "$or": [
                        {"location_id": {"$exists": False}},
                        {"floor_id": {"$exists": False}},
                        {"rack_id": {"$exists": False}},
                        {"location_id": None},
                        {"floor_id": None},
                        {"rack_id": None},
                    ]
                }
            )
        )

    async def check_finalization_violations(
        self,
        session_id: Optional[str] = None,
        *,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"status": {"$ne": "LOCKED"}}
        if session_id:
            query["session_id"] = session_id
        projection = {
            "_id": 1,
            "id": 1,
            "session_id": 1,
            "status": 1,
            "approval_status": 1,
            "verified": 1,
            "finalized_at": 1,
            "updated_at": 1,
        }
        bounded_limit = max(1, int(limit))
        cursor = self.db.count_lines.find(query, projection=projection).limit(bounded_limit)
        return [doc async for doc in cursor]

    async def run_integrity_report(self) -> dict[str, Any]:
        duplicates = await self.check_duplicates()
        missing_context = await self.count_missing_context()
        return {
            "timestamp": _utc_now().isoformat(),
            "duplicates_count": len(duplicates),
            "missing_context_count": missing_context,
            "strict_validation": self.strict_mode,
        }

    async def _handle_errors(
        self,
        *,
        entity: str,
        doc: dict[str, Any],
        errors: list[str],
        raise_on_error: Optional[bool],
    ) -> None:
        if not errors:
            return

        await self.log_violation(entity, doc, errors)

        should_raise = self.strict_mode if raise_on_error is None else bool(raise_on_error)
        if should_raise:
            raise GovernanceViolation(f"Validation failed for {entity}: {'; '.join(errors)}")
