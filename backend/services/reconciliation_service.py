"""Service layer for reconciliation reads."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.db.runtime import get_db
from backend.services.canonical_inventory import build_session_lookup


class ReconciliationService:
    def __init__(self, database: Any) -> None:
        self._database = database

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await self._database.sessions.find_one(build_session_lookup(session_id))

    async def get_session_summary(self, session_id: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        pipeline: list[dict[str, Any]] = [
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
            {
                "$lookup": {
                    "from": "erp_items",
                    "localField": "_id",
                    "foreignField": "item_code",
                    "as": "erp_data",
                }
            },
            {"$unwind": {"path": "$erp_data", "preserveNullAndEmptyArrays": True}},
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
            {"$sort": {"abs_count_variance": -1, "item_code": 1}},
        ]

        results = await self._database.count_lines.aggregate(pipeline).to_list(length=10000)
        summary_stats: dict[str, Any] = {
            "total_items_counted": len(results),
            "items_with_variance": 0,
            "items_matched": 0,
            "total_variance_qty": 0.0,
            "total_erp_drift_qty": 0.0,
            "total_final_gap_qty": 0.0,
            "items_with_baseline_conflict": 0,
        }
        formatted_results: list[dict[str, Any]] = []
        for item in results:
            count_variance = float(item.get("count_variance") or 0.0)
            erp_drift = float(item.get("erp_drift") or 0.0)
            final_gap = float(item.get("final_gap") or 0.0)
            item["count_variance"] = count_variance
            item["erp_drift"] = erp_drift
            item["final_gap"] = final_gap
            item["variance"] = count_variance
            item["status"] = "SURPLUS" if count_variance > 0 else "MISSING" if count_variance < 0 else "MATCH"

            if isinstance(item.get("last_counted_at"), datetime):
                item["last_counted_at"] = item["last_counted_at"].isoformat()

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

        return summary_stats, formatted_results


def get_reconciliation_service() -> ReconciliationService:
    return ReconciliationService(get_db())
