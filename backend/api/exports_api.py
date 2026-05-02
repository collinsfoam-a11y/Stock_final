"""
Scheduled Exports API
Endpoints for managing scheduled exports
"""

import base64
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from backend.auth.permissions import Permission, require_permission
from backend.db.runtime import get_db
from backend.services.scheduled_export_service import (
    ExportFormat,
    ExportFrequency,
    ScheduledExportService,
)

exports_router = APIRouter(prefix="/exports", tags=["exports"])


async def get_scheduled_export_service(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> ScheduledExportService:
    # Service is lightweight; background scheduling is handled by the lifespan instance.
    return ScheduledExportService(db)


class ExportScheduleCreate(BaseModel):
    name: str
    export_type: str  # "sessions", "count_lines", "variance_report", "activity_logs"
    frequency: str  # "daily", "weekly", "monthly"
    format: str = "csv"  # "csv", "json"
    filters: dict[str, Optional[Any]] = Field(default_factory=dict)
    email_recipients: list[str] = Field(default_factory=list)


class ExportScheduleUpdate(BaseModel):
    name: Optional[str] = None
    frequency: Optional[str] = None
    format: Optional[str] = None
    filters: Optional[dict[str, Optional[Any]]] = None
    email_recipients: Optional[list[str]] = None
    enabled: Optional[bool] = None


@exports_router.post("/schedules")
async def create_export_schedule(
    schedule_data: ExportScheduleCreate,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """Create a new export schedule"""
    try:
        # Validate export type
        valid_types = ["sessions", "count_lines", "variance_report", "activity_logs"]
        if schedule_data.export_type not in valid_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "success": False,
                    "error": {
                        "message": f"Invalid export type. Must be one of: {', '.join(valid_types)}",
                        "code": "INVALID_EXPORT_TYPE",
                    },
                },
            )

        # Create schedule
        schedule_id = await export_service.create_export_schedule(
            name=schedule_data.name,
            export_type=schedule_data.export_type,
            frequency=ExportFrequency(schedule_data.frequency),
            format=ExportFormat(schedule_data.format),
            filters=schedule_data.filters,
            email_recipients=schedule_data.email_recipients,
            created_by=current_user["username"],
        )

        return {
            "success": True,
            "data": {
                "schedule_id": schedule_id,
                "message": "Export schedule created successfully",
            },
        }

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": {"message": str(e), "code": "INVALID_INPUT"},
            },
        )


@exports_router.get("/schedules")
async def list_export_schedules(
    enabled_only: bool = False,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """List all export schedules"""
    schedules = await export_service.get_export_schedules(enabled_only=enabled_only)

    return {"success": True, "data": {"schedules": schedules, "total": len(schedules)}}


@exports_router.get("/schedules/{schedule_id}")
async def get_export_schedule(
    schedule_id: str,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """Get details of a specific export schedule"""
    from bson import ObjectId

    schedule = await export_service.db.export_schedules.find_one({"_id": ObjectId(schedule_id)})

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "message": "Export schedule not found",
                    "code": "SCHEDULE_NOT_FOUND",
                },
            },
        )

    schedule["id"] = str(schedule.pop("_id"))

    return {"success": True, "data": schedule}


@exports_router.put("/schedules/{schedule_id}")
async def update_export_schedule(
    schedule_id: str,
    schedule_update: ExportScheduleUpdate,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """Update an export schedule"""
    # Prepare updates
    updates: dict[str, Any] = {}
    if schedule_update.name is not None:
        updates["name"] = schedule_update.name
    if schedule_update.frequency is not None:
        try:
            ExportFrequency(schedule_update.frequency)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "success": False,
                    "error": {
                        "message": f"Invalid frequency: {schedule_update.frequency}",
                        "code": "INVALID_FREQUENCY",
                    },
                },
            ) from exc
        updates["frequency"] = schedule_update.frequency
    if schedule_update.format is not None:
        try:
            ExportFormat(schedule_update.format)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "success": False,
                    "error": {
                        "message": f"Invalid format: {schedule_update.format}",
                        "code": "INVALID_FORMAT",
                    },
                },
            ) from exc
        updates["format"] = schedule_update.format
    if schedule_update.filters is not None:
        updates["filters"] = schedule_update.filters
    if schedule_update.email_recipients is not None:
        updates["email_recipients"] = schedule_update.email_recipients
    if schedule_update.enabled is not None:
        updates["enabled"] = schedule_update.enabled

    success = await export_service.update_export_schedule(schedule_id, updates)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "message": "Schedule not found or no changes made",
                    "code": "UPDATE_FAILED",
                },
            },
        )

    return {
        "success": True,
        "data": {
            "message": "Schedule updated successfully",
            "schedule_id": schedule_id,
        },
    }


