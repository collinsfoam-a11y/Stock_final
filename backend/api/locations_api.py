import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends  # type: ignore

from backend.auth.dependencies import get_current_user
from backend.services.locations_service import LocationsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/locations", tags=["Locations"])


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


def _get_locations_service() -> LocationsService:
    return LocationsService(
        showroom_defaults=_SHOWROOM_DEFAULTS,
        godown_defaults=_GODOWN_DEFAULTS,
    )


@router.get("/warehouses", response_model=list[dict[str, Any]])
async def get_warehouses(
    zone: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    locations_service: LocationsService = Depends(_get_locations_service),
):
    """Fetch warehouses with priority.

    SQL -> Mongo -> default (create missing in Mongo).
    """
    return await locations_service.get_warehouses(zone)


@router.get("/zones", response_model=list[dict[str, Any]])
def get_zones(
    current_user: dict = Depends(get_current_user),
    locations_service: LocationsService = Depends(_get_locations_service),
):
    """Fetch all zones (floors) from ERP, with default offline zones."""
    return locations_service.get_zones()
