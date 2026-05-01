"""Service facade for enterprise reporting engines."""

from __future__ import annotations

from typing import Any

from backend.db.runtime import get_db
from backend.services.reporting.compare_engine import CompareEngine
from backend.services.reporting.export_engine import ExportEngine
from backend.services.reporting.query_builder import QueryBuilder
from backend.services.reporting.snapshot_engine import SnapshotEngine


class ReportingService:
    def __init__(self, database: Any) -> None:
        self._database = database
        self.query_builder = QueryBuilder()
        self.export_engine = ExportEngine()
        self.snapshot_engine = SnapshotEngine(database)
        self.compare_engine = CompareEngine(database)

    async def preview_query(self, query_spec: Any) -> dict[str, Any]:
        pipeline = self.query_builder.build_pipeline(
            collection=query_spec.collection,
            filters=query_spec.filters,
            group_by=query_spec.group_by,
            aggregations=query_spec.aggregations,
            sort=query_spec.sort,
            limit=query_spec.limit or 100,
        )
        results = await self._database[query_spec.collection].aggregate(pipeline).to_list(
            length=query_spec.limit or 100
        )
        return {
            "collection": query_spec.collection,
            "row_count": len(results),
            "rows": results,
            "pipeline": pipeline,
        }


def get_reporting_service() -> ReportingService:
    return ReportingService(get_db())
