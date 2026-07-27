import asyncio
import logging
import re
from datetime import date, datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.api.schemas import ERPItem
from backend.auth.dependencies import get_current_user
from backend.error_messages import get_error_message
from backend.services.cache_service import CacheService
from backend.services.inventory_identity_service import InventoryIdentityService
from backend.models.physical_batch import PhysicalBatchQuantities, PhysicalBatchStatus
from backend.models.canonical_serial import SerialStatus
from backend.models.damage_case import (
    DamageCaseStatus,
    DamageDisposition,
    DamageEvidence,
    EvidenceKind,
)
from backend.services.concurrency import ConcurrencyError
from backend.services.physical_batch_service import (
    PhysicalBatchError,
    PhysicalBatchNotFound,
    PhysicalBatchService,
)
from backend.services.canonical_serial_service import (
    CanonicalSerialError,
    CanonicalSerialNotFound,
    CanonicalSerialService,
    DuplicateSerialError,
)
from backend.services.damage_case_service import (
    DamageCaseError,
    DamageCaseNotFound,
    DamageCaseService,
)
from backend.sql_server_connector import SQLServerConnector
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)
router = APIRouter()

_db: Optional[AsyncIOMotorDatabase[Any]] = None
_cache_service: Optional[CacheService] = None
_sql_connector: Optional[SQLServerConnector] = None


class PhysicalBatchCreateRequest(BaseModel):
    batch_number: str = Field(min_length=1, max_length=100)
    location_id: Optional[str] = None
    on_hand: float = Field(default=0, ge=0)
    damaged: float = Field(default=0, ge=0)
    reserved: float = Field(default=0, ge=0)
    manufactured_on: Optional[date] = None
    expires_on: Optional[date] = None
    change_reference: str = Field(min_length=1, max_length=200)


class PhysicalBatchUpdateRequest(BaseModel):
    expected_version: int = Field(ge=0)
    status: Optional[PhysicalBatchStatus] = None
    location_id: Optional[str] = None
    on_hand: Optional[float] = Field(default=None, ge=0)
    damaged: Optional[float] = Field(default=None, ge=0)
    reserved: Optional[float] = Field(default=None, ge=0)
    change_reference: str = Field(min_length=1, max_length=200)


class CanonicalSerialRegisterRequest(BaseModel):
    serial_number: str = Field(min_length=1, max_length=200)
    item_identity_id: str = Field(min_length=1)
    physical_batch_id: Optional[str] = None
    location_id: Optional[str] = None
    change_reference: str = Field(min_length=1, max_length=200)
    source: str = Field(default="SCAN", min_length=1, max_length=50)


class CanonicalSerialImportRecord(BaseModel):
    serial_number: str = Field(min_length=1, max_length=200)
    item_identity_id: str = Field(min_length=1)
    physical_batch_id: Optional[str] = None
    location_id: Optional[str] = None


class CanonicalSerialImportRequest(BaseModel):
    records: list[CanonicalSerialImportRecord] = Field(min_length=1, max_length=1000)
    change_reference: str = Field(min_length=1, max_length=200)


class CanonicalSerialTransitionRequest(BaseModel):
    status: SerialStatus
    expected_version: int = Field(ge=0)
    location_id: Optional[str] = None
    change_reference: str = Field(min_length=1, max_length=200)
    source: str = Field(default="API", min_length=1, max_length=50)


class DamageEvidenceRequest(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    kind: EvidenceKind
    reference: str = Field(min_length=1, max_length=2048)
    content_hash: str = Field(pattern=r"^[a-fA-F0-9]{64}$")
    media_type: Optional[str] = Field(default=None, max_length=100)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DamageCaseCreateRequest(BaseModel):
    item_identity_id: str = Field(min_length=1)
    quantity: float = Field(gt=0)
    disposition: DamageDisposition
    description: str = Field(min_length=1, max_length=2000)
    evidence: list[DamageEvidenceRequest] = Field(min_length=1, max_length=50)
    physical_batch_id: Optional[str] = None
    canonical_serial_id: Optional[str] = None
    location_id: Optional[str] = None
    session_id: Optional[str] = None
    count_line_id: Optional[str] = None
    reason: str = Field(min_length=1, max_length=1000)
    change_reference: str = Field(min_length=1, max_length=200)


class DamageEvidenceAddRequest(DamageEvidenceRequest):
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=1000)
    change_reference: str = Field(min_length=1, max_length=200)


