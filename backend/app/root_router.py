import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from backend.api.schemas import Session
from backend.auth.dependencies import get_current_user
from backend.auth.dependencies import require_admin as auth_require_admin
from backend.core.lifespan import activity_log_service, db
from backend.services.canonical_inventory import build_session_lookup
from backend.services.count_line_write_service import CountLineWriteService
from backend.utils.api_utils import sanitize_for_logging

logger = logging.getLogger("stock-verify")

# We use two routers: one for root-level stuff (no prefix) and one for /api level stuff
root_router = APIRouter()
api_router = APIRouter()


@root_router.get("/", status_code=200)
async def root():
    """Root endpoint - basic service information"""
    return {
        "service": "stock-verify-backend",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {"health": "/health", "api": "/api", "docs": "/docs"},
    }


@root_router.get("/api/mapping/test_direct")
def test_direct(_current_user: dict = Depends(auth_require_admin)):
    """Return a minimal payload for mapping smoke tests."""
    return {"status": "ok"}


class BulkExportRequest(BaseModel):
    session_ids: list[str]
    format: str = "json"


@api_router.post("/sessions/bulk/export")
async def bulk_export_sessions(
    body: BulkExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Bulk export sessions as JSON (supervisor only)."""
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    if body.format not in ("json", ""):
        raise HTTPException(
            status_code=501,
            detail=f"Export format '{body.format}' is not yet implemented. Use format='json'.",
        )

    try:
        sessions = await db.sessions.find(
            {"$or": [{"id": {"$in": body.session_ids}}, {"session_id": {"$in": body.session_ids}}]}
        ).to_list(None)

        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user["role"],
            action="bulk_export_sessions",
            entity_type="session",
            entity_id=None,
            details={
                "operation": "bulk_export",
                "count": len(sessions),
                "format": body.format,
            },
            ip_address=None,
            user_agent=None,
        )

        return {
            "success": True,
            "exported_count": len(sessions),
            "total": len(body.session_ids),
            "data": sessions,
            "format": body.format,
        }
    except Exception as e:
        logger.error("Bulk export sessions error: %s", sanitize_for_logging(str(e), 200))
        raise HTTPException(status_code=500, detail=str(e)) from e


@api_router.get("/legacy/sessions/analytics")
async def get_sessions_analytics(current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    try:
        pipeline = [
            {
                "$group": {
                    "_id": None,
                    "total_sessions": {"$sum": 1},
                    "total_items": {"$sum": "$total_items"},
                    "total_variance": {"$sum": "$total_variance"},
                    "avg_variance": {"$avg": "$total_variance"},
                }
            }
        ]
        status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        date_pipeline = [
            {
                "$project": {
                    "date": {
                        "$dateToString": {
                            "format": "%Y-%m-%d",
                            "date": "$started_at",
                            "onNull": "unknown",
                        }
                    },
                    "warehouse": 1,
                    "staff_name": 1,
                    "total_items": 1,
                    "total_variance": 1,
                }
            },
            {"$group": {"_id": "$date", "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}},
        ]
        warehouse_pipeline = [
            {
                "$group": {
                    "_id": "$warehouse",
                    "total_variance": {"$sum": {"$abs": "$total_variance"}},
                    "session_count": {"$sum": 1},
                }
            }
        ]
        staff_pipeline = [
            {
                "$group": {
                    "_id": "$staff_name",
                    "total_items": {"$sum": "$total_items"},
                    "session_count": {"$sum": 1},
                }
            }
        ]

        overall = await db.sessions.aggregate(pipeline).to_list(1)
        by_date = await db.sessions.aggregate(date_pipeline).to_list(None)
        by_status = await db.sessions.aggregate(status_pipeline).to_list(None)
        by_warehouse = await db.sessions.aggregate(warehouse_pipeline).to_list(None)
        by_staff = await db.sessions.aggregate(staff_pipeline).to_list(None)

        sessions_by_date = {item["_id"]: item["count"] for item in by_date}
        sessions_by_status = {item["_id"]: item["count"] for item in by_status}
        variance_by_warehouse = {item["_id"]: item["total_variance"] for item in by_warehouse}
        items_by_staff = {item["_id"]: item["total_items"] for item in by_staff}

        overall_doc = overall[0] if overall else {}
        overall_doc["sessions_by_status"] = sessions_by_status

        return {
            "success": True,
            "data": {
                "overall": overall_doc,
                "sessions_by_date": sessions_by_date,
                "sessions_by_status": sessions_by_status,
                "variance_by_warehouse": variance_by_warehouse,
                "items_by_staff": items_by_staff,
                "total_sessions": overall_doc.get("total_sessions", 0),
            },
        }
    except Exception as e:
        logger.error("Analytics error: %s", sanitize_for_logging(str(e), 200))
        raise HTTPException(status_code=500, detail=str(e)) from e


@api_router.get("/legacy/sessions/{session_id}")
async def get_session_by_id(session_id: str, current_user: dict = Depends(get_current_user)):
    try:
        session = await db.sessions.find_one(build_session_lookup(session_id))
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if (
            current_user["role"] not in ("supervisor", "admin")
            and session.get("staff_user") != current_user["username"]
        ):
            raise HTTPException(status_code=403, detail="Access denied")
        if "_id" in session:
            if "id" not in session:
                session["id"] = str(session["_id"])
            del session["_id"]
        return Session(**session)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error fetching session %s: %s",
            sanitize_for_logging(session_id),
            sanitize_for_logging(str(e), 200),
        )
        raise HTTPException(status_code=500, detail=str(e)) from e


def _get_db_client(db_override=None):
    db_client = db_override or db
    if db_client is None:
        raise HTTPException(status_code=500, detail="Database is not initialized")
    return db_client


def _require_supervisor(current_user: dict):
    if current_user.get("role") not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Supervisor access required")


async def verify_stock(
    line_id: str, current_user: dict, *, request: Request | None = None, db_override=None
):
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await db_client.count_lines.find_one({"id": line_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    filter_query = {"_id": count_line["_id"]} if count_line.get("_id") else {"id": line_id}
    write_service = CountLineWriteService(db_client)

    update_result = await write_service.process_write(
        {"operation": "update_one", "filter": filter_query, "update": {"$set": {}}},
        context={
            "transition": "verify",
            "username": current_user["username"],
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
            "skip_session_totals_update": True,
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    if activity_log_service:
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="verify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )

    return {"message": "Stock verified", "verified": True}


async def unverify_stock(
    line_id: str, current_user: dict, *, request: Request | None = None, db_override=None
):
    _require_supervisor(current_user)
    db_client = _get_db_client(db_override)
    count_line = await db_client.count_lines.find_one({"id": line_id})
    if not count_line:
        raise HTTPException(status_code=404, detail="Count line not found")
    filter_query = {"_id": count_line["_id"]} if count_line.get("_id") else {"id": line_id}
    write_service = CountLineWriteService(db_client)

    update_result = await write_service.process_write(
        {"operation": "update_one", "filter": filter_query, "update": {"$set": {}}},
        context={
            "transition": "unverify",
            "username": current_user["username"],
            "session_id": str(count_line.get("session_id") or ""),
            "governance_mode": "mutable_session",
            "skip_session_totals_update": True,
        },
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Count line not found")

    if activity_log_service:
        await activity_log_service.log_activity(
            user=current_user["username"],
            role=current_user.get("role", ""),
            action="unverify_stock",
            entity_type="count_line",
            entity_id=line_id,
            ip_address=request.client.host if request and request.client else None,
            user_agent=request.headers.get("user-agent") if request else None,
        )
    return {"message": "Stock verification removed", "verified": False}


async def get_count_lines(
    session_id: str,
    current_user: dict,
    page: int = 1,
    page_size: int = 50,
    verified: bool | None = None,
    *,
    db_override=None,
):
    skip = (page - 1) * page_size
    filter_query: dict[str, Any] = {"session_id": session_id}
    if verified is not None:
        filter_query["verified"] = verified
    db_client = _get_db_client(db_override)
    total = await db_client.count_lines.count_documents(filter_query)
    lines_cursor = (
        db_client.count_lines.find(filter_query, {"_id": 0})
        .sort("counted_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    lines = await lines_cursor.to_list(page_size)
    return {
        "items": lines,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
            "has_next": skip + page_size < total,
            "has_prev": page > 1,
        },
    }
