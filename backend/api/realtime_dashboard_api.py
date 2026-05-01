"""
Real-Time Dashboard API
Server-Sent Events (SSE) and WebSocket endpoints for live data updates
"""

import asyncio
import json
import logging
from backend.utils.api_utils import sanitize_for_logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from backend.auth.dependencies import get_current_user, require_role
from backend.services.advanced_report_service import (
    ColumnConfig,
    ReportConfig,
    ReportFilters,
    SortOrder,
)
from backend.services.realtime_dashboard_service import (
    RealtimeDashboardService,
    get_realtime_dashboard_service,
)
from backend.utils.request_context import get_request_id
from backend.utils.tracing import trace_dashboard_query, trace_span

logger = logging.getLogger(__name__)
REALTIME_ERROR_TYPES = (
    PyMongoError,
    RuntimeError,
    TypeError,
    ValueError,
    KeyError,
    AttributeError,
)

realtime_dashboard_router = APIRouter(prefix="/dashboard", tags=["Real-Time Dashboard"])


# ==========================================
# Request/Response Models
# ==========================================


class DashboardColumnPreference(BaseModel):
    """User's column visibility preferences."""

    field: str
    visible: bool


class DashboardConfig(BaseModel):
    """Dashboard configuration from frontend."""

    columns: Optional[list[DashboardColumnPreference]] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=10, le=200)
    sort_by: Optional[str] = None
    sort_order: str = "desc"
    filters: Optional[dict[str, Any]] = None
    auto_refresh: bool = True
    refresh_interval_seconds: int = Field(default=10, ge=5, le=300)


class ItemDetails(BaseModel):
    """Expanded item details for drill-down."""

    id: str
    item_code: str
    item_name: str
    barcode: Optional[str]
    category: Optional[str]
    warehouse: Optional[str]
    floor: Optional[str]
    rack_id: Optional[str]
    stock_qty: float
    counted_qty: float
    variance: float
    variance_percentage: float
    mrp: float
    verified: bool
    verified_by: Optional[str]
    verified_at: Optional[datetime]
    counted_by: str
    counted_at: datetime
    session_id: str
    notes: Optional[str]
    correction_reason: Optional[dict]
    photo_proofs: Optional[list[dict]]
    audit_trail: list[dict] = []


# ==========================================
# WebSocket Connection Manager
# ==========================================


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.user_configs: dict[str, DashboardConfig] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info("WebSocket connected: %s", sanitize_for_logging(user_id))

    def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)
        self.user_configs.pop(user_id, None)
        logger.info("WebSocket disconnected: %s", sanitize_for_logging(user_id))

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_json(message)
            except REALTIME_ERROR_TYPES as e:
                logger.error(
                    "Error sending to {user_id}: %s", sanitize_for_logging(str(e))
                )
                self.disconnect(user_id)

    async def broadcast(self, message: dict):
        disconnected = []
        for user_id, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except REALTIME_ERROR_TYPES:
                disconnected.append(user_id)

        for user_id in disconnected:
            self.disconnect(user_id)

    def set_config(self, user_id: str, config: DashboardConfig):
        self.user_configs[user_id] = config

    def get_config(self, user_id: str) -> Optional[DashboardConfig]:
        return self.user_configs.get(user_id)


manager = ConnectionManager()


# ==========================================
# Helper Functions
# ==========================================


def parse_filters(filters: Optional[dict[str, Any]]) -> ReportFilters:
    """Parse frontend filters to ReportFilters."""
    if not filters:
        return ReportFilters()

    return ReportFilters(
        warehouse=filters.get("warehouse"),
        floor=filters.get("floor"),
        rack_id=filters.get("rack_id"),
        category=filters.get("category"),
        verified=filters.get("verified"),
        session_id=filters.get("session_id"),
        user_id=filters.get("user_id"),
        search_query=filters.get("search"),
        date_from=filters.get("date_from"),
        date_to=filters.get("date_to"),
        variance_min=filters.get("variance_min"),
        variance_max=filters.get("variance_max"),
    )


# ==========================================
# REST Endpoints
# ==========================================


