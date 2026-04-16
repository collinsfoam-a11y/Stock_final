"""
Reconciliation API - Handles session-wide aggregation of counts to calculate true variance.
"""

import logging
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/reconciliation", tags=["Reconciliation"])


def _get_db() -> AsyncIOMotorDatabase:
    """Helper to get DB, useful for mocking."""
    return get_db()


@router.get("/session/{session_id}/summary")
async def get_session_reconciliation_summary(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get aggregated reconciliation summary for a session.
    Aggregates all counts for each item to calculate TRUE variance against ERP stock.
    """
    db = _get_db()

    try:
        # 1. Validation: Check if session exists
        session = await db.sessions.find_one({"id": session_id})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # 2. Aggregation Pipeline
        pipeline: list[dict[str, Any]] = [
            # Match counts for this session
            {"$match": {"session_id": session_id}},
            # Group by item_code to aggregate total counted qty
            {
                "$group": {
                    "_id": "$item_code",
                    "item_name": {"$first": "$item_name"},
                    "barcode": {"$first": "$barcode"},
                    "total_counted": {"$sum": "$counted_qty"},
                    "last_counted_at": {"$max": "$counted_at"},
                    # Collect location details for drill-down
                    "locations": {
                        "$push": {
                            "floor": "$floor_no",
                            "rack": "$rack_no",
                            "qty": "$counted_qty",
                            "line_id": "$id",
                        }
                    },
                }
            },
            # Lookup ERP Item to get System Stock
            # Note: We match on item_code.
            {
                "$lookup": {
                    "from": "erp_items",
                    "localField": "_id",
                    "foreignField": "item_code",
                    "as": "erp_data",
                }
            },
            # Unwind the ERP data (should be 1-to-1 usually)
            {"$unwind": {"path": "$erp_data", "preserveNullAndEmptyArrays": True}},
            # Project final shape and calculate TRURE VARIANCE
            {
                "$project": {
                    "item_code": "$_id",
                    "item_name": {"$ifNull": ["$item_name", "$erp_data.item_name"]},
                    "barcode": {"$ifNull": ["$barcode", "$erp_data.barcode"]},
                    "total_counted": 1,
                    "system_stock": {"$ifNull": ["$erp_data.stock_qty", 0]},
                    "variance": {
                        "$subtract": ["$total_counted", {"$ifNull": ["$erp_data.stock_qty", 0]}]
                    },
                    "locations": 1,
                    "last_counted_at": 1,
                    "mrp": "$erp_data.mrp",
                }
            },
            # Sort by variance (most discrepancy first)
            {"$sort": {"variance": 1}},
        ]

        results = await db.count_lines.aggregate(pipeline).to_list(length=None)

        # Post-processing to add status labels
        summary_stats = {
            "total_items_counted": len(results),
            "items_with_variance": 0,
            "items_matched": 0,
            "total_variance_qty": 0,
        }

        formatted_results = []

        for item in results:
            variance = item["variance"]

            status = "MATCH"
            if variance > 0:
                status = "SURPLUS"
            elif variance < 0:
                status = "MISSING"

            item["status"] = status

            # Formate date
            if isinstance(item.get("last_counted_at"), datetime):
                item["last_counted_at"] = item["last_counted_at"].isoformat()

            # Stats updates
            if variance != 0:
                summary_stats["items_with_variance"] += 1
                summary_stats["total_variance_qty"] += variance
            else:
                summary_stats["items_matched"] += 1

            formatted_results.append(item)

        return {
            "success": True,
            "session_id": session_id,
            "stats": summary_stats,
            "items": formatted_results,
        }

    except Exception as e:
        logger.error(f"Error generating reconciliation for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {str(e)}")