class DamageCaseTransitionRequest(BaseModel):
    status: DamageCaseStatus
    expected_version: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=1000)
    change_reference: str = Field(min_length=1, max_length=200)


def _batch_actor(current_user: dict[str, Any]) -> str:
    return str(
        current_user.get("username")
        or current_user.get("user_id")
        or current_user.get("id")
        or ""
    )


def _batch_response(document: dict[str, Any]) -> dict[str, Any]:
    result = dict(document)
    result.pop("_id", None)
    quantities = dict(result.get("quantities") or {})
    quantities["available"] = (
        float(quantities.get("on_hand") or 0)
        - float(quantities.get("damaged") or 0)
        - float(quantities.get("reserved") or 0)
    )
    result["quantities"] = quantities
    return result


def _serial_response(document: dict[str, Any]) -> dict[str, Any]:
    result = dict(document)
    result.pop("_id", None)
    return result


def _damage_evidence(request: DamageEvidenceRequest, actor: str) -> DamageEvidence:
    return DamageEvidence(
        id=request.id,
        kind=request.kind,
        reference=request.reference,
        content_hash=request.content_hash.lower(),
        media_type=request.media_type,
        captured_at=datetime.now(timezone.utc).replace(tzinfo=None),
        captured_by=actor,
        metadata=request.metadata,
    )


@router.get("/erp/items/identity/{identifier}")
async def resolve_inventory_identity(
    identifier: str,
    current_user: dict = Depends(get_current_user),
):
    """Resolve an item code or any registered barcode alias to one stable identity."""
    del current_user
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    identity = await InventoryIdentityService(_db).resolve(identifier)
    if not identity:
        raise HTTPException(
            status_code=404, detail="Canonical inventory identity not found"
        )
    identity.pop("_id", None)
    return identity


@router.get("/erp/items/{item_identity_id}/physical-batches")
async def list_physical_batches(
    item_identity_id: str,
    current_user: dict = Depends(get_current_user),
):
    del current_user
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    cursor = _db.physical_batches.find({"item_identity_id": item_identity_id}).sort(
        "normalized_batch_number", 1
    )
    return [_batch_response(document) async for document in cursor]