@realtime_dashboard_router.get("/columns")
async def get_available_columns(
    report_type: str = Query(default="verified_items"),
    current_user: dict = Depends(get_current_user),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Get available columns for the dashboard table."""
    columns = dashboard_service.get_column_config(report_type)

    return {
        "success": True,
        "columns": [col.model_dump() for col in columns],
        "report_type": report_type,
    }


@realtime_dashboard_router.post("/data")
@trace_dashboard_query("verified_items_table")
async def get_dashboard_data(
    config: DashboardConfig,
    http_request: Request,
    current_user: dict = Depends(get_current_user),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Get dashboard data with configured columns and filters."""
    request_id = get_request_id(http_request.headers)
    # Build column configs from preferences
    default_columns = dashboard_service.get_column_config("verified_items")
    if config.columns:
        visibility_map = {pref.field: pref.visible for pref in config.columns}
        for col in default_columns:
            if col.field in visibility_map:
                col.visible = visibility_map[col.field]

    report_config = ReportConfig(
        report_type="verified_items",
        filters=parse_filters(config.filters),
        columns=default_columns,
        sort_by=config.sort_by,
        sort_order=(
            SortOrder(config.sort_order) if config.sort_order else SortOrder.DESC
        ),
        page=config.page,
        page_size=config.page_size,
        include_aggregations=True,
        include_summary=True,
    )

    result = await dashboard_service.generate_verified_items_report(report_config)
    logger.info(
        "dashboard_data_generated",
        extra={
            "request_id": request_id,
            "user": sanitize_for_logging(str(current_user.get("username", "unknown"))),
            "endpoint": "/dashboard/data",
            "status": "completed",
            "page": config.page,
            "page_size": config.page_size,
        },
    )

    return result


@realtime_dashboard_router.get("/item/{item_id}")
@trace_dashboard_query("item_details")
async def get_item_details(
    item_id: str,
    current_user: dict = Depends(get_current_user),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Get detailed information for a specific item."""
    result = await dashboard_service.get_item_details(item_id)
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return result


@realtime_dashboard_router.get("/stats")
@trace_dashboard_query("dashboard_stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Get real-time dashboard statistics."""
    return await dashboard_service.get_dashboard_stats()


@realtime_dashboard_router.get("/filters/options")
async def get_filter_options(
    current_user: dict = Depends(get_current_user),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Get available filter options (distinct values)."""
    return await dashboard_service.get_filter_options()


# ==========================================
# Server-Sent Events (SSE) Endpoint
# ==========================================


@realtime_dashboard_router.get("/stream")
async def dashboard_stream(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=10, le=200),
    refresh_interval: int = Query(default=10, ge=5, le=300),
    current_user: dict = Depends(require_role("staff", "supervisor", "admin")),
):
    """Server-Sent Events stream for real-time dashboard updates."""

    async def event_generator():
        service = get_realtime_dashboard_service()

        while True:
            try:
                with trace_span("sse_data_fetch"):
                    config = ReportConfig(
                        report_type="verified_items",
                        page=page,
                        page_size=page_size,
                        include_aggregations=True,
                    )
                    result = await service.generate_verified_items_report(config)

                # Format as SSE
                data = json.dumps(
                    {
                        "type": "data",
                        "payload": result,
                        "timestamp": datetime.now(timezone.utc)
                        .replace(tzinfo=None)
                        .isoformat(),
                    }
                )
                yield f"data: {data}\n\n"

                await asyncio.sleep(refresh_interval)

            except asyncio.CancelledError:
                logger.info("SSE stream cancelled")
                break
            except REALTIME_ERROR_TYPES as e:
                logger.error("SSE stream error: %s", sanitize_for_logging(str(e)))
                error_data = json.dumps(
                    {
                        "type": "error",
                        "message": str(e),
                        "timestamp": datetime.now(timezone.utc)
                        .replace(tzinfo=None)
                        .isoformat(),
                    }
                )
                yield f"data: {error_data}\n\n"
                await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==========================================
# WebSocket Helpers
# ==========================================


async def _ws_get_report(service: RealtimeDashboardService, config: DashboardConfig) -> dict:
    """Generate report for WebSocket response."""
    return await service.generate_verified_items_report(
        ReportConfig(
            report_type="verified_items",
            filters=parse_filters(config.filters),
            page=config.page,
            page_size=config.page_size,
            sort_by=config.sort_by,
            sort_order=(
                SortOrder(config.sort_order) if config.sort_order else SortOrder.DESC
            ),
        )
    )


async def _ws_handle_config_update(
    data: dict,
    user_id: str,
    service: RealtimeDashboardService,
) -> DashboardConfig:
    """Handle config_update message, return new config."""
    new_config = DashboardConfig(**data.get("config", {}))
    manager.set_config(user_id, new_config)
    result = await _ws_get_report(service, new_config)
    await manager.send_personal_message(
        {"type": "data_update", "payload": result}, user_id
    )
    return new_config


async def _ws_handle_refresh(
    user_id: str,
    service: RealtimeDashboardService,
    config: DashboardConfig,
) -> None:
    """Handle refresh message."""
    result = await _ws_get_report(service, config)
    await manager.send_personal_message(
        {"type": "data_update", "payload": result}, user_id
    )


async def _ws_handle_get_item_details(
    data: dict,
    user_id: str,
    service: RealtimeDashboardService,
) -> None:
    """Handle get_item_details message."""
    item_id = data.get("item_id")
    if item_id:
        item = await service.get_ws_item_details(item_id)
        if item:
            await manager.send_personal_message(
                {"type": "item_details", "payload": item}, user_id
            )


# ==========================================
# WebSocket Endpoint
async def _ws_handle_auto_refresh(
    user_id: str, service: RealtimeDashboardService, config: DashboardConfig
) -> None:
    """Handle auto-refresh on timeout."""
    if config.auto_refresh:
        result = await _ws_get_report(service, config)
        await manager.send_personal_message(
            {"type": "auto_refresh", "payload": result}, user_id
        )


async def _ws_process_message(
    data: dict,
    user_id: str,
    service: RealtimeDashboardService,
    config: DashboardConfig,
) -> DashboardConfig:
    """Process WebSocket message and return (potentially updated) config."""
    message_type = data.get("type")

    if message_type == "config_update":
        return await _ws_handle_config_update(data, user_id, service)
    elif message_type == "refresh":
        await _ws_handle_refresh(user_id, service, config)
    elif message_type == "get_item_details":
        await _ws_handle_get_item_details(data, user_id, service)

    return config


# ==========================================
# WebSocket Endpoint
# ==========================================


@realtime_dashboard_router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """WebSocket endpoint for bidirectional real-time communication."""
    user_id = token
    await manager.connect(websocket, user_id)

    try:
        service = get_realtime_dashboard_service()
        config = DashboardConfig()
        manager.set_config(user_id, config)

        # Send initial data
        result = await _ws_get_report(service, config)
        await manager.send_personal_message(
            {"type": "initial_data", "payload": result}, user_id
        )

        # Listen for client messages
        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(), timeout=config.refresh_interval_seconds
                )
                config = await _ws_process_message(data, user_id, service, config)
            except asyncio.TimeoutError:
                await _ws_handle_auto_refresh(user_id, service, config)

    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except REALTIME_ERROR_TYPES as e:
        logger.error("WebSocket error for {user_id}: %s", sanitize_for_logging(str(e)))
        manager.disconnect(user_id)


# ==========================================
# Export Endpoints
# ==========================================


@realtime_dashboard_router.post("/export/csv")
async def export_dashboard_csv(
    config: DashboardConfig,
    current_user: dict = Depends(require_role("supervisor", "admin")),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Export current dashboard view as CSV."""
    # Get all data (no pagination for export)
    report_config = ReportConfig(
        report_type="verified_items",
        filters=parse_filters(config.filters),
        page=1,
        page_size=10000,  # Max export
        sort_by=config.sort_by,
        sort_order=(
            SortOrder(config.sort_order) if config.sort_order else SortOrder.DESC
        ),
    )

    result = await dashboard_service.generate_verified_items_report(report_config)
    columns = [ColumnConfig(**col) for col in result["columns"]]

    # Apply visibility from config
    if config.columns:
        visibility_map = {pref.field: pref.visible for pref in config.columns}
        for col in columns:
            if col.field in visibility_map:
                col.visible = visibility_map[col.field]

    csv_content = await dashboard_service.export_to_csv(result["data"], columns)

    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f"attachment; filename=dashboard_erpnext_import_"
                f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            )
        },
    )


@realtime_dashboard_router.post("/export/xlsx")
async def export_dashboard_xlsx(
    config: DashboardConfig,
    current_user: dict = Depends(require_role("supervisor", "admin")),
    dashboard_service: RealtimeDashboardService = Depends(get_realtime_dashboard_service),
):
    """Export current dashboard view as Excel."""
    report_config = ReportConfig(
        report_type="verified_items",
        filters=parse_filters(config.filters),
        page=1,
        page_size=10000,
        sort_by=config.sort_by,
        sort_order=(
            SortOrder(config.sort_order) if config.sort_order else SortOrder.DESC
        ),
    )

    result = await dashboard_service.generate_verified_items_report(report_config)
    columns = [ColumnConfig(**col) for col in result["columns"]]

    if config.columns:
        visibility_map = {pref.field: pref.visible for pref in config.columns}
        for col in columns:
            if col.field in visibility_map:
                col.visible = visibility_map[col.field]

    xlsx_content = await dashboard_service.export_to_xlsx(result["data"], columns)

    return StreamingResponse(
        iter([xlsx_content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename=dashboard_erpnext_import_"
                f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
            )
        },
    )