@exports_router.delete("/schedules/{schedule_id}")
async def delete_export_schedule(
    schedule_id: str,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """Delete an export schedule"""
    success = await export_service.delete_export_schedule(schedule_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "message": "Schedule not found",
                    "code": "SCHEDULE_NOT_FOUND",
                },
            },
        )

    return {
        "success": True,
        "data": {
            "message": "Schedule deleted successfully",
            "schedule_id": schedule_id,
        },
    }


@exports_router.post("/schedules/{schedule_id}/execute")
async def execute_export_schedule(
    schedule_id: str,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_SCHEDULE),
):
    """Manually execute an export schedule"""
    from bson import ObjectId

    # Get schedule
    schedule = await export_service.db.export_schedules.find_one({"_id": ObjectId(schedule_id)})

    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "message": "Schedule not found",
                    "code": "SCHEDULE_NOT_FOUND",
                },
            },
        )

    # Execute export
    result = await export_service.execute_export(schedule)

    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": {
                    "message": f"Export failed: {result.get('error')}",
                    "code": "EXPORT_FAILED",
                },
            },
        )

    return {"success": True, "data": result}


@exports_router.get("/results")
async def list_export_results(
    schedule_id: Optional[str] = None,
    limit: int = 50,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """List export results"""
    from bson import ObjectId

    query = {}
    if schedule_id:
        query["schedule_id"] = ObjectId(schedule_id)

    cursor = export_service.db.export_results.find(query).sort("created_at", -1).limit(limit)
    results = await cursor.to_list(length=limit)

    # Remove file_content from list (too large)
    for result in results:
        result["id"] = str(result.pop("_id"))
        # NOTE: Mongo stores schedule_id as an ObjectId (see ScheduledExportService.execute_export).
        # FastAPI's jsonable_encoder can't serialize ObjectId, so always stringify here.
        schedule_value = result.get("schedule_id")
        if isinstance(schedule_value, ObjectId):
            result["schedule_id"] = str(schedule_value)
        result["has_content"] = bool(result.get("file_content"))
        result.pop("file_content", None)

    return {"success": True, "data": {"results": results, "total": len(results)}}


@exports_router.get("/results/{result_id}/download")
async def download_export_result(
    result_id: str,
    export_service: ScheduledExportService = Depends(get_scheduled_export_service),
    current_user: dict = require_permission(Permission.EXPORT_ALL),
):
    """Download an export result file"""
    from bson import ObjectId

    result = await export_service.db.export_results.find_one({"_id": ObjectId(result_id)})

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error": {
                    "message": "Export result not found",
                    "code": "RESULT_NOT_FOUND",
                },
            },
        )

    file_content = result.get("file_content", "")
    file_extension = result.get("file_extension", "csv")
    schedule_name = result.get("schedule_name", "export")
    created_at = result.get("created_at", datetime.now(timezone.utc).replace(tzinfo=None))

    # Create filename
    timestamp = created_at.strftime("%Y%m%d_%H%M%S")
    filename = f"{schedule_name}_{timestamp}.{file_extension}"

    if file_extension == "xlsx":
        if isinstance(file_content, str):
            file_content = base64.b64decode(file_content)
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif file_extension == "csv":
        content_type = "text/csv"
    else:
        content_type = "application/json"

    return Response(
        content=file_content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