@router.post("/erp/items/{item_identity_id}/physical-batches", status_code=201)
async def create_physical_batch(
    item_identity_id: str,
    request: PhysicalBatchCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        document = await PhysicalBatchService(_db).create(
            item_identity_id=item_identity_id,
            batch_number=request.batch_number,
            location_id=request.location_id,
            quantities=PhysicalBatchQuantities(
                on_hand=request.on_hand,
                damaged=request.damaged,
                reserved=request.reserved,
            ),
            manufactured_on=request.manufactured_on,
            expires_on=request.expires_on,
            actor=_batch_actor(current_user),
            change_reference=request.change_reference,
        )
        return _batch_response(document)
    except (PhysicalBatchError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/erp/physical-batches/{batch_id}")
async def update_physical_batch(
    batch_id: str,
    request: PhysicalBatchUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    service = PhysicalBatchService(_db)
    try:
        before = await service.get(batch_id)
        current = dict(before.get("quantities") or {})
        quantities = None
        if any(
            value is not None
            for value in (request.on_hand, request.damaged, request.reserved)
        ):
            quantities = PhysicalBatchQuantities(
                on_hand=(
                    request.on_hand
                    if request.on_hand is not None
                    else current.get("on_hand", 0)
                ),
                damaged=(
                    request.damaged
                    if request.damaged is not None
                    else current.get("damaged", 0)
                ),
                reserved=(
                    request.reserved
                    if request.reserved is not None
                    else current.get("reserved", 0)
                ),
            )
        document = await service.update(
            batch_id,
            expected_version=request.expected_version,
            actor=_batch_actor(current_user),
            change_reference=request.change_reference,
            quantities=quantities,
            status=request.status,
            location_id=request.location_id,
        )
        return _batch_response(document)
    except PhysicalBatchNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConcurrencyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (PhysicalBatchError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/erp/serials/{serial_number}")
async def resolve_canonical_serial(
    serial_number: str,
    current_user: dict = Depends(get_current_user),
):
    del current_user
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    document = await CanonicalSerialService(_db).resolve(serial_number)
    if not document:
        raise HTTPException(status_code=404, detail="Canonical serial not found")
    return _serial_response(document)


@router.post("/erp/serials", status_code=201)
async def register_canonical_serial(
    request: CanonicalSerialRegisterRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        document = await CanonicalSerialService(_db).register(
            serial_number=request.serial_number,
            item_identity_id=request.item_identity_id,
            physical_batch_id=request.physical_batch_id,
            location_id=request.location_id,
            actor=_batch_actor(current_user),
            change_reference=request.change_reference,
            source=request.source,
        )
        return _serial_response(document)
    except DuplicateSerialError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CanonicalSerialError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/erp/serials/import")
async def import_canonical_serials(
    request: CanonicalSerialImportRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    records = [record.model_dump() for record in request.records]
    return await CanonicalSerialService(_db).import_serials(
        records,
        actor=_batch_actor(current_user),
        change_reference=request.change_reference,
    )


@router.patch("/erp/serials/{serial_id}")
async def transition_canonical_serial(
    serial_id: str,
    request: CanonicalSerialTransitionRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        document = await CanonicalSerialService(_db).transition(
            serial_id,
            status=request.status,
            expected_version=request.expected_version,
            actor=_batch_actor(current_user),
            change_reference=request.change_reference,
            location_id=request.location_id,
            source=request.source,
        )
        return _serial_response(document)
    except CanonicalSerialNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConcurrencyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except CanonicalSerialError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/erp/damage-cases/{case_id}")
async def get_damage_case(
    case_id: str,
    current_user: dict = Depends(get_current_user),
):
    del current_user
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        return _serial_response(await DamageCaseService(_db).get(case_id))
    except DamageCaseNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/erp/damage-cases", status_code=201)
async def create_damage_case(
    request: DamageCaseCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    actor = _batch_actor(current_user)
    try:
        document = await DamageCaseService(_db).create(
            item_identity_id=request.item_identity_id,
            quantity=request.quantity,
            disposition=request.disposition,
            description=request.description,
            evidence=[_damage_evidence(row, actor) for row in request.evidence],
            actor=actor,
            reason=request.reason,
            change_reference=request.change_reference,
            physical_batch_id=request.physical_batch_id,
            canonical_serial_id=request.canonical_serial_id,
            location_id=request.location_id,
            session_id=request.session_id,
            count_line_id=request.count_line_id,
        )
        return _serial_response(document)
    except (DamageCaseError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/erp/damage-cases/{case_id}/evidence")
async def add_damage_case_evidence(
    case_id: str,
    request: DamageEvidenceAddRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    actor = _batch_actor(current_user)
    try:
        document = await DamageCaseService(_db).add_evidence(
            case_id,
            evidence=_damage_evidence(request, actor),
            expected_version=request.expected_version,
            actor=actor,
            reason=request.reason,
            change_reference=request.change_reference,
        )
        return _serial_response(document)
    except DamageCaseNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConcurrencyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (DamageCaseError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/erp/damage-cases/{case_id}")
async def transition_damage_case(
    case_id: str,
    request: DamageCaseTransitionRequest,
    current_user: dict = Depends(get_current_user),
):
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    try:
        document = await DamageCaseService(_db).transition(
            case_id,
            status=request.status,
            expected_version=request.expected_version,
            actor=_batch_actor(current_user),
            reason=request.reason,
            change_reference=request.change_reference,
        )
        return _serial_response(document)
    except DamageCaseNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConcurrencyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DamageCaseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def init_erp_api(
    db: AsyncIOMotorDatabase,
    cache_service: CacheService,
    sql_connector: Optional[SQLServerConnector] = None,
):
    global _db, _cache_service, _sql_connector
    _db = db
    _cache_service = cache_service
    _sql_connector = sql_connector


_ALPHANUMERIC_PATTERN = re.compile(r"^[A-Z0-9_\-]+$")


def _normalize_barcode_input(
    barcode: str, *, allow_alphanumeric: bool = True, strict_numeric: bool = True
) -> str:
    """Normalize and validate barcode or item code input.

    Rules derived from tests and existing usage:
    - Empty values are rejected with 400.
    - Numeric barcodes must be exactly 6 digits and start with 51, 52 or 53
      (when strict_numeric is True).
    - When ``allow_alphanumeric`` is True, non-numeric item codes such as
      "TEST001" are allowed for endpoints like refresh-stock.
    """

    logger.info(
        "Normalizing barcode: %s, allow_alphanumeric=%s, strict_numeric=%s",
        sanitize_for_logging(barcode),
        allow_alphanumeric,
        strict_numeric,
    )
    if not barcode or not barcode.strip():
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Barcode cannot be empty",
                "error_code": "INVALID_BARCODE_EMPTY",
            },
        )

    normalized = barcode.strip().upper()

    # Strict rules for numeric barcodes used in public barcode endpoints
    if strict_numeric and normalized.isdigit():
        if len(normalized) != 6:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Numeric barcode must be exactly 6 digits",
                    "barcode": normalized,
                    "error_code": "INVALID_BARCODE_LENGTH",
                },
            )

        if normalized[:2] not in {"51", "52", "53"}:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid barcode prefix. Allowed prefixes are 51, 52, 53.",
                    "barcode": normalized,
                    "error_code": "INVALID_BARCODE_PREFIX",
                },
            )

        return normalized

    # For barcode endpoints we do not allow non-numeric values
    if not allow_alphanumeric and not normalized.isdigit():
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Barcode must be numeric for this endpoint",
                "barcode": normalized,
                "error_code": "INVALID_BARCODE_FORMAT",
            },
        )

    # Alphanumeric validation for item_code-style inputs (e.g. refresh-stock)
    if _ALPHANUMERIC_PATTERN.fullmatch(normalized):
        if len(normalized) < 2:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Item code must be at least 2 characters",
                    "barcode": normalized,
                    "error_code": "INVALID_ITEM_CODE_LENGTH",
                },
            )
        if len(normalized) > 50:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Item code is too long (max 50 characters)",
                    "barcode": normalized,
                    "error_code": "INVALID_ITEM_CODE_LENGTH",
                },
            )
        return normalized

    raise HTTPException(
        status_code=400,
        detail={
            "message": "Invalid barcode format. Use letters, numbers, hyphens, or underscores.",
            "barcode": normalized,
            "error_code": "INVALID_BARCODE_FORMAT",
        },
    )


