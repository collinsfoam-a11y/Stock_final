from __future__ import annotations
"""
Runtime and background validation service for governance invariants.
"""


import logging
import os
from decimal import Decimal, InvalidOperation
from datetime import datetime, timezone
from typing import Any, Optional

from backend.services.governance_guard import GovernanceViolation

logger = logging.getLogger(__name__)

FRACTIONAL_UOMS = {
    "KG",
    "KGS",
    "L",
    "LTR",
    "LTRS",
    "LITER",
    "LITRE",
    "M",
    "MTR",
    "METER",
    "METRE",
}
NON_FRACTIONAL_UOMS = {"NOS", "NO", "PCS", "PC", "EA", "EACH", "UNIT"}


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


def _normalize_string(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_uom(value: Any) -> Optional[str]:
    normalized = _normalize_string(value)
    return normalized.upper() if normalized else None


def _as_decimal(value: Any, *, default: str = "0") -> Decimal:
    raw = default if value in (None, "") else str(value)
    try:
        return Decimal(raw)
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise GovernanceViolation(f"INVALID_QUANTITY: {value}") from exc


def _normalize_serials(doc: dict[str, Any]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in doc.get("serial_numbers") or []:
        serial = _normalize_string(value)
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                normalized.append(serial_upper)
                seen.add(serial_upper)
    for entry in doc.get("serial_entries") or []:
        if not isinstance(entry, dict):
            continue
        serial = _normalize_string(entry.get("serial_number"))
        if serial:
            serial_upper = serial.upper()
            if serial_upper not in seen:
                normalized.append(serial_upper)
                seen.add(serial_upper)
    return normalized


def _decimal_places(value: Decimal) -> int:
    normalized = value.normalize() if value != 0 else Decimal("0")
    exponent = normalized.as_tuple().exponent
    if not isinstance(exponent, int):
        return 0
    return abs(exponent) if exponent < 0 else 0


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
        except Exception as exc:
            logger.error("Failed to resolve validation_logs collection: %s", exc)
            raise

    @staticmethod
    def _kwargs(db_session: Optional[Any]) -> dict[str, Any]:
        return {"session": db_session} if db_session is not None else {}

    async def resolve_item_master(
        self,
        doc: dict[str, Any],
        *,
        item: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if isinstance(item, dict):
            return item

        kwargs = self._kwargs(db_session)
        barcode = _normalize_string(doc.get("barcode"))
        item_code = _normalize_string(doc.get("item_code"))

        if barcode:
            existing = await self.db.erp_items.find_one({"barcode": barcode}, **kwargs)
            if isinstance(existing, dict):
                return existing
        if item_code:
            existing = await self.db.erp_items.find_one({"item_code": item_code}, **kwargs)
            if isinstance(existing, dict):
                return existing
        return {}

    async def find_serial_conflict(
        self,
        serial_no: str,
        *,
        item_code: Optional[str] = None,
        current_line_id: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> Optional[dict[str, Any]]:
        normalized = _normalize_string(serial_no)
        if not normalized:
            return None
        normalized = normalized.upper()
        normalized_item_code = _normalize_string(item_code)
        kwargs = self._kwargs(db_session)

        registry_query: dict[str, Any]
        if normalized_item_code:
            registry_query = {
                "$and": [
                    {"serial_no": normalized},
                    {
                        "$or": [
                            {"item_id": normalized_item_code},
                            {"item_code": normalized_item_code},
                        ]
                    },
                ]
            }
        else:
            registry_query = {"serial_no": normalized}

        registry_match = await self.db.serial_registry.find_one(registry_query, **kwargs)
        if isinstance(registry_match, dict):
            existing_line_id = _normalize_string(
                registry_match.get("count_line_id") or registry_match.get("line_id")
            )
            if not current_line_id or existing_line_id != current_line_id:
                return {
                    "source": "serial_registry",
                    "serial_no": normalized,
                    "item_id": registry_match.get("item_id"),
                    "item_code": registry_match.get("item_code"),
                    "item_name": registry_match.get("item_name"),
                    "counted_by": registry_match.get("counted_by"),
                    "floor_no": registry_match.get("floor_id") or registry_match.get("floor_no"),
                    "rack_no": registry_match.get("rack_id") or registry_match.get("rack_no"),
                    "status": registry_match.get("status"),
                    "session_id": registry_match.get("session_id"),
                    "count_line_id": existing_line_id,
                }

        legacy_query: dict[str, Any]
        if normalized_item_code:
            legacy_query = {
                "$and": [
                    {"serial_number": normalized},
                    {
                        "$or": [
                            {"item_id": normalized_item_code},
                            {"item_code": normalized_item_code},
                        ]
                    },
                ]
            }
        else:
            legacy_query = {"serial_number": normalized}

        legacy_match = await self.db.item_serials.find_one(legacy_query, **kwargs)
        if isinstance(legacy_match, dict):
            return {
                "source": "item_serials",
                "serial_no": normalized,
                "item_id": legacy_match.get("item_id"),
                "item_code": legacy_match.get("item_code"),
                "item_name": legacy_match.get("item_name"),
                "counted_by": legacy_match.get("counted_by"),
                "floor_no": legacy_match.get("floor_no"),
                "rack_no": legacy_match.get("rack_no"),
                "status": legacy_match.get("status"),
                "session_id": legacy_match.get("session_id"),
                "count_line_id": _normalize_string(legacy_match.get("count_line_id")),
            }

        # Compatibility fallback during phased migration. This should only matter
        # for legacy rows that have not yet been backfilled into serial_registry.
        count_line_query: dict[str, Any]
        serial_clause: dict[str, Any] = {
            "$or": [
                {"serial_numbers": normalized},
                {"serial_entries.serial_number": normalized},
            ]
        }
        if normalized_item_code:
            count_line_query = {
                "$and": [
                    serial_clause,
                    {
                        "$or": [
                            {"item_id": normalized_item_code},
                            {"item_code": normalized_item_code},
                        ]
                    },
                ]
            }
        else:
            count_line_query = serial_clause

        count_line_match = await self.db.count_lines.find_one(count_line_query, **kwargs)
        if isinstance(count_line_match, dict):
            existing_line_id = _normalize_string(
                count_line_match.get("id") or count_line_match.get("_id")
            )
            if not current_line_id or existing_line_id != current_line_id:
                return {
                    "source": "legacy_count_lines",
                    "serial_no": normalized,
                    "item_id": count_line_match.get("item_id"),
                    "item_code": count_line_match.get("item_code"),
                    "item_name": count_line_match.get("item_name"),
                    "counted_by": count_line_match.get("counted_by"),
                    "floor_no": count_line_match.get("floor_no"),
                    "rack_no": count_line_match.get("rack_no"),
                    "status": count_line_match.get("status"),
                    "session_id": count_line_match.get("session_id"),
                    "count_line_id": existing_line_id,
                }
        return None

    async def assert_item_serial_uniqueness(
        self,
        item_code: str,
        serial_numbers: list[str],
        *,
        current_line_id: Optional[str] = None,
        db_session: Optional[Any] = None,
    ) -> None:
        for serial in serial_numbers:
            conflict = await self.find_serial_conflict(
                serial,
                item_code=item_code,
                current_line_id=current_line_id,
                db_session=db_session,
            )
            if conflict:
                raise GovernanceViolation(f"SERIAL_DUPLICATE: {serial}")

    def normalize_quantity_for_item(
        self,
        *,
        item: dict[str, Any],
        doc: dict[str, Any],
    ) -> dict[str, Any]:
        qty = _as_decimal(doc.get("counted_qty"))
        if qty < 0:
            raise GovernanceViolation("NEGATIVE_QUANTITY")
        input_uom = (
            _normalize_uom(doc.get("input_uom"))
            or _normalize_uom(doc.get("uom_code"))
            or _normalize_uom(doc.get("uom_name"))
            or _normalize_uom(item.get("uom_code"))
            or _normalize_uom(item.get("uom_name"))
            or _normalize_uom(item.get("uom"))
        )
        base_uom = (
            _normalize_uom(doc.get("base_uom"))
            or _normalize_uom(item.get("base_uom"))
            or _normalize_uom(item.get("uom_code"))
            or input_uom
        )
        uom_known = bool(input_uom or base_uom)
        conversion_factor = _as_decimal(
            doc.get("conversion_factor") or item.get("uom_conversion_factor") or 1
        )
        if conversion_factor <= 0:
            raise GovernanceViolation("INVALID_UOM_CONVERSION")

        allow_fraction_field = item.get("allow_fraction")
        if allow_fraction_field is None:
            if uom_known:
                allow_fraction = bool(input_uom in FRACTIONAL_UOMS or base_uom in FRACTIONAL_UOMS)
            else:
                allow_fraction = (
                    _as_bool(doc.get("allow_fraction"), default=False) or _decimal_places(qty) > 0
                )
        else:
            allow_fraction = _as_bool(allow_fraction_field, default=False)

        precision = doc.get("quantity_precision")
        if precision is None:
            precision = item.get("uom_precision")
        if precision is None:
            precision = max(_decimal_places(qty), 3 if allow_fraction else 0)
        precision = max(int(precision), 0)

        serial_numbers = _normalize_serials(doc)
        item_serialized = item.get("is_serialized")
        is_serial_item = _as_bool(item_serialized, default=False) or bool(serial_numbers)

        if not allow_fraction and qty != qty.to_integral_value():
            raise GovernanceViolation("FRACTION_NOT_ALLOWED")
        if _decimal_places(qty) > precision:
            raise GovernanceViolation("PRECISION_EXCEEDED")

        base_qty = qty * conversion_factor
        if not allow_fraction and base_qty != base_qty.to_integral_value():
            raise GovernanceViolation("FRACTION_NOT_ALLOWED")

        if serial_numbers:
            allowed_qty = Decimal(len(serial_numbers))
            if qty != allowed_qty:
                raise GovernanceViolation("SERIAL_QTY_MISMATCH")
        elif is_serial_item and _as_bool(item_serialized, default=False) and qty != Decimal("1"):
            raise GovernanceViolation("SERIAL_QTY_MUST_BE_ONE")

        return {
            "counted_qty": float(base_qty),
            "input_qty": float(qty),
            "input_uom": input_uom,
            "base_uom": base_uom,
            "uom_code": _normalize_uom(item.get("uom_code")) or input_uom,
            "uom_name": _normalize_string(item.get("uom_name")) or input_uom,
            "conversion_factor": float(conversion_factor),
            "quantity_precision": precision,
            "allow_fraction": allow_fraction,
            "serial_numbers": serial_numbers,
            "is_serial_item": is_serial_item,
        }

    async def enforce_count_line_business_rules(
        self,
        doc: dict[str, Any],
        *,
        item: Optional[dict[str, Any]] = None,
        db_session: Optional[Any] = None,
    ) -> dict[str, Any]:
        if not isinstance(doc, dict):
            return {}

        item_master = await self.resolve_item_master(doc, item=item, db_session=db_session)
        normalized_qty = self.normalize_quantity_for_item(item=item_master, doc=doc)
        serial_numbers = normalized_qty.get("serial_numbers") or []
        current_line_id = _normalize_string(doc.get("id") or doc.get("_id"))
        normalized_item_code = _normalize_string(
            doc.get("item_code") or doc.get("item_id") or item_master.get("item_code")
        )
        if serial_numbers:
            if not normalized_item_code:
                raise GovernanceViolation("MISSING_ITEM_CODE")
            await self.assert_item_serial_uniqueness(
                normalized_item_code,
                serial_numbers,
                current_line_id=current_line_id,
                db_session=db_session,
            )

        doc.update(
            {
                "item_code": normalized_item_code or doc.get("item_code"),
                "counted_qty": normalized_qty["counted_qty"],
                "input_qty": normalized_qty["input_qty"],
                "input_uom": normalized_qty["input_uom"],
                "base_uom": normalized_qty["base_uom"],
                "uom_code": normalized_qty["uom_code"],
                "uom_name": normalized_qty["uom_name"],
                "conversion_factor": normalized_qty["conversion_factor"],
                "quantity_precision": normalized_qty["quantity_precision"],
                "allow_fraction": normalized_qty["allow_fraction"],
                "serial_numbers": serial_numbers or doc.get("serial_numbers"),
                "is_serial_item": normalized_qty["is_serial_item"],
            }
        )
        return {"item": item_master, "normalized": normalized_qty, "document": doc}

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

        try:
            await self.enforce_count_line_business_rules(doc, db_session=None)
            damaged_qty = _as_decimal(doc.get("damaged_qty"), default="0")
            if damaged_qty < 0:
                errors.append("NEGATIVE_DAMAGE_QUANTITY")
        except GovernanceViolation as exc:
            errors.append(str(exc))

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
                "$match": {
                    "archived": {"$ne": True},
                    "status": {"$not": {"$regex": "^superseded$", "$options": "i"}}
                }
            },
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
                    "archived": {"$ne": True},
                    "$or": [
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
