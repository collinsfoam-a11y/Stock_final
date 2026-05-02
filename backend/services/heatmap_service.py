"""
Heatmap Service - Calculates zone-wise accuracy KPIs (Rule 10)
"""

import logging
from typing import Any, Dict, List
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


class HeatmapService:
    """
    Calculates operational health heatmaps based on count accuracy.
    Fulfills Rule 10: KPI Enforcement.
    """

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db

    async def get_accuracy_heatmap(self, session_id: str = None) -> List[Dict[str, Any]]:
        """
        Calculate accuracy heatmap data.
        Returns accuracy percentage and variance counts per floor/zone.
        """
        match_stage = {}
        if session_id:
            match_stage["session_id"] = session_id

        pipeline: list[dict[str, Any]] = [
            {"$match": match_stage},
            {
                "$group": {
                    "_id": "$floor_no",
                    "total_scans": {"$sum": 1},
                    "accurate_scans": {"$sum": {"$cond": [{"$eq": ["$variance", 0]}, 1, 0]}},
                    "major_variances": {
                        "$sum": {"$cond": [{"$gt": [{"$abs": "$variance"}, 10]}, 1, 0]}
                    },
                    "total_variance_value": {"$sum": {"$abs": "$financial_impact"}},
                }
            },
            {
                "$project": {
                    "zone": "$_id",
                    "accuracy_score": {
                        "$cond": [
                            {"$gt": ["$total_scans", 0]},
                            {"$multiply": [{"$divide": ["$accurate_scans", "$total_scans"]}, 100]},
                            0,
                        ]
                    },
                    "total_scans": 1,
                    "major_variances": 1,
                    "impact": "$total_variance_value",
                }
            },
            {"$sort": {"accuracy_score": 1}},  # Sort by lowest accuracy first (risk heat)
        ]

        result = await self.db.count_lines.aggregate(pipeline).to_list(None)

        # Format for frontend consumption
        heatmap = []
        for entry in result:
            if not entry["zone"]:
                entry["zone"] = "UNKNOWN"
            heatmap.append(entry)

        return heatmap