@router.get("/erp/items/barcode/{barcode}", response_model=ERPItem)
async def get_item_by_barcode(
    barcode: str, current_user: dict = Depends(get_current_user)
):
    """
    Get item details by barcode from MongoDB.
    """
    if _db is None or _cache_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # For barcode lookups, we only accept numeric barcodes with valid prefixes
    normalized_barcode = _normalize_barcode_input(
        barcode, allow_alphanumeric=False, strict_numeric=True
    )

    # Check cache first
    cached_item = await _cache_service.get("items", normalized_barcode)
    if cached_item:
        logger.debug("Item found in cache: %s", sanitize_for_logging(barcode))
        return ERPItem(**cached_item)

    # Fallback to MongoDB
    regex_match = {"$regex": f"^{re.escape(normalized_barcode)}$", "$options": "i"}
    item = await _db.erp_items.find_one(
        {
            "$or": [
                {"barcode": normalized_barcode},
                {"autobarcode": normalized_barcode},
                {"manual_barcode": normalized_barcode},
                {"item_code": normalized_barcode},
                {"item_code": regex_match},
            ]
        }
    )
    if not item:
        error = get_error_message("DB_ITEM_NOT_FOUND", {"barcode": barcode})
        logger.warning(
            "Item not found in MongoDB: barcode=%s",
            sanitize_for_logging(normalized_barcode),
        )
        raise HTTPException(
            status_code=error["status_code"],
            detail={
                "message": error["message"],
                "detail": f"{error['detail']} Barcode: {normalized_barcode}.",
                "code": error["code"],
                "category": error["category"],
                "barcode": normalized_barcode,
                "source": "mongodb",
            },
        )

    # Cache for 1 hour
    await _cache_service.set("items", normalized_barcode, item, ttl=3600)
    logger.debug(
        "Item fetched from MongoDB: barcode=%s",
        sanitize_for_logging(normalized_barcode),
    )

    return ERPItem(**item)


