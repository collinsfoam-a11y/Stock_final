from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.canonical_inventory import is_superseded_count_line
from backend.services.event_service import FLAG_PROJECTION_READS
from backend.services.observability import metrics

logger = logging.getLogger(__name__)

PROJECTION_SAFE_ENDPOINTS = frozenset(
    {
        "scan-status",
        "count-lines/check",
    }
)
PROJECTION_FALLBACK_COUNTER = "projection_fallback_count"
PROJECTION_READ_HIT_COUNTER = "projection_read_hit_count"
PROJECTION_FALLBACK_ALERT_COUNTER = "projection_fallback_alert_count"
DEFAULT_FALLBACK_ALERT_THRESHOLD = 25
FLAG_PROJECTION_STRICT_MODE = "V3_PROJECTION_STRICT_MODE"


def _as_bool(value: Any, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on", "enabled"}:
        return True
    if normalized in {"0", "false", "no", "n", "off", "disabled"}:
        return False
    return default


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_batch_totals(document: Optional[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    if not isinstance(document, dict):
        return {}

    batches = document.get("batches")
    normalized: dict[str, dict[str, Any]] = {}
    if isinstance(batches, list) and batches:
        for entry in batches:
            if not isinstance(entry, dict):
                continue
            batch_id = _normalize_string(entry.get("batch_id") or entry.get("batch_no"))
            if not batch_id:
                continue
            state = normalized.setdefault(
                batch_id,
                {
                    "batch_id": batch_id,
                    "batch_no": entry.get("batch_no") or batch_id,
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                },
            )
            state["counted_qty"] += _as_float(
                entry.get("counted_qty") or entry.get("quantity") or entry.get("qty")
            )
            state["damaged_qty"] += _as_float(entry.get("damaged_qty"))
        if normalized:
            return normalized

    batch_id = _normalize_string(document.get("batch_id")) or "NO_BATCH"
    return {
        batch_id: {
            "batch_id": batch_id,
            "batch_no": document.get("batch_no") or batch_id,
            "counted_qty": _as_float(document.get("counted_qty")),
            "damaged_qty": _as_float(document.get("damaged_qty")),
        }
    }


class ProjectionReadError(RuntimeError):
    """Raised when projection-authoritative reads cannot be satisfied."""

    def __init__(
        self,
        *,
        endpoint: str,
        session_id: str,
        item_code: str,
        reason: str,
    ) -> None:
        self.endpoint = endpoint
        self.session_id = session_id
        self.item_code = item_code
        self.reason = reason
        super().__init__(
            "Projection state unavailable for authoritative read "
            f"(endpoint={endpoint}, session_id={session_id}, item_code={item_code}, reason={reason})"
        )


class InventoryReadRouter:
    """Feature-flagged router for legacy vs projection-backed read paths."""

    def __init__(self, db: Any) -> None:
        self.db = db

    @staticmethod
    def _safe_endpoint_name(endpoint: Optional[str], *, default: str) -> str:
        normalized = _normalize_string(endpoint)
        return normalized or default

    @staticmethod
    def _fallback_alert_threshold() -> int:
        raw_value = os.getenv(
            "V3_PROJECTION_FALLBACK_ALERT_THRESHOLD",
            str(DEFAULT_FALLBACK_ALERT_THRESHOLD),
        )
        try:
            return max(int(raw_value or 0), 0)
        except (TypeError, ValueError):
            return DEFAULT_FALLBACK_ALERT_THRESHOLD

    async def _feature_flag_enabled(self, flag_name: str) -> bool:
        env_value = os.getenv(flag_name)
        if env_value is not None:
            return _as_bool(env_value, default=False)

        try:
            collection = getattr(self.db, "feature_flags", None) or self.db["feature_flags"]
            doc = await collection.find_one({"key": flag_name})
        except Exception:
            return False

        if not isinstance(doc, dict):
            return False

        if "enabled" in doc:
            return _as_bool(doc.get("enabled"), default=False)

        state = doc.get("state")
        if isinstance(state, str):
            normalized = state.strip().lower()
            if normalized == "enabled":
                return True
            if normalized == "disabled":
                return False

        return _as_bool(state, default=False)

    async def _record_projection_read_hit(self, *, endpoint: str) -> None:
        try:
            await metrics.increment(
                PROJECTION_READ_HIT_COUNTER,
                labels={"endpoint": endpoint},
            )
        except Exception:
            logger.debug("Failed to record projection read hit", exc_info=True)

    async def _record_projection_fallback(
        self,
        *,
        endpoint: str,
        session_id: str,
        item_code: str,
        reason: str,
        projection_payload: Optional[dict[str, Any]] = None,
        legacy_payload: Optional[dict[str, Any]] = None,
    ) -> None:
        logger.warning(
            "PROJECTION_FALLBACK endpoint=%s session_id=%s item_code=%s reason=%s",
            endpoint,
            session_id,
            item_code,
            reason,
        )
        try:
            await metrics.increment(
                PROJECTION_FALLBACK_COUNTER,
                labels={"endpoint": endpoint, "reason": reason},
            )
        except Exception:
            logger.debug("Failed to record projection fallback metric", exc_info=True)

        fallback_doc = {
            "endpoint": endpoint,
            "session_id": session_id,
            "item_code": item_code,
            "reason": reason,
            "timestamp": _utc_now(),
            "projection_payload": projection_payload or {},
            "legacy_payload": legacy_payload or {},
        }
        try:
            await self.db["audit_projection_fallbacks"].insert_one(fallback_doc)
        except Exception:
            logger.debug("Failed to write projection fallback audit record", exc_info=True)
            return

        threshold = self._fallback_alert_threshold()
        if threshold <= 0:
            return

        try:
            fallback_count = await self.db["audit_projection_fallbacks"].count_documents({})
        except Exception:
            logger.debug("Failed to count projection fallback audit records", exc_info=True)
            return

        if fallback_count < threshold:
            return

        logger.error(
            "PROJECTION_FALLBACK_THRESHOLD_EXCEEDED count=%s threshold=%s endpoint=%s",
            fallback_count,
            threshold,
            endpoint,
        )
        try:
            await metrics.increment(
                PROJECTION_FALLBACK_ALERT_COUNTER,
                labels={"endpoint": endpoint},
            )
        except Exception:
            logger.debug("Failed to record projection fallback alert metric", exc_info=True)

    @staticmethod
    def _projection_batch_gap_reason(
        *,
        total_qty: float,
        batch_totals: list[dict[str, Any]],
    ) -> Optional[str]:
        if total_qty <= 0:
            return None
        batch_total_qty = sum(_as_float(batch.get("counted_qty")) for batch in batch_totals)
        if abs(batch_total_qty - total_qty) > 1e-6:
            return "projection_batch_gap"
        return None

    async def use_projection_reads(self) -> bool:
        return await self._feature_flag_enabled(FLAG_PROJECTION_READS)

    async def use_projection_strict_mode(self) -> bool:
        return await self._feature_flag_enabled(FLAG_PROJECTION_STRICT_MODE)

    async def _resolve_projection_gap(
        self,
        *,
        endpoint: str,
        session_id: str,
        item_code: str,
        reason: str,
        projection_payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        legacy = await self._legacy_item_scan_status(
            session_id=session_id,
            item_code=item_code,
        )
        if not legacy.get("scanned"):
            return legacy

        if await self.use_projection_strict_mode():
            logger.error(
                "PROJECTION_STRICT_REJECTED endpoint=%s session_id=%s item_code=%s reason=%s",
                endpoint,
                session_id,
                item_code,
                reason,
            )
            raise ProjectionReadError(
                endpoint=endpoint,
                session_id=session_id,
                item_code=item_code,
                reason=reason,
            )

        await self._record_projection_fallback(
            endpoint=endpoint,
            session_id=session_id,
            item_code=item_code,
            reason=reason,
            projection_payload=projection_payload,
            legacy_payload=legacy,
        )
        return legacy

    async def get_session_item_scan_status(
        self,
        *,
        session_id: str,
        item_code: str,
        endpoint: str = "scan-status",
    ) -> dict[str, Any]:
        safe_endpoint = self._safe_endpoint_name(endpoint, default="scan-status")

        if safe_endpoint not in PROJECTION_SAFE_ENDPOINTS:
            return await self._legacy_item_scan_status(
                session_id=session_id,
                item_code=item_code,
            )

        if await self.use_projection_reads():
            projected = await self._projection_item_scan_status(
                session_id=session_id,
                item_code=item_code,
            )
            if projected is not None:
                batch_gap_reason = self._projection_batch_gap_reason(
                    total_qty=_as_float(projected.get("total_qty")),
                    batch_totals=list(projected.get("batch_totals") or []),
                )
                if batch_gap_reason is None:
                    await self._record_projection_read_hit(endpoint=safe_endpoint)
                    return projected

                return await self._resolve_projection_gap(
                    endpoint=safe_endpoint,
                    session_id=session_id,
                    item_code=item_code,
                    reason=batch_gap_reason,
                    projection_payload=projected,
                )

            return await self._resolve_projection_gap(
                endpoint=safe_endpoint,
                session_id=session_id,
                item_code=item_code,
                reason="projection_item_missing",
            )

        return await self._legacy_item_scan_status(
            session_id=session_id,
            item_code=item_code,
        )

    async def get_session_item_totals(
        self,
        *,
        session_id: str,
        item_code: str,
        endpoint: str = "count-lines/check",
    ) -> dict[str, Any]:
        status = await self.get_session_item_scan_status(
            session_id=session_id,
            item_code=item_code,
            endpoint=endpoint,
        )
        return {
            "scanned": status["scanned"],
            "total_qty": status["total_qty"],
            "batch_totals": status["batch_totals"],
            "source": status["source"],
        }

    async def _projection_item_scan_status(
        self,
        *,
        session_id: str,
        item_code: str,
    ) -> Optional[dict[str, Any]]:
        snapshot = await self.db.items_snapshot.find_one(
            {"session_id": session_id, "item_code": item_code}
        )
        if not isinstance(snapshot, dict):
            return None

        total_qty = _as_float(snapshot.get("counted_qty"))
        batch_totals = await self._projection_batch_totals(
            session_id=session_id, item_code=item_code
        )
        active_lines = await self._active_count_lines(
            session_id=session_id,
            item_code=item_code,
        )

        locations: list[dict[str, Any]] = [
            {
                "floor_no": line.get("floor_no"),
                "rack_no": line.get("rack_no"),
                "counted_qty": _as_float(line.get("counted_qty")),
                "counted_by": line.get("counted_by"),
                "counted_at": line.get("counted_at"),
            }
            for line in active_lines
        ]
        if not locations:
            floor_no = snapshot.get("floor_no") or snapshot.get("floor_id")
            rack_no = snapshot.get("rack_no") or snapshot.get("rack_id")
            counted_by = snapshot.get("counted_by") or snapshot.get("updated_by")
            counted_at = (
                snapshot.get("counted_at")
                or snapshot.get("last_event_at")
                or snapshot.get("updated_at")
            )
            if floor_no or rack_no or total_qty:
                locations.append(
                    {
                        "floor_no": floor_no,
                        "rack_no": rack_no,
                        "counted_qty": total_qty,
                        "counted_by": counted_by,
                        "counted_at": counted_at,
                    }
                )

        return {
            # Snapshot presence indicates at least one scan event was processed,
            # including valid zero-quantity counts.
            "scanned": True,
            "total_qty": total_qty,
            "locations": locations,
            "batch_totals": batch_totals,
            "source": "projection",
        }

    async def _active_count_lines(
        self,
        *,
        session_id: str,
        item_code: str,
    ) -> list[dict[str, Any]]:
        cursor = self.db.count_lines.find(
            {"session_id": session_id, "item_code": item_code, "archived": {"$ne": True}}
        )
        count_lines = await cursor.to_list(None)
        return [line for line in count_lines if not is_superseded_count_line(line)]

    async def _projection_batch_totals(
        self,
        *,
        session_id: str,
        item_code: str,
    ) -> list[dict[str, Any]]:
        cursor = self.db.batch_records.find({"session_id": session_id, "item_code": item_code})
        totals: list[dict[str, Any]] = []
        async for batch in cursor:
            totals.append(
                {
                    "batch_id": batch.get("batch_id") or "NO_BATCH",
                    "batch_no": batch.get("batch_no") or batch.get("batch_id") or "NO_BATCH",
                    "counted_qty": _as_float(batch.get("counted_qty")),
                    "damaged_qty": _as_float(batch.get("damaged_qty")),
                }
            )
        totals.sort(key=lambda row: str(row.get("batch_no") or row.get("batch_id") or ""))
        return totals

    async def _legacy_item_scan_status(
        self,
        *,
        session_id: str,
        item_code: str,
    ) -> dict[str, Any]:
        active_lines = await self._active_count_lines(session_id=session_id, item_code=item_code)
        if not active_lines:
            return {
                "scanned": False,
                "total_qty": 0.0,
                "locations": [],
                "batch_totals": [],
                "source": "legacy",
            }

        total_qty = sum(_as_float(line.get("counted_qty")) for line in active_lines)
        locations = [
            {
                "floor_no": line.get("floor_no"),
                "rack_no": line.get("rack_no"),
                "counted_qty": _as_float(line.get("counted_qty")),
                "counted_by": line.get("counted_by"),
                "counted_at": line.get("counted_at"),
            }
            for line in active_lines
        ]

        batch_index: dict[str, dict[str, Any]] = {}
        for line in active_lines:
            for batch_id, batch_state in _normalize_batch_totals(line).items():
                current = batch_index.setdefault(
                    batch_id,
                    {
                        "batch_id": batch_state["batch_id"],
                        "batch_no": batch_state.get("batch_no") or batch_id,
                        "counted_qty": 0.0,
                        "damaged_qty": 0.0,
                    },
                )
                current["counted_qty"] += _as_float(batch_state.get("counted_qty"))
                current["damaged_qty"] += _as_float(batch_state.get("damaged_qty"))

        batch_totals = sorted(
            batch_index.values(),
            key=lambda row: str(row.get("batch_no") or row.get("batch_id") or ""),
        )

        return {
            "scanned": True,
            "total_qty": total_qty,
            "locations": locations,
            "batch_totals": batch_totals,
            "source": "legacy",
        }
