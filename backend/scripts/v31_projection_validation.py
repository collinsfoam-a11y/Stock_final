from __future__ import annotations
"""Shared validation helpers for the V3.1 event-sourcing migration."""


from typing import Any, Optional


def _as_float(value: Any) -> float:
    try:
        if value in (None, ""):
            return 0.0
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_serials(document: Optional[dict[str, Any]]) -> list[str]:
    if not isinstance(document, dict):
        return []
    serials: list[str] = []
    seen: set[str] = set()
    for raw in document.get("serial_numbers") or []:
        serial = _normalize_string(raw)
        if serial:
            serial = serial.upper()
            if serial not in seen:
                seen.add(serial)
                serials.append(serial)
    for entry in document.get("serial_entries") or []:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_string(entry.get("serial_number"))
        if serial:
            serial = serial.upper()
            if serial not in seen:
                seen.add(serial)
                serials.append(serial)
    return serials


def _normalize_batches(document: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(document, dict):
        return {
            "batches": {
                "NO_BATCH": {
                    "batch_id": "NO_BATCH",
                    "batch_no": "NO_BATCH",
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                }
            },
            "has_batch_evidence": False,
            "missing_batch_id": False,
            "missing_batches": False,
        }

    batches = document.get("batches")
    normalized_batches: dict[str, dict[str, Any]] = {}
    has_batches_array = isinstance(batches, list) and bool(batches)
    top_level_batch_id = _normalize_string(document.get("batch_id") or document.get("batch_no"))
    has_top_level_batch = bool(top_level_batch_id and top_level_batch_id != "NO_BATCH")

    if has_batches_array:
        for entry in batches:
            if not isinstance(entry, dict):
                continue
            batch_id = _normalize_string(entry.get("batch_id") or entry.get("batch_no"))
            if not batch_id:
                continue
            batch_state = normalized_batches.setdefault(
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

    if not normalized_batches and has_top_level_batch:
        normalized_batches[top_level_batch_id] = {
            "batch_id": top_level_batch_id,
            "batch_no": document.get("batch_no") or top_level_batch_id,
            "counted_qty": _as_float(document.get("counted_qty")),
            "damaged_qty": _as_float(document.get("damaged_qty")),
        }

    if not normalized_batches:
        normalized_batches["NO_BATCH"] = {
            "batch_id": "NO_BATCH",
            "batch_no": "NO_BATCH",
            "counted_qty": _as_float(document.get("counted_qty")),
            "damaged_qty": _as_float(document.get("damaged_qty")),
        }

    return {
        "batches": normalized_batches,
        "has_batch_evidence": has_batches_array or has_top_level_batch,
        "missing_batch_id": has_batches_array and not has_top_level_batch,
        "missing_batches": has_top_level_batch and not has_batches_array,
    }


def _is_superseded_count_line(line: dict[str, Any]) -> bool:
    status = str(line.get("status") or "").strip().lower()
    return (
        status == "superseded"
        or bool(line.get("superseded_by_version_id"))
        or bool(line.get("superseded_at"))
    )


async def _build_legacy_state(
    db: Any,
    *,
    session_id: Optional[str] = None,
    limit: int = 0,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if session_id:
        query["session_id"] = session_id

    cursor = db.count_lines.find(query).sort("counted_at", 1)
    if limit > 0:
        cursor = cursor.limit(limit)

    items: dict[tuple[str, str], dict[str, Any]] = {}
    batches: dict[tuple[str, str, str], dict[str, Any]] = {}
    batch_field_gaps: list[dict[str, Any]] = []
    lines_processed = 0

    async for line in cursor:
        if not isinstance(line, dict) or _is_superseded_count_line(line):
            continue
        current_session_id = _normalize_string(line.get("session_id"))
        item_code = _normalize_string(line.get("item_code") or line.get("item_id"))
        if not current_session_id or not item_code:
            continue

        counted_qty = _as_float(line.get("counted_qty"))
        damaged_qty = _as_float(line.get("damaged_qty"))
        serials = _normalize_serials(line)
        batch_info = _normalize_batches(line)
        lines_processed += 1

        item_key = (current_session_id, item_code)
        item_state = items.setdefault(
            item_key,
            {
                "session_id": current_session_id,
                "item_code": item_code,
                "counted_qty": 0.0,
                "damaged_qty": 0.0,
                "serials": set(),
                "has_batch_evidence": False,
            },
        )
        item_state["counted_qty"] += counted_qty
        item_state["damaged_qty"] += damaged_qty
        item_state["serials"].update(serials)
        item_state["has_batch_evidence"] = bool(
            item_state["has_batch_evidence"] or batch_info["has_batch_evidence"]
        )

        if batch_info["missing_batch_id"] or batch_info["missing_batches"]:
            batch_field_gaps.append(
                {
                    "line_id": _normalize_string(line.get("id") or line.get("_id")),
                    "session_id": current_session_id,
                    "item_code": item_code,
                    "missing_batch_id": bool(batch_info["missing_batch_id"]),
                    "missing_batches": bool(batch_info["missing_batches"]),
                }
            )

        for batch_id, batch_totals in batch_info["batches"].items():
            batch_key = (current_session_id, item_code, batch_id)
            batch_state = batches.setdefault(
                batch_key,
                {
                    "session_id": current_session_id,
                    "item_code": item_code,
                    "batch_id": batch_id,
                    "counted_qty": 0.0,
                    "damaged_qty": 0.0,
                },
            )
            batch_state["counted_qty"] += _as_float(batch_totals.get("counted_qty"))
            batch_state["damaged_qty"] += _as_float(batch_totals.get("damaged_qty"))

    return {
        "lines_processed": lines_processed,
        "items": items,
        "batches": batches,
        "batch_field_gaps": batch_field_gaps,
    }


async def _build_projection_state(
    db: Any,
    *,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    item_query = {"session_id": session_id} if session_id else {}
    batch_query = {"session_id": session_id} if session_id else {}
    serial_query = {"session_id": session_id} if session_id else {}

    projection_items: dict[tuple[str, str], dict[str, Any]] = {}
    projection_serials: dict[tuple[str, str, str], dict[str, Any]] = {}
    async for item in db.items_snapshot.find(item_query):
        current_session_id = _normalize_string(item.get("session_id"))
        item_code = _normalize_string(item.get("item_code") or item.get("item_id"))
        if not current_session_id or not item_code:
            continue
        projection_items[(current_session_id, item_code)] = {
            "session_id": current_session_id,
            "item_code": item_code,
            "counted_qty": _as_float(item.get("counted_qty")),
            "damaged_qty": _as_float(item.get("damaged_qty")),
            "serials": set(),
        }

    projection_batches: dict[tuple[str, str, str], dict[str, Any]] = {}
    async for batch in db.batch_records.find(batch_query):
        current_session_id = _normalize_string(batch.get("session_id"))
        item_code = _normalize_string(batch.get("item_code") or batch.get("item_id"))
        batch_id = _normalize_string(batch.get("batch_id")) or "NO_BATCH"
        if not current_session_id or not item_code:
            continue
        projection_batches[(current_session_id, item_code, batch_id)] = {
            "session_id": current_session_id,
            "item_code": item_code,
            "batch_id": batch_id,
            "counted_qty": _as_float(batch.get("counted_qty")),
            "damaged_qty": _as_float(batch.get("damaged_qty")),
        }

    async for serial in db.serial_registry.find(serial_query):
        current_session_id = _normalize_string(serial.get("session_id"))
        item_code = _normalize_string(serial.get("item_code") or serial.get("item_id"))
        serial_no = _normalize_string(serial.get("serial_no"))
        if not current_session_id or not item_code or not serial_no:
            continue
        projection_serials[(current_session_id, item_code, serial_no.upper())] = {
            "session_id": current_session_id,
            "item_code": item_code,
            "serial_no": serial_no.upper(),
            "batch_id": _normalize_string(serial.get("batch_id")) or "NO_BATCH",
        }
        item_state = projection_items.setdefault(
            (current_session_id, item_code),
            {
                "session_id": current_session_id,
                "item_code": item_code,
                "counted_qty": 0.0,
                "damaged_qty": 0.0,
                "serials": set(),
            },
        )
        item_state["serials"].add(serial_no.upper())

    return {
        "items": projection_items,
        "batches": projection_batches,
        "serials": projection_serials,
    }


def _serialize_projection_state(state: dict[str, Any]) -> dict[str, Any]:
    serialized_items = [
        {
            "session_id": key[0],
            "item_code": key[1],
            "counted_qty": _as_float(value.get("counted_qty")),
            "damaged_qty": _as_float(value.get("damaged_qty")),
            "serials": sorted(value.get("serials", set())),
        }
        for key, value in sorted(state.get("items", {}).items())
    ]
    serialized_batches = [
        {
            "session_id": key[0],
            "item_code": key[1],
            "batch_id": key[2],
            "counted_qty": _as_float(value.get("counted_qty")),
            "damaged_qty": _as_float(value.get("damaged_qty")),
        }
        for key, value in sorted(state.get("batches", {}).items())
    ]
    serialized_serials = [dict(value) for _key, value in sorted(state.get("serials", {}).items())]
    return {
        "items": serialized_items,
        "batches": serialized_batches,
        "serials": serialized_serials,
    }


async def build_projection_state_snapshot(
    db: Any,
    *,
    session_id: Optional[str] = None,
) -> dict[str, Any]:
    return _serialize_projection_state(await _build_projection_state(db, session_id=session_id))


async def build_projection_validation_report(
    db: Any,
    *,
    session_id: Optional[str] = None,
    limit: int = 0,
) -> dict[str, Any]:
    legacy = await _build_legacy_state(db, session_id=session_id, limit=limit)
    projected = await _build_projection_state(db, session_id=session_id)

    qty_mismatches: list[dict[str, Any]] = []
    serial_mismatches: list[dict[str, Any]] = []
    batch_mismatches: list[dict[str, Any]] = []
    batch_projection_gaps: list[dict[str, Any]] = []
    tolerance = 1e-6
    projected_batches_by_item: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for batch_key, batch_value in projected["batches"].items():
        projected_batches_by_item.setdefault((batch_key[0], batch_key[1]), []).append(batch_value)

    legacy_batches_by_item: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for batch_key, batch_value in legacy["batches"].items():
        legacy_batches_by_item.setdefault((batch_key[0], batch_key[1]), []).append(batch_value)

    item_keys = set(legacy["items"].keys()) | set(projected["items"].keys())
    for key in sorted(item_keys):
        legacy_item = legacy["items"].get(key)
        projected_item = projected["items"].get(key)

        legacy_qty = _as_float((legacy_item or {}).get("counted_qty"))
        projected_qty = _as_float((projected_item or {}).get("counted_qty"))
        legacy_damaged = _as_float((legacy_item or {}).get("damaged_qty"))
        projected_damaged = _as_float((projected_item or {}).get("damaged_qty"))
        if (
            abs(legacy_qty - projected_qty) > tolerance
            or abs(legacy_damaged - projected_damaged) > tolerance
        ):
            qty_mismatches.append(
                {
                    "session_id": key[0],
                    "item_code": key[1],
                    "legacy_counted_qty": legacy_qty,
                    "projection_counted_qty": projected_qty,
                    "legacy_damaged_qty": legacy_damaged,
                    "projection_damaged_qty": projected_damaged,
                }
            )

        legacy_serials = sorted((legacy_item or {}).get("serials", set()))
        projected_serials = sorted((projected_item or {}).get("serials", set()))
        if legacy_serials != projected_serials:
            serial_mismatches.append(
                {
                    "session_id": key[0],
                    "item_code": key[1],
                    "legacy_serial_count": len(legacy_serials),
                    "projection_serial_count": len(projected_serials),
                    "missing_in_projection": sorted(set(legacy_serials) - set(projected_serials)),
                    "unexpected_in_projection": sorted(
                        set(projected_serials) - set(legacy_serials)
                    ),
                }
            )

        if bool((legacy_item or {}).get("has_batch_evidence")):
            legacy_batches = legacy_batches_by_item.get(key, [])
            projected_batches = projected_batches_by_item.get(key, [])
            legacy_batch_qty = sum(_as_float(batch.get("counted_qty")) for batch in legacy_batches)
            projected_batch_qty = sum(
                _as_float(batch.get("counted_qty")) for batch in projected_batches
            )
            if not projected_batches or abs(legacy_batch_qty - projected_batch_qty) > tolerance:
                batch_projection_gaps.append(
                    {
                        "error_code": "BATCH_PROJECTION_GAP",
                        "session_id": key[0],
                        "item_code": key[1],
                        "legacy_batch_count": len(legacy_batches),
                        "projection_batch_count": len(projected_batches),
                        "legacy_batch_qty": legacy_batch_qty,
                        "projection_batch_qty": projected_batch_qty,
                    }
                )

    batch_keys = set(legacy["batches"].keys()) | set(projected["batches"].keys())
    for key in sorted(batch_keys):
        legacy_batch = legacy["batches"].get(key)
        projected_batch = projected["batches"].get(key)
        legacy_qty = _as_float((legacy_batch or {}).get("counted_qty"))
        projected_qty = _as_float((projected_batch or {}).get("counted_qty"))
        legacy_damaged = _as_float((legacy_batch or {}).get("damaged_qty"))
        projected_damaged = _as_float((projected_batch or {}).get("damaged_qty"))
        if (
            abs(legacy_qty - projected_qty) > tolerance
            or abs(legacy_damaged - projected_damaged) > tolerance
        ):
            batch_mismatches.append(
                {
                    "session_id": key[0],
                    "item_code": key[1],
                    "batch_id": key[2],
                    "legacy_counted_qty": legacy_qty,
                    "projection_counted_qty": projected_qty,
                    "legacy_damaged_qty": legacy_damaged,
                    "projection_damaged_qty": projected_damaged,
                }
            )

    return {
        "summary": {
            "session_id": session_id,
            "legacy_lines_processed": legacy["lines_processed"],
            "legacy_item_count": len(legacy["items"]),
            "projection_item_count": len(projected["items"]),
            "qty_mismatch_count": len(qty_mismatches),
            "serial_mismatch_count": len(serial_mismatches),
            "batch_mismatch_count": len(batch_mismatches),
            "batch_projection_gap_count": len(batch_projection_gaps),
            "legacy_batch_field_gap_count": len(legacy["batch_field_gaps"]),
            "is_consistent": not (
                qty_mismatches or serial_mismatches or batch_mismatches or batch_projection_gaps
            ),
        },
        "qty_mismatches": qty_mismatches,
        "serial_mismatches": serial_mismatches,
        "batch_mismatches": batch_mismatches,
        "batch_projection_gaps": batch_projection_gaps,
        "legacy_batch_field_gaps": legacy["batch_field_gaps"],
    }
