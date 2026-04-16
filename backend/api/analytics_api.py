"""
Analytics API - Exposes KPIs and Heatmaps
"""

import logging
from typing import Optional
from fastapi import APIRouter, Query
from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.heatmap_service import HeatmapService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/analytics/heatmap")
async def get_heatmap(
    session_id: Optional[str] = Query(None),
    current_user: dict = require_permission(Permission.REPORT_VIEW),
):
    """
    Get accuracy heatmap data for visualization.
    Rule 10 KPI Enforcement.
    """
    db = get_db()
    heatmap_service = HeatmapService(db)

    data = await heatmap_service.get_accuracy_heatmap(session_id)

    return {
        "success": True,
        "heatmap": data,
        "summary": {
            "critical_zones": [d["zone"] for d in data if d["accuracy_score"] < 80],
            "total_impact": sum(d["impact"] for d in data),
        },
    }
