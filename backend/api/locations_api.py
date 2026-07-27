import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException  # type: ignore

from backend.auth.dependencies import get_current_user
from backend.db.runtime import get_db
from backend.models.location import LocationCreate, LocationRecord, LocationTreeNode
from pydantic import BaseModel, Field
from backend.services.location_service import LocationDomainError, LocationService
from backend.sql_server_connector import sql_connector
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/locations", tags=["Locations"])


class GovernedLocationCreate(LocationCreate):
    reason: str = Field(min_length=3, max_length=500)
    change_reference: str = Field(min_length=1, max_length=160)


_SHOWROOM_DEFAULTS: list[dict[str, str]] = [
    {
        "warehouse_name": "Ground Floor",
        "id": "fl_ground",
        "zone": "showroom",
    },
    {
        "warehouse_name": "First Floor",
        "id": "fl_first",
        "zone": "showroom",
    },
    {
        "warehouse_name": "Second Floor",
        "id": "fl_second",
        "zone": "showroom",
    },
]

_GODOWN_DEFAULTS: list[dict[str, str]] = [
    {
        "warehouse_name": "Main Godown",
        "id": "wh_main",
        "zone": "godown",
    },
    {
        "warehouse_name": "Top Godown",
        "id": "wh_top",
        "zone": "godown",
    },
    {
        "warehouse_name": "Damage Area",
        "id": "wh_damage",
        "zone": "godown",
    },
]

_ALL_WAREHOUSE_DEFAULTS: list[dict[str, str]] = [*_SHOWROOM_DEFAULTS, *_GODOWN_DEFAULTS]


def _defaults_for_zone(zone: Optional[str]) -> list[dict[str, str]]:
    if not zone:
        return [dict(item) for item in _ALL_WAREHOUSE_DEFAULTS]

    zone_normalized = zone.lower()
    if "showroom" in zone_normalized:
        return [dict(item) for item in _SHOWROOM_DEFAULTS]
    if "godown" in zone_normalized or "down" in zone_normalized:
        return [dict(item) for item in _GODOWN_DEFAULTS]
    return []


def _sanitize_warehouse_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sanitized: list[dict[str, Any]] = []
    for doc in docs:
        item = {k: v for k, v in doc.items() if k != "_id"}
        if "id" not in item and "_id" in doc:
            item["id"] = str(doc["_id"])
        sanitized.append(item)
    return sanitized


def _filter_sql_warehouses(
    warehouses: list[dict[str, Any]], zone: Optional[str]
) -> list[dict[str, Any]]:
    if not zone:
        return warehouses

    zone_normalized = zone.strip().lower()
    filtered = [w for w in warehouses if zone_normalized in w.get("warehouse_name", "").lower()]
    if filtered:
        return filtered
    if "showroom" in zone_normalized or "godown" in zone_normalized:
        return _defaults_for_zone(zone)
    return filtered


def _get_mongo_db_or_none() -> Optional[Any]:
    try:
        return get_db()
    except RuntimeError:
        return None


async def _fetch_mongo_warehouses(db: Any, zone: Optional[str]) -> list[dict[str, Any]]:
    query: dict[str, Any] = {}
    if zone:
        query["zone"] = {"$regex": zone, "$options": "i"}
    return await db["warehouses"].find(query).to_list(length=50)


async def _seed_default_warehouses(
    db: Any, defaults: list[dict[str, str]], zone: Optional[str]
) -> list[dict[str, Any]]:
    # insert_many modifies defaults in-place adding '_id'
    await db["warehouses"].insert_many(defaults)
    logger.info(
        "Seeded default warehouses into MongoDB for zone %s",
        sanitize_for_logging(zone or "*"),
    )
    return _sanitize_warehouse_docs(defaults)


@router.get("/tree", response_model=list[LocationTreeNode])
async def get_location_tree(
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Return the canonical hierarchy for picker and breadcrumb clients."""
    del current_user
    return await LocationService(db).tree()


@router.get("/resolve/{identifier}", response_model=LocationRecord)
async def resolve_location(
    identifier: str,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Resolve a stable ID or a legacy warehouse/floor/rack identifier."""
    del current_user
    location = await LocationService(db).resolve(identifier)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


@router.post("", response_model=LocationRecord, status_code=201)
async def create_location(
    payload: GovernedLocationCreate,
    current_user: dict = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Create a governed hierarchy node; flat legacy APIs remain read-compatible."""
    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    try:
        location_payload = LocationCreate.model_validate(
            payload.model_dump(exclude={"reason", "change_reference"})
        )
        return await LocationService(db).create(
            location_payload,
            actor=current_user["username"],
            reason=payload.reason,
            change_reference=payload.change_reference,
        )
    except LocationDomainError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/warehouses", response_model=list[dict[str, Any]])
async def get_warehouses(
    zone: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Fetch warehouses with priority.

    SQL -> Mongo -> default (create missing in Mongo).
    """
    defaults = _defaults_for_zone(zone)
    try:
        if sql_connector.test_connection():
            warehouses = _filter_sql_warehouses(sql_connector.get_all_warehouses(), zone)
            if warehouses:
                return warehouses

        logger.warning("SQL unavailable or empty result, falling back to Mongo/default")
        db = _get_mongo_db_or_none()
        if db is None:
            logger.warning("MongoDB not initialized; returning default warehouses")
            return defaults

        mongo_warehouses = await _fetch_mongo_warehouses(db, zone)
        if not mongo_warehouses:
            if defaults:
                return await _seed_default_warehouses(db, defaults, zone)
            return []

        return _sanitize_warehouse_docs(mongo_warehouses)

    except Exception as e:
        logger.error("Error fetching warehouses: %s", sanitize_for_logging(str(e)))
        return defaults


@router.get("/zones", response_model=list[dict[str, Any]])
def get_zones(current_user: dict = Depends(get_current_user)):
    """Fetch all zones (floors) from ERP, with offline fallback"""
    try:
        # Check if ERP sync is enabled/connected
        if sql_connector.test_connection():
            zones = sql_connector.get_all_zones()
            return zones

        # Offline Fallback
        logger.warning("SQL Server unavailable, returning default offline zones")
        return [
            {"zone_name": "Showroom", "id": "zone_showroom"},
            {"zone_name": "Godown", "id": "zone_godown"},
        ]

    except Exception as e:
        logger.error("Error fetching zones: %s", sanitize_for_logging(str(e)))
        # In case of any error (even unexpected), fallback for development
        return [
            {"zone_name": "Showroom", "id": "zone_showroom"},
            {"zone_name": "Godown", "id": "zone_godown"},
        ]
