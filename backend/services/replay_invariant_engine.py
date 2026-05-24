from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional


INVENTORY_EVENT_TYPES = {
    "SCAN_ADDED",
    "QUANTITY_ADJUSTED",
    "COUNT_LINE_REMOVED",
    "COUNT_LINE_MERGED",
    "COUNT_LINE_SUPERSEDED",
    "COUNT_VERIFIED",
    "COUNT_UNVERIFIED",
}

REPLAY_INVARIANT_COLLECTIONS = (
    "items_snapshot",
    "batch_records",
    "serial_registry",
    "damage_logs",
    "variance_logs",
    "approvals",
    "sync_queue",
    "event_applied",
)


@dataclass(frozen=True)
class ReplayInvariantViolation:
    invariant: str
    reason: str
    severity: str = "error"
    collection: Optional[str] = None
    key: Optional[str] = None
    field: Optional[str] = None
    expected: Any = None
    actual: Any = None
    event_id: Optional[str] = None
    aggregate_id: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "invariant": self.invariant,
            "reason": self.reason,
            "severity": self.severity,
            "collection": self.collection,
            "key": self.key,
            "field": self.field,
            "expected": self.expected,
            "actual": self.actual,
            "event_id": self.event_id,
            "aggregate_id": self.aggregate_id,
        }
        return {key: value for key, value in payload.items() if value is not None}


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _as_float(value: Any, *, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        parsed = int(value)
        return parsed if parsed > 0 else None
    except (TypeError, ValueError):
        return None


def _event_identifier(event: dict[str, Any]) -> Optional[str]:
    return _normalize_string(event.get("_id") or event.get("event_id") or event.get("id"))


def _event_type(event: dict[str, Any]) -> str:
    return str(event.get("event_type") or "").strip().upper()


def _payload(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("payload")
    return payload if isinstance(payload, dict) else {}


def _semantic_key(*parts: Any) -> str:
    return "|".join(str(part or "") for part in parts)


def _normalize_serials(document: Optional[dict[str, Any]]) -> list[str]:
    if not isinstance(document, dict):
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for value in document.get("serial_numbers") or []:
        serial = _normalize_string(value)
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                seen.add(serial_upper)
                normalized.append(serial_upper)
    for entry in document.get("serial_entries") or []:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_string(entry.get("serial_number"))
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                seen.add(serial_upper)
                normalized.append(serial_upper)
    return normalized


def _normalize_batches(document: Optional[dict[str, Any]]) -> dict[str, dict[str, Any]]:
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
            batch_state = normalized.setdefault(
                batch_id,
                {
                    "batch_id": batch_id,
                    "batch_no": entry.get("batch_no") or batch_id,
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                },
            )
            batch_state["counted_qty"] += _as_float(
                entry.get("counted_qty") or entry.get("quantity") or entry.get("qty")
            )
            batch_state["damaged_qty"] += _as_float(entry.get("damaged_qty"))
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


def _semantic_line_from_payload(payload: dict[str, Any]) -> Optional[dict[str, Any]]:
    after = payload.get("after") if isinstance(payload.get("after"), dict) else None
    before = payload.get("before") if isinstance(payload.get("before"), dict) else None
    line = after or payload.get("count_line") or before
    return line if isinstance(line, dict) else None


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, set):
        return sorted(_canonicalize(item) for item in value)
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _stable_hash(value: Any) -> str:
    serialized = json.dumps(
        _canonicalize(value),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class ReplayInvariantEngine:
    """Evaluates deterministic replay invariants against events and projections."""

    def __init__(self, *, tolerance: float = 0.000001) -> None:
        self.tolerance = tolerance

    @staticmethod
    def required_projection_collections() -> tuple[str, ...]:
        return REPLAY_INVARIANT_COLLECTIONS

    def validate(
        self,
        events: list[dict[str, Any]],
        projection_docs: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        expected = self.expected_semantic_state(events)
        invariant_results = [
            self.assert_inventory_conservation(expected, projection_docs),
            self.assert_reservation_closure(events),
            self.assert_aggregate_version_monotonicity(events),
            self.assert_replay_determinism(events, expected),
            self.assert_projection_semantic_equivalence(expected, projection_docs),
        ]
        violations = [
            violation
            for result in invariant_results
            for violation in result.get("violations", [])
        ]
        semantic_state_hash = _stable_hash(expected)
        return {
            "passed": not violations,
            "violation_count": len(violations),
            "violations": violations,
            "invariant_results": invariant_results,
            "semantic_state_hash": semantic_state_hash,
            "invariants": {
                "items_snapshot_count": len(expected["items"]),
                "batch_records_count": len(expected["batches"]),
                "serial_registry_count": len(expected["serials"]),
                "damage_logs_count": len(expected["damage_event_ids"]),
                "variance_logs_count": len(expected["variance_event_ids"]),
                "approvals_count": len(expected["approval_event_ids"]),
                "sync_queue_count": len(expected["sync_queue_ids"]),
                "event_applied_count": len(expected["applied_event_ids"]),
                "aggregate_count": len(expected["aggregate_versions"]),
                "reservation_scope_count": len(expected["reservation_ids"]),
            },
        }

    def expected_semantic_state(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        items: dict[str, dict[str, Any]] = {}
        batches: dict[str, dict[str, Any]] = {}
        serials: set[str] = set()
        damage_event_ids: set[str] = set()
        variance_event_ids: set[str] = set()
        approval_event_ids: set[str] = set()
        sync_queue_ids: set[str] = set()
        applied_event_ids: set[str] = set()
        aggregate_versions: dict[str, list[dict[str, Any]]] = {}
        reservation_ids: set[str] = set()

        for event in events:
            event_id = _event_identifier(event)
            if event_id:
                applied_event_ids.add(event_id)

            aggregate_id = _normalize_string(event.get("aggregate_id"))
            version = _as_int(event.get("aggregate_version") or event.get("aggregate_sequence"))
            if aggregate_id and version is not None:
                aggregate_versions.setdefault(aggregate_id, []).append(
                    {
                        "event_id": event_id,
                        "version": version,
                        "aggregate_sequence": _as_int(event.get("aggregate_sequence")),
                        "aggregate_version": _as_int(event.get("aggregate_version")),
                        "global_sequence": _as_int(event.get("global_sequence")),
                    }
                )

            payload = _payload(event)
            event_type = _event_type(event)
            line = _semantic_line_from_payload(payload)

            reservation_id = self._reservation_identifier(event)
            if reservation_id:
                reservation_ids.add(reservation_id)

            if event_type in INVENTORY_EVENT_TYPES and isinstance(line, dict):
                self._apply_inventory_event(
                    event_type=event_type,
                    payload=payload,
                    line=line,
                    items=items,
                    batches=batches,
                    serials=serials,
                )

            if event_type == "DAMAGE_MARKED" and isinstance(line, dict) and event_id:
                damage_event_ids.add(event_id)
            if (
                event_type in {"VARIANCE_DETECTED", "RECOUNT_REQUESTED"}
                and isinstance(line, dict)
                and event_id
            ):
                variance_event_ids.add(event_id)
            if event_type == "APPROVAL_GRANTED" and isinstance(line, dict) and event_id:
                approval_event_ids.add(event_id)
            if event_type in {"SYNC_CONFLICT_RECORDED", "SYNC_CONFLICT_RESOLVED"}:
                queue_id = _normalize_string(payload.get("queue_id") or event_id)
                if queue_id:
                    sync_queue_ids.add(queue_id)

        return {
            "items": items,
            "batches": batches,
            "serials": serials,
            "damage_event_ids": damage_event_ids,
            "variance_event_ids": variance_event_ids,
            "approval_event_ids": approval_event_ids,
            "sync_queue_ids": sync_queue_ids,
            "applied_event_ids": applied_event_ids,
            "aggregate_versions": aggregate_versions,
            "reservation_ids": reservation_ids,
        }

    def assert_inventory_conservation(
        self,
        expected: dict[str, Any],
        projection_docs: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        violations: list[ReplayInvariantViolation] = []
        actual_items = {
            _semantic_key(doc.get("session_id"), doc.get("item_code")): doc
            for doc in projection_docs.get("items_snapshot", [])
        }
        actual_batches = {
            _semantic_key(doc.get("session_id"), doc.get("item_code"), doc.get("batch_id")): doc
            for doc in projection_docs.get("batch_records", [])
        }

        for key, expected_item in expected["items"].items():
            actual = actual_items.get(key)
            if not actual:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="inventory_conservation",
                        collection="items_snapshot",
                        key=key,
                        reason="missing_item_projection",
                    )
                )
                continue
            self._assert_non_negative(
                violations,
                invariant="inventory_conservation",
                collection="items_snapshot",
                key=key,
                document=actual,
                fields=("counted_qty", "damaged_qty", "serial_count"),
            )
            for field_name in ("counted_qty", "damaged_qty"):
                if not self._compare_float(expected_item[field_name], actual.get(field_name)):
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="inventory_conservation",
                            collection="items_snapshot",
                            key=key,
                            field=field_name,
                            reason="quantity_mismatch",
                            expected=expected_item[field_name],
                            actual=actual.get(field_name),
                        )
                    )
            expected_serial_count = int(expected_item["serial_count"])
            if int(actual.get("serial_count") or 0) != expected_serial_count:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="inventory_conservation",
                        collection="items_snapshot",
                        key=key,
                        field="serial_count",
                        reason="serial_count_mismatch",
                        expected=expected_serial_count,
                        actual=actual.get("serial_count"),
                    )
                )
            self._assert_expected_non_negative(violations, key=key, expected_item=expected_item)

        for key in sorted(set(actual_items) - set(expected["items"])):
            violations.append(
                ReplayInvariantViolation(
                    invariant="inventory_conservation",
                    collection="items_snapshot",
                    key=key,
                    reason="unexpected_item_projection",
                )
            )

        self._assert_batch_item_closure(
            violations,
            expected_items=expected["items"],
            expected_batches=expected["batches"],
            actual_items=actual_items,
            actual_batches=actual_batches,
        )
        return self._result("inventory_conservation", violations)

    def assert_reservation_closure(self, events: list[dict[str, Any]]) -> dict[str, Any]:
        active: dict[str, str] = {}
        seen_closed: set[str] = set()
        observed = False
        violations: list[ReplayInvariantViolation] = []

        for event in events:
            reservation_id = self._reservation_identifier(event)
            if not reservation_id:
                continue
            observed = True
            event_id = _event_identifier(event)
            event_type = _event_type(event)
            if self._reservation_opens(event_type):
                if reservation_id in active:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="reservation_closure",
                            key=reservation_id,
                            reason="duplicate_open_reservation",
                            event_id=event_id,
                        )
                    )
                if reservation_id in seen_closed:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="reservation_closure",
                            key=reservation_id,
                            reason="reservation_reopened_after_close",
                            event_id=event_id,
                        )
                    )
                active[reservation_id] = event_id or ""
                continue
            if self._reservation_closes(event_type):
                if reservation_id not in active:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="reservation_closure",
                            key=reservation_id,
                            reason="close_without_open_reservation",
                            event_id=event_id,
                        )
                    )
                active.pop(reservation_id, None)
                if reservation_id in seen_closed:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="reservation_closure",
                            key=reservation_id,
                            reason="duplicate_close_reservation",
                            event_id=event_id,
                        )
                    )
                seen_closed.add(reservation_id)

        for reservation_id, event_id in sorted(active.items()):
            violations.append(
                ReplayInvariantViolation(
                    invariant="reservation_closure",
                    key=reservation_id,
                    reason="dangling_reservation",
                    event_id=event_id or None,
                )
            )

        return self._result(
            "reservation_closure",
            violations,
            status_override="not_applicable" if not observed else None,
        )

    def assert_aggregate_version_monotonicity(
        self,
        events: list[dict[str, Any]],
    ) -> dict[str, Any]:
        by_aggregate: dict[str, list[dict[str, Any]]] = {}
        violations: list[ReplayInvariantViolation] = []

        for event in events:
            aggregate_id = _normalize_string(event.get("aggregate_id"))
            if not aggregate_id:
                continue
            aggregate_version = _as_int(event.get("aggregate_version"))
            aggregate_sequence = _as_int(event.get("aggregate_sequence"))
            event_id = _event_identifier(event)
            if aggregate_version is None and aggregate_sequence is None:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="aggregate_version_monotonicity",
                        aggregate_id=aggregate_id,
                        event_id=event_id,
                        reason="missing_aggregate_version",
                    )
                )
                continue
            if aggregate_version is not None and aggregate_sequence is not None:
                if aggregate_version != aggregate_sequence:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="aggregate_version_monotonicity",
                            aggregate_id=aggregate_id,
                            event_id=event_id,
                            reason="aggregate_version_sequence_mismatch",
                            expected=aggregate_sequence,
                            actual=aggregate_version,
                        )
                    )
            version = aggregate_version or aggregate_sequence
            by_aggregate.setdefault(aggregate_id, []).append(
                {
                    "event_id": event_id,
                    "version": version,
                    "global_sequence": _as_int(event.get("global_sequence")),
                }
            )

        for aggregate_id, entries in by_aggregate.items():
            ordered = sorted(
                entries,
                key=lambda entry: (
                    entry.get("global_sequence") or 0,
                    entry.get("version") or 0,
                    str(entry.get("event_id") or ""),
                ),
            )
            expected_version = 1
            seen_versions: set[int] = set()
            for entry in ordered:
                version = int(entry["version"])
                if version in seen_versions:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="aggregate_version_monotonicity",
                            aggregate_id=aggregate_id,
                            event_id=entry.get("event_id"),
                            reason="duplicate_aggregate_version",
                            actual=version,
                        )
                    )
                if version != expected_version:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="aggregate_version_monotonicity",
                            aggregate_id=aggregate_id,
                            event_id=entry.get("event_id"),
                            reason="aggregate_version_gap",
                            expected=expected_version,
                            actual=version,
                        )
                    )
                    expected_version = version + 1
                else:
                    expected_version += 1
                seen_versions.add(version)

        return self._result("aggregate_version_monotonicity", violations)

    def assert_replay_determinism(
        self,
        events: list[dict[str, Any]],
        expected: dict[str, Any],
    ) -> dict[str, Any]:
        violations: list[ReplayInvariantViolation] = []
        seen_event_ids: set[str] = set()
        seen_global_sequences: set[int] = set()
        last_global_sequence = 0

        for event in events:
            event_id = _event_identifier(event)
            global_sequence = _as_int(event.get("global_sequence"))
            if event_id:
                if event_id in seen_event_ids:
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="replay_determinism",
                            event_id=event_id,
                            reason="duplicate_event_id",
                        )
                    )
                seen_event_ids.add(event_id)
            if global_sequence is None:
                continue
            if global_sequence in seen_global_sequences:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="replay_determinism",
                        event_id=event_id,
                        reason="duplicate_global_sequence",
                        actual=global_sequence,
                    )
                )
            if global_sequence < last_global_sequence:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="replay_determinism",
                        event_id=event_id,
                        reason="global_sequence_out_of_order",
                        expected=last_global_sequence,
                        actual=global_sequence,
                    )
                )
            seen_global_sequences.add(global_sequence)
            last_global_sequence = max(last_global_sequence, global_sequence)

        details = {
            "event_lineage_hash": _stable_hash(
                [
                    {
                        "event_id": _event_identifier(event),
                        "global_sequence": event.get("global_sequence"),
                        "aggregate_id": event.get("aggregate_id"),
                        "aggregate_sequence": event.get("aggregate_sequence"),
                        "aggregate_version": event.get("aggregate_version"),
                        "event_type": event.get("event_type"),
                    }
                    for event in events
                ]
            ),
            "expected_state_hash": _stable_hash(expected),
            "versioned_event_count": len(seen_global_sequences),
        }
        return self._result("replay_determinism", violations, details=details)

    def assert_projection_semantic_equivalence(
        self,
        expected: dict[str, Any],
        projection_docs: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        violations: list[ReplayInvariantViolation] = []
        actual_batches = {
            _semantic_key(doc.get("session_id"), doc.get("item_code"), doc.get("batch_id")): doc
            for doc in projection_docs.get("batch_records", [])
        }
        for key, expected_batch in expected["batches"].items():
            actual = actual_batches.get(key)
            if not actual:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="projection_semantic_equivalence",
                        collection="batch_records",
                        key=key,
                        reason="missing_batch_projection",
                    )
                )
                continue
            for field_name in ("counted_qty", "damaged_qty"):
                if not self._compare_float(expected_batch[field_name], actual.get(field_name)):
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="projection_semantic_equivalence",
                            collection="batch_records",
                            key=key,
                            field=field_name,
                            reason="batch_quantity_mismatch",
                            expected=expected_batch[field_name],
                            actual=actual.get(field_name),
                        )
                    )
        for key in sorted(set(actual_batches) - set(expected["batches"])):
            violations.append(
                ReplayInvariantViolation(
                    invariant="projection_semantic_equivalence",
                    collection="batch_records",
                    key=key,
                    reason="unexpected_batch_projection",
                )
            )

        actual_serials = {
            _semantic_key(doc.get("session_id"), doc.get("item_code"), doc.get("serial_no"))
            for doc in projection_docs.get("serial_registry", [])
        }
        if actual_serials != expected["serials"]:
            violations.append(
                ReplayInvariantViolation(
                    invariant="projection_semantic_equivalence",
                    collection="serial_registry",
                    reason="serial_set_mismatch",
                    expected=sorted(expected["serials"] - actual_serials),
                    actual=sorted(actual_serials - expected["serials"]),
                )
            )

        collection_event_checks = (
            ("damage_logs", "event_id", expected["damage_event_ids"]),
            ("variance_logs", "event_id", expected["variance_event_ids"]),
            ("approvals", "approval_id", expected["approval_event_ids"]),
            ("sync_queue", "queue_id", expected["sync_queue_ids"]),
            ("event_applied", "event_id", expected["applied_event_ids"]),
        )
        for collection_name, id_field, expected_ids in collection_event_checks:
            docs = projection_docs.get(collection_name, [])
            actual_ids = {_normalize_string(doc.get(id_field)) for doc in docs}
            actual_ids.discard(None)
            if actual_ids != expected_ids:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="projection_semantic_equivalence",
                        collection=collection_name,
                        reason="identity_set_mismatch",
                        expected=sorted(expected_ids - actual_ids),
                        actual=sorted(actual_ids - expected_ids),
                    )
                )
        return self._result("projection_semantic_equivalence", violations)

    def _apply_inventory_event(
        self,
        *,
        event_type: str,
        payload: dict[str, Any],
        line: dict[str, Any],
        items: dict[str, dict[str, Any]],
        batches: dict[str, dict[str, Any]],
        serials: set[str],
    ) -> None:
        session_id = _normalize_string(payload.get("session_id") or line.get("session_id"))
        item_id = _normalize_string(
            payload.get("item_id") or line.get("item_id") or line.get("item_code")
        )
        item_code = _normalize_string(line.get("item_code") or payload.get("item_id") or item_id)
        if not session_id or not item_id or not item_code:
            return

        delta = payload.get("delta") if isinstance(payload.get("delta"), dict) else {}
        after = payload.get("after") if isinstance(payload.get("after"), dict) else None
        before = payload.get("before") if isinstance(payload.get("before"), dict) else None
        counted_delta = _as_float(delta.get("counted_qty"))
        damaged_delta = _as_float(delta.get("damaged_qty"))
        serial_delta = int(delta.get("serial_count") or 0)
        if event_type == "SCAN_ADDED" and counted_delta == 0.0:
            counted_delta = _as_float(line.get("counted_qty"))
            damaged_delta = _as_float(line.get("damaged_qty"))
            serial_delta = len(_normalize_serials(after or line))

        item_key = _semantic_key(session_id, item_code)
        item_state = items.setdefault(
            item_key,
            {
                "session_id": session_id,
                "item_code": item_code,
                "counted_qty": 0.0,
                "damaged_qty": 0.0,
                "serial_count": 0,
            },
        )
        item_state["counted_qty"] += counted_delta
        item_state["damaged_qty"] += damaged_delta
        item_state["serial_count"] += serial_delta

        before_batches = _normalize_batches(before)
        after_batches = _normalize_batches(after)
        if event_type == "SCAN_ADDED" and not after_batches:
            after_batches = _normalize_batches(after or line)
        for batch_id in sorted(set(before_batches.keys()) | set(after_batches.keys())):
            before_batch = before_batches.get(batch_id) or {}
            after_batch = after_batches.get(batch_id) or {}
            batch_counted_delta = _as_float(after_batch.get("counted_qty")) - _as_float(
                before_batch.get("counted_qty")
            )
            batch_damaged_delta = _as_float(after_batch.get("damaged_qty")) - _as_float(
                before_batch.get("damaged_qty")
            )
            if batch_counted_delta == 0.0 and batch_damaged_delta == 0.0:
                continue
            batch_key = _semantic_key(session_id, item_code, batch_id)
            batch_state = batches.setdefault(
                batch_key,
                {
                    "session_id": session_id,
                    "item_code": item_code,
                    "batch_id": batch_id,
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                },
            )
            batch_state["counted_qty"] += batch_counted_delta
            batch_state["damaged_qty"] += batch_damaged_delta

        before_serials = set(_normalize_serials(before))
        after_serials = set(_normalize_serials(after))
        for serial in sorted(after_serials):
            serials.add(_semantic_key(session_id, item_code, serial))
        for serial in sorted(before_serials - after_serials):
            serials.discard(_semantic_key(session_id, item_code, serial))

    def _assert_non_negative(
        self,
        violations: list[ReplayInvariantViolation],
        *,
        invariant: str,
        collection: str,
        key: str,
        document: dict[str, Any],
        fields: tuple[str, ...],
    ) -> None:
        for field_name in fields:
            value = _as_float(document.get(field_name))
            if value < 0:
                violations.append(
                    ReplayInvariantViolation(
                        invariant=invariant,
                        collection=collection,
                        key=key,
                        field=field_name,
                        reason="negative_quantity",
                        actual=document.get(field_name),
                    )
                )

    def _assert_expected_non_negative(
        self,
        violations: list[ReplayInvariantViolation],
        *,
        key: str,
        expected_item: dict[str, Any],
    ) -> None:
        for field_name in ("counted_qty", "damaged_qty", "serial_count"):
            if _as_float(expected_item.get(field_name)) < 0:
                violations.append(
                    ReplayInvariantViolation(
                        invariant="inventory_conservation",
                        collection="event_log",
                        key=key,
                        field=field_name,
                        reason="negative_replayed_quantity",
                        actual=expected_item.get(field_name),
                    )
                )

    def _assert_batch_item_closure(
        self,
        violations: list[ReplayInvariantViolation],
        *,
        expected_items: dict[str, dict[str, Any]],
        expected_batches: dict[str, dict[str, Any]],
        actual_items: dict[str, dict[str, Any]],
        actual_batches: dict[str, dict[str, Any]],
    ) -> None:
        expected_batch_totals = self._batch_totals_by_item(expected_batches.values())
        actual_batch_totals = self._batch_totals_by_item(actual_batches.values())

        for item_key, item in expected_items.items():
            totals = expected_batch_totals.get(item_key)
            if not totals:
                continue
            for field_name in ("counted_qty", "damaged_qty"):
                if not self._compare_float(item[field_name], totals[field_name]):
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="inventory_conservation",
                            collection="event_log",
                            key=item_key,
                            field=field_name,
                            reason="expected_batch_item_closure_mismatch",
                            expected=item[field_name],
                            actual=totals[field_name],
                        )
                    )

        for item_key, item in actual_items.items():
            totals = actual_batch_totals.get(item_key)
            if not totals:
                continue
            for field_name in ("counted_qty", "damaged_qty"):
                if not self._compare_float(item.get(field_name), totals[field_name]):
                    violations.append(
                        ReplayInvariantViolation(
                            invariant="inventory_conservation",
                            collection="batch_records",
                            key=item_key,
                            field=field_name,
                            reason="actual_batch_item_closure_mismatch",
                            expected=item.get(field_name),
                            actual=totals[field_name],
                        )
                    )

    @staticmethod
    def _batch_totals_by_item(batches: Any) -> dict[str, dict[str, float]]:
        totals: dict[str, dict[str, float]] = {}
        for batch in batches:
            item_key = _semantic_key(batch.get("session_id"), batch.get("item_code"))
            item_totals = totals.setdefault(
                item_key,
                {"counted_qty": 0.0, "damaged_qty": 0.0},
            )
            item_totals["counted_qty"] += _as_float(batch.get("counted_qty"))
            item_totals["damaged_qty"] += _as_float(batch.get("damaged_qty"))
        return totals

    def _compare_float(self, expected: Any, actual: Any) -> bool:
        return abs(_as_float(expected) - _as_float(actual)) <= self.tolerance

    @staticmethod
    def _reservation_identifier(event: dict[str, Any]) -> Optional[str]:
        payload = _payload(event)
        return _normalize_string(
            payload.get("reservation_id")
            or payload.get("allocation_id")
            or payload.get("reservation_key")
            or payload.get("allocation_key")
        )

    @staticmethod
    def _reservation_opens(event_type: str) -> bool:
        return (
            ("RESERV" in event_type or "ALLOCAT" in event_type)
            and any(token in event_type for token in ("CREATED", "OPENED", "PLACED", "HELD"))
        )

    @staticmethod
    def _reservation_closes(event_type: str) -> bool:
        return (
            ("RESERV" in event_type or "ALLOCAT" in event_type)
            and any(
                token in event_type
                for token in ("RELEASED", "CONSUMED", "CANCELLED", "CANCELED", "RESOLVED", "CLOSED")
            )
        )

    @staticmethod
    def _result(
        name: str,
        violations: list[ReplayInvariantViolation],
        *,
        details: Optional[dict[str, Any]] = None,
        status_override: Optional[str] = None,
    ) -> dict[str, Any]:
        status = status_override or ("failed" if violations else "passed")
        return {
            "name": name,
            "status": status,
            "violation_count": len(violations),
            "violations": [violation.to_dict() for violation in violations],
            "details": details or {},
        }
