from typing import Any
from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user
from backend.services.variance_service import VarianceService, get_variance_service

router = APIRouter()


@router.get("/variance-reasons", deprecated=True)
async def get_variance_reasons(
    current_user: dict = Depends(get_current_user),
) -> dict[str, list[dict[str, str]]]:
    """Get list of variance reasons"""
    # Return common variance reasons
    return {
        "reasons": [
            {"id": "damaged", "label": "Damaged"},
            {"id": "expired", "label": "Expired"},
            {"id": "theft", "label": "Theft"},
            {"id": "misplaced", "label": "Misplaced"},
            {"id": "data_entry_error", "label": "Data Entry Error"},
            {"id": "supplier_shortage", "label": "Supplier Shortage"},
            {"id": "other", "label": "Other"},
        ]
    }


@router.get("/variance/trend", deprecated=True)
async def get_variance_trend(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
    variance_service: VarianceService = Depends(get_variance_service),
) -> dict[str, Any]:
    """Get variance trend data for the last N days"""
    return {"success": True, "data": await variance_service.get_variance_trend(days)}
