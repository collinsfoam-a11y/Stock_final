"""
Reporting API - Query builder, snapshots, exports, and comparisons
Enterprise-grade reporting with MongoDB aggregations
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.services.reporting.query_builder import QueryBuilder
from backend.services.reporting_service import ReportingService, get_reporting_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["Reporting"])


# Models


class QuerySpec(BaseModel):
    """Query specification"""

    collection: str = Field(..., description="Collection to query")
    filters: Optional[dict[str, Optional[Any]]] = Field(
        default=None, description="Filter conditions"
    )
    group_by: Optional[list[str]] = Field(None, description="Group by fields")
    aggregations: Optional[dict[str, Optional[str]]] = Field(
        default=None, description="Aggregations"
    )
    sort: Optional[dict[str, Optional[int]]] = Field(default=None, description="Sort specification")
    limit: Optional[int] = Field(None, description="Limit results")


class CreateSnapshotRequest(BaseModel):
    """Create snapshot request"""

    name: str = Field(..., description="Snapshot name")
    description: str = Field(..., description="Snapshot description")
    query_spec: QuerySpec = Field(..., description="Query specification")
    snapshot_type: str = Field("custom", description="Snapshot type")
    tags: Optional[list[str]] = Field(None, description="Tags")


class CompareSnapshotsRequest(BaseModel):
    """Compare snapshots request"""

    snapshot_a_id: str = Field(..., description="First snapshot ID")
    snapshot_b_id: str = Field(..., description="Second snapshot ID")
    comparison_name: Optional[str] = Field(None, description="Comparison name")


# Endpoints


@router.post("/query/preview")
async def preview_query(
    query_spec: QuerySpec,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Preview query results without saving
    """
    return await reporting_service.preview_query(query_spec)


@router.post("/snapshots", response_model=dict[str, Any])
async def create_snapshot(
    request: CreateSnapshotRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Create a new snapshot
    """
    snapshot = await reporting_service.snapshot_engine.create_snapshot(
        name=request.name,
        description=request.description,
        query_spec=request.query_spec.model_dump(),
        created_by=current_user["username"],
        snapshot_type=request.snapshot_type,
        tags=request.tags,
    )

    return snapshot


@router.get("/snapshots")
async def list_snapshots(
    created_by: Optional[str] = Query(None),
    snapshot_type: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),  # Comma-separated
    limit: int = Query(50, ge=1, le=200),
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """
    List snapshots with filters
    """
    # Parse tags
    tag_list = tags.split(",") if tags else None

    # Only supervisors can view other users' snapshots
    if created_by and created_by != current_user["username"]:
        if current_user["role"] != "supervisor":
            raise HTTPException(status_code=403, detail="Access denied")

    snapshots = await reporting_service.snapshot_engine.list_snapshots(
        created_by=created_by,
        snapshot_type=snapshot_type,
        tags=tag_list,
        limit=limit,
    )

    return snapshots


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot(
    snapshot_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Get snapshot with pagination
    """
    snapshot_data = await reporting_service.snapshot_engine.get_snapshot_data(
        snapshot_id, skip=skip, limit=limit
    )

    if not snapshot_data:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    return snapshot_data


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(
    snapshot_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Delete snapshot
    """
    try:
        deleted = await reporting_service.snapshot_engine.delete_snapshot(
            snapshot_id, current_user["username"]
        )

        if deleted:
            return {"success": True, "snapshot_id": snapshot_id}
        else:
            raise HTTPException(status_code=404, detail="Snapshot not found")

    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.post("/snapshots/{snapshot_id}/refresh")
async def refresh_snapshot(
    snapshot_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Refresh snapshot with latest data
    """
    new_snapshot = await reporting_service.snapshot_engine.refresh_snapshot(snapshot_id)
    return new_snapshot


@router.get("/snapshots/{snapshot_id}/export")
async def export_snapshot(
    snapshot_id: str,
    format: str = Query("csv", pattern="^(csv|xlsx|json)$"),
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> Response:
    """
    Export snapshot to file

    Formats: csv, xlsx, json
    """
    snapshot = await reporting_service.snapshot_engine.get_snapshot(snapshot_id)

    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    # Export
    if format == "csv":
        content = reporting_service.export_engine.export_to_csv(snapshot)
        media_type = "text/csv"
    elif format == "xlsx":
        content = reporting_service.export_engine.export_to_xlsx(snapshot)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif format == "json":
        content = reporting_service.export_engine.export_to_json(snapshot)
        media_type = "application/json"
    else:
        raise HTTPException(status_code=400, detail="Invalid format")

    # Generate filename
    filename = reporting_service.export_engine.get_export_filename(snapshot, format)

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/compare")
async def compare_snapshots(
    request: CompareSnapshotsRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Compare two snapshots
    """
    comparison = await reporting_service.compare_engine.compare_snapshots(
        snapshot_a_id=request.snapshot_a_id,
        snapshot_b_id=request.snapshot_b_id,
        created_by=current_user["username"],
        comparison_name=request.comparison_name,
    )

    return comparison


@router.get("/compare/{job_id}")
async def get_comparison(
    job_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> dict[str, Any]:
    """
    Get comparison job
    """
    comparison = await reporting_service.compare_engine.get_comparison(job_id)

    if not comparison:
        raise HTTPException(status_code=404, detail="Comparison not found")

    return comparison


@router.get("/compare")
async def list_comparisons(
    created_by: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict[str, Any] = Depends(get_current_user),
    reporting_service: ReportingService = Depends(get_reporting_service),
) -> list[dict[str, Any]]:
    """
    List comparison jobs
    """
    # Only supervisors can view other users' comparisons
    if created_by and created_by != current_user["username"]:
        if current_user["role"] != "supervisor":
            raise HTTPException(status_code=403, detail="Access denied")

    comparisons = await reporting_service.compare_engine.list_comparisons(
        created_by=created_by, limit=limit
    )

    return comparisons


@router.get("/collections")
async def get_available_collections(
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Get available collections and their fields
    """
    query_builder = QueryBuilder()

    return {
        "collections": query_builder.COLLECTIONS,
        "fields": query_builder.FIELDS,
        "aggregations": query_builder.AGGREGATIONS,
    }
