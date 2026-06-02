"""
Reconciliation API - Handles session-wide aggregation of counts to calculate true variance.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.db.runtime import get_db
from backend.services.canonical_inventory import build_session_lookup
from backend.utils.api_utils import sanitize_for_logging
from backend.tenancy.scoping import org_id_from_user, org_scoped_filter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2/reconciliation", tags=["Reconciliation"])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_datetime(value: Any) -> Optional[datetime]:
    if not isinstance(value, datetime):
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


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
    org_id = org_id_from_user(current_user)

    try:
        # 1. Validation: Check if session exists
        session = await db.sessions.find_one(
            org_scoped_filter(org_id, build_session_lookup(session_id))
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if not _user_can_view_session(session, current_user):
            raise HTTPException(status_code=403, detail="Not authorized to view this session")

        warehouse = str(session.get("warehouse") or "").strip()
        if not warehouse:
            raise HTTPException(status_code=409, detail="Session warehouse is missing")

        started_at = _normalize_datetime(session.get("started_at"))
        if started_at is None:
            raise HTTPException(status_code=409, detail="Session started_at is missing")
        end_at = _normalize_datetime(
            session.get("finalized_at")
            or session.get("closed_at")
            or session.get("completed_at")
            or session.get("reconciled_at")
        )
        if end_at is None:
            end_at = _utc_now()

        snapshot = await db.session_snapshots.find_one(
            org_scoped_filter(org_id, {"session_id": session_id}),
            {"_id": 0},
        )
        if not snapshot:
            raise HTTPException(status_code=503, detail="Session snapshot not available")

        opening_qty_by_item: dict[str, float] = {}
        snapshot_items = snapshot.get("items")
        if isinstance(snapshot_items, list):
            for item in snapshot_items:
                if not isinstance(item, dict):
                    continue
                item_code = item.get("item_code")
                if not item_code:
                    continue
                try:
                    opening_qty_by_item[str(item_code)] = float(item.get("stock_qty") or 0.0)
                except (TypeError, ValueError):
                    opening_qty_by_item[str(item_code)] = 0.0

        movement_qty_by_item: dict[str, float] = {}
        try:
            movement_pipeline: list[dict[str, Any]] = [
                {
                    "$match": org_scoped_filter(
                        org_id,
                        {
                            "warehouse": warehouse,
                            "occurred_at": {"$gte": started_at, "$lte": end_at},
                        },
                    )
                },
                {"$group": {"_id": "$item_code", "movement_qty": {"$sum": "$quantity"}}},
            ]
            movement_rows = await db.inventory_movements.aggregate(movement_pipeline).to_list(
                length=None
            )
            for row in movement_rows:
                item_code = row.get("_id")
                if not item_code:
                    continue
                try:
                    movement_qty_by_item[str(item_code)] = float(row.get("movement_qty") or 0.0)
                except (TypeError, ValueError):
                    movement_qty_by_item[str(item_code)] = 0.0
        except Exception as exc:
            logger.error("Movement aggregation failed: %s", _safe_log_value(exc, max_length=200))
            raise HTTPException(status_code=503, detail="Movement ledger not available")

        # 2. Aggregation Pipeline
        pipeline: list[dict[str, Any]] = [
            # Match active (non-superseded) counts for this session
            {
                "$match": org_scoped_filter(
                    org_id,
                    {
                        "session_id": session_id,
                        "archived": {"$ne": True},
                        "status": {"$nin": ["SUPERSEDED", "superseded"]},
                        "$or": [
                            {"superseded_by_version_id": {"$exists": False}},
                            {"superseded_by_version_id": {"$in": [None, ""]}},
                        ],
                    },
                )
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
            "items_with_true_variance": 0,
            "total_true_variance_qty": 0.0,
            "items_with_baseline_conflict": 0,
        }

        formatted_results = []

        for item in results:
            item_code = str(item.get("item_code") or "").strip()
            total_counted = float(item.get("total_counted") or 0.0)
            opening_qty = float(opening_qty_by_item.get(item_code, 0.0))
            movement_qty = float(movement_qty_by_item.get(item_code, 0.0))
            expected_qty = opening_qty + movement_qty

            count_variance = float(total_counted - opening_qty)
            system_stock = float(item.get("system_stock") or 0.0)
            erp_drift = float(system_stock - opening_qty)
            final_gap = float(total_counted - system_stock)
            true_variance = float(expected_qty - total_counted)

            item["count_variance"] = count_variance
            item["erp_drift"] = erp_drift
            item["final_gap"] = final_gap
            item["opening_qty"] = opening_qty
            item["movement_qty"] = movement_qty
            item["expected_qty"] = expected_qty
            item["true_variance"] = true_variance
            item["baseline_qty"] = opening_qty
            # Backward compatibility for callers expecting `variance`.
            item["variance"] = count_variance

            status = "MATCH"
            if count_variance > 0:
                status = "SURPLUS"
            elif count_variance < 0:
                status = "MISSING"

            item["status"] = status

            true_status = "MATCH"
            if true_variance > 0:
                true_status = "MISSING"
            elif true_variance < 0:
                true_status = "SURPLUS"
            item["true_status"] = true_status
            item["abs_true_variance"] = abs(true_variance)

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
            if true_variance != 0:
                summary_stats["items_with_true_variance"] += 1
                summary_stats["total_true_variance_qty"] += true_variance
            if bool(item.get("baseline_conflict")):
                summary_stats["items_with_baseline_conflict"] += 1

            formatted_results.append(item)

        formatted_results.sort(
            key=lambda row: (
                -float(row.get("abs_true_variance") or 0.0),
                str(row.get("item_code") or ""),
            )
        )

        return {
            "success": True,
            "session_id": session_id,
            "warehouse": warehouse,
            "window": {
                "start": started_at.isoformat(),
                "end": end_at.isoformat(),
            },
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
        raise HTTPException(status_code=500, detail=f"Reconciliation failed: {str(e)}")
