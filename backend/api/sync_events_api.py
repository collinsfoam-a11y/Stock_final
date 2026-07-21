"""Event-driven ERP sync API (v2.2, Priority 1).

Ingest endpoint for the Sync Bridge plus operational endpoints (metrics,
DLQ inspection/requeue) for the monitoring dashboard. All functionality is
gated behind ERP_EVENT_SYNC_ENABLED; when disabled the endpoints answer 503
so the bridge falls back to the polling path (/api/sync/batch).
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_current_user_async as get_current_user
from backend.config import settings
from backend.services.erp_event_sync import (
    ErpSyncEventProducer,
    get_sync_metrics,
    requeue_dead_letters,
)
from backend.services.redis_service import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/erp/sync/events", tags=["ERP Event Sync"])


class ErpChangeEvent(BaseModel):
    """A single change observed by the bridge via SQL Server Change Tracking."""

    change_type: str = Field(..., description="insert | update | delete")
    item_code: str = Field(..., min_length=1)
    # Change-tracking version (or last_modified stamp) from SQL Server; used
    # for idempotency so bridge retries do not double-apply.
    source_version: str = Field(..., min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)


class ErpChangeBatch(BaseModel):
    batch_id: str = Field(..., min_length=1)
    events: list[ErpChangeEvent] = Field(..., min_length=1, max_length=1000)


def _require_event_sync_enabled() -> None:
    if not getattr(settings, "ERP_EVENT_SYNC_ENABLED", False):
        raise HTTPException(
            status_code=503,
            detail={
                "code": "EVENT_SYNC_DISABLED",
                "message": "Event-driven ERP sync is disabled; use /api/sync/batch polling path.",
            },
        )


def _require_operator(current_user: dict[str, Any]) -> None:
    if current_user.get("role") not in {"admin", "supervisor"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.post("")
async def ingest_change_events(
    batch: ErpChangeBatch,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> dict[str, Any]:
    """Bridge ingest: append observed ERP changes to the event stream."""
    _require_event_sync_enabled()
    _require_operator(current_user)

    producer = ErpSyncEventProducer(redis_service.client)
    accepted: list[str] = []
    rejected: list[dict[str, str]] = []
    for event in batch.events:
        try:
            message_id = await producer.publish(
                change_type=event.change_type,
                item_code=event.item_code,
                payload=event.payload,
                source_version=event.source_version,
            )
            accepted.append(message_id)
        except ValueError as e:
            rejected.append({"item_code": event.item_code, "error": str(e)})

    logger.info(
        "ERP event batch %s ingested: %s accepted, %s rejected",
        batch.batch_id, len(accepted), len(rejected),
    )
    return {
        "batch_id": batch.batch_id,
        "accepted": len(accepted),
        "rejected": rejected,
    }


@router.get("/metrics")
async def event_sync_metrics(
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> dict[str, Any]:
    """Latency / throughput / queue-depth metrics for the ops dashboard."""
    _require_operator(current_user)
    metrics = await get_sync_metrics(redis_service.client)
    metrics["enabled"] = bool(getattr(settings, "ERP_EVENT_SYNC_ENABLED", False))
    return metrics


@router.post("/dlq/requeue")
async def requeue_dlq(
    limit: Optional[int] = 100,
    current_user: dict[str, Any] = Depends(get_current_user),
    redis_service=Depends(get_redis),
) -> dict[str, Any]:
    """Move dead-lettered events back onto the main stream for reprocessing."""
    _require_event_sync_enabled()
    _require_operator(current_user)
    moved = await requeue_dead_letters(redis_service.client, limit=max(1, min(limit or 100, 1000)))
    return {"requeued": moved}