@router.post("/erp/items/{item_code}/refresh-stock")
async def refresh_item_stock(
    request: Request, item_code: str, current_user: dict = Depends(get_current_user)
):
    """
    Refresh item stock from ERP and update MongoDB
    (Now just returns the data from MongoDB as ERP is disabled)
    """
    if _db is None or _cache_service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # For refresh-stock we accept both numeric barcodes and item codes
    # We disable strict numeric checks because item codes might be numeric but not follow barcode rules
    normalized_code = _normalize_barcode_input(item_code, strict_numeric=False)

    regex_match = {"$regex": f"^{re.escape(normalized_code)}$", "$options": "i"}
    item = await _db.erp_items.find_one(
        {
            "$or": [
                {"item_code": normalized_code},
                {"item_code": regex_match},
                {"barcode": normalized_code},
                {"manual_barcode": normalized_code},
            ]
        }
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    return {
        "success": True,
        "item": ERPItem(**item),
        "message": "Stock from MongoDB (ERP connection is disabled)",
    }


@router.get("/erp/config")
async def get_erp_config(current_user: dict = Depends(get_current_user)):
    """
    Get ERP configuration and connection status for the frontend.
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    config = await _db.erp_config.find_one({}, {"_id": 0})

    # Get health status from global service
    from backend.core.globals import database_health_service

    sql_health = "unknown"
    error_msg = None

    if database_health_service:
        # Use existing health check if available, or trigger a fresh one
        health = await database_health_service.check_sql_server_health()
        if health.get("status") == "healthy":
            sql_health = "connected"
        else:
            sql_health = "error"
            error_msg = health.get("error")
    else:
        sql_health = "not_configured"

    if not config:
        return {
            "configured": False,
            "use_sql_server": False,
            "connection_status": "not_configured",
            "error": "ERP configuration not found in database",
        }

    return {
        "configured": True,
        "use_sql_server": config.get("use_sql_server", False),
        "connection_status": sql_health,
        "host": config.get("host"),
        "database": config.get("database"),
        "port": config.get("port"),
        "last_check": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(),
        "error": error_msg,
    }


@router.get("/item-batches/{item_code}")
async def get_item_batches(
    item_code: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get batches/variants for a specific item code.
    Used by the frontend to show all variants (same item code, different barcodes/stock).
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    normalized_code = _normalize_barcode_input(item_code, strict_numeric=False)
    source = "mongodb_offline_fallback"
    batches: list[dict[str, Any]] = []

    if _sql_connector is not None:
        try:
            if getattr(_sql_connector, "connection", None):
                # PERF-10: offload blocking pyodbc call so it never stalls the event loop.
                sql_batches = await asyncio.to_thread(
                    _sql_connector.get_item_batches, normalized_code
                )
                if isinstance(sql_batches, list):
                    batches = sql_batches
                    source = "sql_server"
        except Exception as sql_err:
            logger.warning(
                "SQL batch fetch failed for '%s': %s",
                sanitize_for_logging(normalized_code),
                sanitize_for_logging(str(sql_err)),
            )

    if not batches:
        regex_match = {"$regex": f"^{re.escape(normalized_code)}$", "$options": "i"}
        query = {"$or": [{"item_code": normalized_code}, {"item_code": regex_match}]}
        cursor = _db.erp_items.find(query)
        mongo_batches = await cursor.to_list(length=100)
        batches = mongo_batches if isinstance(mongo_batches, list) else []
        source = "mongodb_offline_fallback"

    formatted_batches = []
    for batch in batches:
        barcode = batch.get("barcode") or batch.get("auto_barcode") or ""
        formatted_batches.append(
            {
                "batch_id": batch.get("batch_id"),
                "batch_no": batch.get("batch_no", "DEFAULT"),
                "item_code": batch.get("item_code"),
                "barcode": barcode,
                "item_name": batch.get("item_name"),
                "stock_qty": batch.get("stock_qty", 0),
                "mrp": batch.get("mrp"),
                "manufacturing_date": batch.get("mfg_date")
                or batch.get("manufacturing_date"),
                "expiry_date": batch.get("expiry_date"),
                "warehouse_id": batch.get("warehouse_id"),
                "warehouse_name": batch.get("warehouse_name"),
                "warehouse": batch.get("warehouse") or batch.get("warehouse_name"),
            }
        )

    def _stock_value(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    formatted_batches = sorted(
        formatted_batches,
        key=lambda batch: (
            -_stock_value(batch.get("stock_qty")),
            str(batch.get("batch_no") or ""),
        ),
    )

    return {
        "batches": formatted_batches,
        "source": source,
        "total_batches": len(formatted_batches),
        "item_identifier": normalized_code,
    }


@router.post("/erp/test")
async def test_erp_connection(current_user: dict = Depends(get_current_user)):
    """
    Manually test the ERP connection.
    """
    from backend.core.globals import database_health_service

    if not database_health_service:
        raise HTTPException(status_code=503, detail="Health service not initialized")

    health = await database_health_service.check_sql_server_health()

    if health.get("status") == "healthy":
        return {
            "status": "connected",
            "message": health.get("note", "Successfully connected to ERP SQL Server"),
        }
    else:
        return {
            "status": "error",
            "message": health.get("error", "Failed to connect to ERP SQL Server"),
        }


@router.get("/erp/items")
async def get_all_items(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
):
    """
    Get all items or search items from MongoDB
    """
    if _db is None:
        raise HTTPException(status_code=503, detail="Service not initialized")

    # If search query provided, search items
    if search and search.strip():
        search_term = search.strip()

        # Search in MongoDB
        items_cursor = _db.erp_items.find(
            {
                "$or": [
                    {"item_name": {"$regex": search_term, "$options": "i"}},
                    {"item_code": {"$regex": search_term, "$options": "i"}},
                    {"barcode": {"$regex": search_term, "$options": "i"}},
                    {"manual_barcode": {"$regex": search_term, "$options": "i"}},
                ]
            }
        )
        total = await _db.erp_items.count_documents(
            {
                "$or": [
                    {"item_name": {"$regex": search_term, "$options": "i"}},
                    {"item_code": {"$regex": search_term, "$options": "i"}},
                    {"barcode": {"$regex": search_term, "$options": "i"}},
                    {"manual_barcode": {"$regex": search_term, "$options": "i"}},
                ]
            }
        )
        skip = (page - 1) * page_size
        items = await items_cursor.skip(skip).limit(page_size).to_list(page_size)

        # Ensure all items have required fields with defaults
        normalized_items = []
        for item in items:
            if "category" not in item:
                item["category"] = "General"
            if "warehouse" not in item:
                item["warehouse"] = "Main"
            normalized_items.append(item)

        return {
            "items": [ERPItem(**item) for item in normalized_items],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
                "has_next": skip + page_size < total,
                "has_prev": page > 1,
            },
        }

    # No search: return all items from MongoDB with pagination
    total = await _db.erp_items.count_documents({})
    skip = (page - 1) * page_size
    items_cursor = _db.erp_items.find().sort("item_name", 1).skip(skip).limit(page_size)
    items = await items_cursor.to_list(page_size)

    return {
        "items": [ERPItem(**item) for item in items],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "has_next": skip + page_size < total,
            "has_prev": page > 1,
        },
    }


@router.get("/items/search")
async def search_items_compatibility(
    query: Optional[str] = Query(
        None, description="Search term (legacy param 'query')"
    ),
    search: Optional[str] = Query(None, description="Alternate search param"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(50, ge=1, le=100, description="Items per page"),
    current_user: dict = Depends(get_current_user),
):
    """
    Compatibility endpoint for legacy clients that call `/api/items/search?query=...`.
    Reuses the new `/api/erp/items?search=...` implementation.
    """
    search_term = (query or search or "").strip()
    if not search_term:
        raise HTTPException(
            status_code=400,
            detail="Missing search term. Provide ?query= or ?search= parameter.",
        )

    return await get_all_items(
        search=search_term,
        current_user=current_user,
        page=page,
        page_size=page_size,
    )
