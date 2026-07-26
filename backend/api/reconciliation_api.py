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
from backend.services.canonical_inventory import build_session_lookup
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/reconciliation", tags=["Reconciliation"])


def _safe_log_value(value: Any, *, max_length: int = 120) -> str:
    return sanitize_for_logging("" if value is None else str(value), max_length=max_length)


def _user_can_view_session(session: dict[str, Any], current_user: dict[str, Any]) -> bool:
    role = str(current_user.get("role") or "").strip().lower()
    if role in {"admin", "supervisor"}:
        return True

    username = str(current_user.get("username") or "").strip()
    if not username:
        return False
    session_owner = str(session.get("staff_user") or session.get("user_id") or "").strip()
    return bool(session_owner) and session_owner == username


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
    Aggregates all non-superseded count lines and reports:
    - count_variance = physical - baseline
    - erp_drift = current_sql - baseline
    - final_gap = physical - current_sql
    """
    db = _get_db()

    try:
        # 1. Validation: Check if session exists
        session = await db.sessions.find_one(build_session_lookup(session_id))
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _user_can_view_session(session, current_user):
            raise HTTPException(status_code=403, detail="Not authorized to view this session")

        # 2. Aggregation Pipeline
        pipeline: list[dict[str, Any]] = [
            # Match active (non-superseded) counts for this session
            {
                "$match": {
                    "session_id": session_id,
                    "status": {"$nin": ["SUPERSEDED", "superseded"]},
                    "$or": [
                        {"superseded_by_version_id": {"$exists": False}},
                        {"superseded_by_version_id": {"$in": [None, ""]}},
                    ],
                }
            },
            # Group by item_code to aggregate total counted qty
            {
                "$group": {
                    "_id": "$item_code",
                    "item_name": {"$first": "$item_name"},
                    "barcode": {"$first": "$barcode"},
                    "total_counted": {"$sum": "$counted_qty"},
                    "baseline_qty": {"$max": {"$ifNull": ["$erp_qty", 0]}},
                    "baseline_values": {"$addToSet": {"$ifNull": ["$erp_qty", 0]}},
                    "baseline_hash": {"$first": "$baseline_hash"},
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
            # Project canonical reconciliation metrics.
            {
                "$project": {
                    "item_code": "$_id",
                    "item_name": {"$ifNull": ["$item_name", "$erp_data.item_name"]},
                    "barcode": {"$ifNull": ["$barcode", "$erp_data.barcode"]},
                    "total_counted": 1,
                    "baseline_qty": 1,
                    "baseline_values": 1,
                    "baseline_conflict": {"$gt": [{"$size": "$baseline_values"}, 1]},
                    "baseline_hash": 1,
                    "system_stock": {"$ifNull": ["$erp_data.stock_qty", 0]},
                    "count_variance": {"$subtract": ["$total_counted", "$baseline_qty"]},
                    "erp_drift": {
                        "$subtract": [{"$ifNull": ["$erp_data.stock_qty", 0]}, "$baseline_qty"]
                    },
                    "final_gap": {
                        "$subtract": ["$total_counted", {"$ifNull": ["$erp_data.stock_qty", 0]}]
                    },
                    "locations": 1,
                    "last_counted_at": 1,
                    "mrp": "$erp_data.mrp",
                }
            },
            {"$addFields": {"abs_count_variance": {"$abs": "$count_variance"}}},
            # Sort by count variance severity (largest discrepancy first)
            {"$sort": {"abs_count_variance": -1, "item_code": 1}},
        ]

        results = await db.count_lines.aggregate(pipeline).to_list(length=None)

        # Post-processing to add status labels
        summary_stats = {
            "total_items_counted": len(results),
            "items_with_variance": 0,
            "items_matched": 0,
            "total_variance_qty": 0.0,
            "total_erp_drift_qty": 0.0,
            "total_final_gap_qty": 0.0,
            "items_with_baseline_conflict": 0,
        }

        formatted_results = []

        for item in results:
            count_variance = float(item.get("count_variance") or 0.0)
            erp_drift = float(item.get("erp_drift") or 0.0)
            final_gap = float(item.get("final_gap") or 0.0)
            item["count_variance"] = count_variance
            item["erp_drift"] = erp_drift
            item["final_gap"] = final_gap
            # Backward compatibility for callers expecting `variance`.
            item["variance"] = count_variance

            status = "MATCH"
            if count_variance > 0:
                status = "SURPLUS"
            elif count_variance < 0:
                status = "MISSING"

            item["status"] = status

            # Formate date
            if isinstance(item.get("last_counted_at"), datetime):
                item["last_counted_at"] = item["last_counted_at"].isoformat()

            # Stats updates
            if count_variance != 0:
                summary_stats["items_with_variance"] += 1
                summary_stats["total_variance_qty"] += count_variance
            else:
                summary_stats["items_matched"] += 1
            summary_stats["total_erp_drift_qty"] += erp_drift
            summary_stats["total_final_gap_qty"] += final_gap
            if bool(item.get("baseline_conflict")):
                summary_stats["items_with_baseline_conflict"] += 1

            formatted_results.append(item)

        return {
            "success": True,
            "session_id": session_id,
            "stats": summary_stats,
            "items": formatted_results,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error generating reconciliation for session %s: %s",
            _safe_log_value(session_id),
            _safe_log_value(e, max_length=200),
        )
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {e!s}") from e
