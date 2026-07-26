"""Pure value objects for the count-line domain.

No framework or DB imports allowed in this file (see package docstring).
These mirror concepts that exist today in backend/api/schemas.py
(CountLineCreate) and backend/api/count_lines_routes.py
(_build_count_line_document, _evaluate_duplicate_context), extracted so
they can be reasoned about and tested independently of FastAPI/Mongo.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class LocationContext:
    """Mandatory per BSR rule #10: location context is mandatory.

    location_id/floor_id/rack_id mirror CountLineCreate's canonical
    location fields. zone/shelf are included for forward compatibility
    with the BSR's requested semantic-identity field list (see
    SemanticIdentity below) but are not currently captured anywhere in the
    production request schema -- see the BSR item-parameter persistence
    matrix for that gap; this value object does not fabricate data for
    fields the system doesn't collect today.
    """

    location_id: str
    floor_id: str
    rack_id: str
    floor_no: str | None = None
    rack_no: str | None = None
    zone: str | None = None
    shelf: str | None = None

    def __post_init__(self) -> None:
        if not self.location_id or not self.floor_id or not self.rack_id:
            raise ValueError("LocationContext requires location_id, floor_id, and rack_id")


@dataclass(frozen=True)
class UomContext:
    """Groups the UOM fields CountLineCreate captures (input_uom, base_uom,
    uom_code, uom_name, conversion_factor, quantity_precision).

    Note (BSR Priority #1 finding): in production, uom_code/uom_name end
    up server-authoritative -- sourced from the ERP item master via
    ValidationService.normalize_quantity_for_item, falling back to the
    request's input_uom only when the item master has no UOM of its own.
    This value object just carries whatever values it's constructed with;
    resolving the authoritative source is an application/infrastructure
    concern, not modeled here.
    """

    input_uom: str | None = None
    base_uom: str | None = None
    uom_code: str | None = None
    uom_name: str | None = None
    conversion_factor: float = 1.0
    quantity_precision: int | None = None


@dataclass(frozen=True)
class ItemIdentity:
    """What identifies the physical item being counted, independent of
    where/how it was counted. item_id is included for the BSR's requested
    field list; CountLineCreate has no distinct item_id field today (only
    item_code), so it stays None for current production data."""

    item_code: str
    item_id: str | None = None
    barcode: str | None = None
    batch_id: str | None = None
    batch_no: str | None = None
    serial_no: str | None = None


@dataclass(frozen=True)
class SemanticIdentity:
    """The fields that determine whether two count-line submissions are
    the 'same' logical count. This is the single source of truth that
    _build_semantic_hash (count_line_write_service.py) and
    _evaluate_duplicate_context (count_lines_routes.py) each currently
    reimplement separately in production -- unifying the *shape* here
    (not yet the production call sites; see package docstring) means
    there's exactly one place to reason about identity when it changes.

    hash_key() intentionally hashes only the subset of fields production's
    _build_semantic_hash currently uses (session_id, item_code, location_id,
    counted_qty, version, batch_id) -- see
    test_semantic_identity_parity.py, which proves this matches production
    byte-for-byte for those fields. The remaining fields requested by the
    BSR's semantic-identity field list (item_id, barcode, batch_no,
    serial_no, warehouse_id, floor, zone, rack, shelf) are captured here
    for forward-looking identity-policy evolution (e.g. a future
    serial-aware or batch_no-aware hash) but are deliberately NOT part of
    hash_key() today, because production doesn't use them for the
    semantic-hash unique-index check either. Including them in the hash
    without a matching production change would silently create two
    different, disagreeing definitions of "duplicate".
    """

    session_id: str
    item_code: str
    counted_qty: float
    version: int
    location_id: str | None = None
    item_id: str | None = None
    barcode: str | None = None
    batch_id: str | None = None
    batch_no: str | None = None
    serial_no: str | None = None
    warehouse_id: str | None = None
    floor: str | None = None
    zone: str | None = None
    rack: str | None = None
    shelf: str | None = None

    def hash_key(self) -> str:
        """Byte-for-byte identical algorithm to
        count_line_write_service._build_semantic_hash for the fields
        production currently hashes. See test_semantic_identity_parity.py.
        """
        payload = {
            "session_id": str(self.session_id or ""),
            "item_id": str(self.item_code or self.item_id or ""),
            "location_id": str(self.location_id or ""),
            "counted_qty": float(self.counted_qty or 0.0),
            "version": int(self.version or 1),
            "batch_id": str(self.batch_id or ""),
        }
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
