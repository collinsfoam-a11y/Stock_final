"""Event-driven ERP synchronization over Redis Streams (v2.2, Priority 1).

Replaces the freshness ceiling of the 15-minute polling loop with near
real-time change propagation while keeping polling as the fallback path:

    SQL Server Change Tracking -> Sync Bridge -> POST /api/erp/sync/events
        -> Redis Stream (producer) -> consumer group workers -> MongoDB
        -> WebSocket broadcast to connected clients

Design decisions (see docs/architecture/ADR-001-event-driven-erp-sync.md):

- **Ordering**: one stream, one consumer per group. Redis Streams preserve
  insertion order, and a single logical consumer guarantees updates to the
  same item apply in the order the bridge observed them. Throughput headroom
  comes from batch reads (COUNT), not parallel consumers.
- **Idempotency**: every event carries an `event_id` derived from
  (item_code, source_version). Processed ids are remembered in a Redis SET
  with a TTL; replays (bridge retries, XAUTOCLAIM re-deliveries) are skipped.
- **Retry / DLQ**: processing failures increment a per-event retry counter;
  events are re-queued up to MAX_RETRIES, then appended to a dead-letter
  stream with the failure reason for operator inspection / requeue.
- **Latency**: each event stamps `produced_at`; the consumer records
  (processed_at - produced_at) into a rolling metrics hash exposed at
  /api/erp/sync/events/metrics.
- **Fallback**: the existing polling sync is untouched. Event mode is
  opt-in via ERP_EVENT_SYNC_ENABLED and degrades to polling when Redis is
  unavailable.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

STREAM_KEY = "erp:sync:events"
DLQ_STREAM_KEY = "erp:sync:dlq"
CONSUMER_GROUP = "erp-sync-workers"
CONSUMER_NAME = "worker-1"
PROCESSED_SET_KEY = "erp:sync:processed"
METRICS_KEY = "erp:sync:metrics"
PROCESSED_TTL_SECONDS = 24 * 3600
MAX_RETRIES = 3
READ_BLOCK_MS = 5000
READ_COUNT = 100

VALID_CHANGE_TYPES = {"insert", "update", "delete"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def build_event_id(item_code: str, source_version: str) -> str:
    """Deterministic id so bridge retries and re-deliveries dedupe."""
    raw = f"{item_code}:{source_version}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


class ErpSyncEventProducer:
    """Appends ERP change events to the Redis Stream."""

    def __init__(self, redis_client: Any):
        self._redis = redis_client

    async def publish(
        self,
        *,
        change_type: str,
        item_code: str,
        payload: dict[str, Any],
        source_version: str,
    ) -> str:
        if change_type not in VALID_CHANGE_TYPES:
            raise ValueError(f"Unsupported change_type: {change_type}")
        if not item_code:
            raise ValueError("item_code is required")

        event_id = build_event_id(item_code, source_version)
        fields = {
            "event_id": event_id,
            "change_type": change_type,
            "item_code": item_code,
            "payload": json.dumps(payload, default=str),
            "source_version": source_version,
            "produced_at": str(time.time()),
            "retries": "0",
        }
        message_id = await self._redis.xadd(STREAM_KEY, fields)
        return message_id if isinstance(message_id, str) else message_id.decode()


class ErpSyncEventConsumer:
    """Consumer-group worker: applies events to MongoDB and broadcasts."""

    def __init__(
        self,
        redis_client: Any,
        db: Any,
        *,
        broadcast: Any | None = None,
        consumer_name: str = CONSUMER_NAME,
    ):
        self._redis = redis_client
        self._db = db
        self._broadcast = broadcast
        self._consumer_name = consumer_name
        self._running = False
        self._task: asyncio.Task | None = None

    async def ensure_group(self) -> None:
        try:
            await self._redis.xgroup_create(STREAM_KEY, CONSUMER_GROUP, id="0", mkstream=True)
        except Exception as e:  # BUSYGROUP -> group already exists
            if "BUSYGROUP" not in str(e):
                raise

    async def start(self) -> None:
        await self.ensure_group()
        self._running = True
        self._task = asyncio.create_task(self._run_loop(), name="erp-event-sync-consumer")
        logger.info("ERP event sync consumer started (stream=%s)", STREAM_KEY)

    async def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None

    async def _run_loop(self) -> None:
        while self._running:
            try:
                await self.consume_once(block_ms=READ_BLOCK_MS)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error("ERP event sync loop error: %s", e)
                await asyncio.sleep(2)

    async def consume_once(self, *, block_ms: int = 0) -> int:
        """Read and process one batch. Returns number of processed events."""
        entries = await self._redis.xreadgroup(
            CONSUMER_GROUP,
            self._consumer_name,
            {STREAM_KEY: ">"},
            count=READ_COUNT,
            block=block_ms or None,
        )
        if not entries:
            return 0

        processed = 0
        for _stream, messages in entries:
            for message_id, fields in messages:
                await self._handle_message(message_id, _decode_fields(fields))
                processed += 1
        return processed

    async def _handle_message(self, message_id: Any, fields: dict[str, str]) -> None:
        event_id = fields.get("event_id", "")
        try:
            if event_id and await self._already_processed(event_id):
                await self._redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
                await self._bump_metric("deduped")
                return

            await self._apply_change(fields)
            await self._mark_processed(event_id)
            await self._redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)
            await self._record_latency(fields)
            await self._bump_metric("processed")
            await self._notify_clients(fields)
        except Exception as e:
            await self._handle_failure(message_id, fields, error=str(e))

    async def _apply_change(self, fields: dict[str, str]) -> None:
        change_type = fields.get("change_type", "")
        item_code = fields.get("item_code", "")
        payload = json.loads(fields.get("payload") or "{}")

        version = _parse_version(fields.get("source_version"))
        # Version guard: a re-delivered or DLQ-requeued event for an OLDER
        # source_version must not clobber a newer item already stored. The
        # Redis dedupe set only lasts PROCESSED_TTL_SECONDS, so this is the
        # durable protection against last-write-wins corruption.
        if version is not None and await self._is_stale(item_code, version):
            await self._bump_metric("skipped_stale")
            return

        if change_type == "delete":
            # Soft-delete: exports and audit history must keep referencing the
            # item, so mark rather than remove (database compatibility).
            delete_set: dict[str, Any] = {"is_deleted": True, "updated_at": _utc_now()}
            # Only update sync_source_version when the event actually carries
            # one; otherwise we would clobber a previously-stored numeric
            # version with None and disable the staleness guard for future
            # events on this item.
            if version is not None:
                delete_set["sync_source_version"] = version
            await self._db.erp_items.update_one({"item_code": item_code}, {"$set": delete_set})
            return

        doc = {k: v for k, v in payload.items() if k != "_id"}
        doc["item_code"] = item_code
        doc["updated_at"] = _utc_now()
        doc["is_deleted"] = False
        doc["sync_source"] = "event"
        # Same guard as the delete path: preserve any existing numeric version
        # when this event has no parseable source_version.
        if version is not None:
            doc["sync_source_version"] = version
        await self._db.erp_items.update_one({"item_code": item_code}, {"$set": doc}, upsert=True)

    async def _is_stale(self, item_code: str, version: float) -> bool:
        """True when a newer source_version is already stored for this item."""
        existing = await self._db.erp_items.find_one(
            {"item_code": item_code}, {"sync_source_version": 1}
        )
        if not existing:
            return False
        stored = existing.get("sync_source_version")
        return isinstance(stored, (int, float)) and stored > version

    async def _handle_failure(self, message_id: Any, fields: dict[str, str], *, error: str) -> None:
        retries = int(fields.get("retries") or 0)
        await self._redis.xack(STREAM_KEY, CONSUMER_GROUP, message_id)

        if retries + 1 >= MAX_RETRIES:
            dlq_fields = {
                **fields,
                "retries": str(retries + 1),
                "error": error[:500],
                "failed_at": str(time.time()),
            }
            await self._redis.xadd(DLQ_STREAM_KEY, dlq_fields)
            await self._bump_metric("dead_lettered")
            logger.error(
                "ERP sync event dead-lettered (item=%s, retries=%s): %s",
                fields.get("item_code"),
                retries + 1,
                error,
            )
        else:
            retry_fields = {**fields, "retries": str(retries + 1)}
            await self._redis.xadd(STREAM_KEY, retry_fields)
            await self._bump_metric("retried")
            logger.warning(
                "ERP sync event re-queued (item=%s, retry=%s): %s",
                fields.get("item_code"),
                retries + 1,
                error,
            )

    async def _already_processed(self, event_id: str) -> bool:
        return bool(await self._redis.sismember(PROCESSED_SET_KEY, event_id))

    async def _mark_processed(self, event_id: str) -> None:
        if not event_id:
            return
        await self._redis.sadd(PROCESSED_SET_KEY, event_id)
        await self._redis.expire(PROCESSED_SET_KEY, PROCESSED_TTL_SECONDS)

    async def _record_latency(self, fields: dict[str, str]) -> None:
        try:
            produced_at = float(fields.get("produced_at") or 0)
        except ValueError:
            return
        if produced_at <= 0:
            return
        latency_ms = max(0.0, (time.time() - produced_at) * 1000)
        await self._redis.hset(METRICS_KEY, "last_latency_ms", f"{latency_ms:.1f}")
        await self._redis.hincrbyfloat(METRICS_KEY, "total_latency_ms", latency_ms)

    async def _bump_metric(self, name: str) -> None:
        await self._redis.hincrby(METRICS_KEY, name, 1)

    async def _notify_clients(self, fields: dict[str, str]) -> None:
        if self._broadcast is None:
            return
        try:
            await self._broadcast(
                {
                    "type": "erp_item_synced",
                    "item_code": fields.get("item_code"),
                    "change_type": fields.get("change_type"),
                    "synced_at": _utc_now().isoformat(),
                }
            )
        except Exception as e:
            logger.warning("ERP sync broadcast failed: %s", e)


async def get_sync_metrics(redis_client: Any) -> dict[str, Any]:
    """Aggregate metrics for the monitoring endpoint/dashboard."""
    raw = await redis_client.hgetall(METRICS_KEY) or {}
    metrics = {(_d(k)): _d(v) for k, v in raw.items()}
    processed = int(float(metrics.get("processed") or 0))
    total_latency = float(metrics.get("total_latency_ms") or 0.0)

    pending = 0
    try:
        info = await redis_client.xpending(STREAM_KEY, CONSUMER_GROUP)
        pending = int(info.get("pending", 0)) if isinstance(info, dict) else int(info[0])
    except Exception:
        pass

    dlq_depth = 0
    try:
        dlq_depth = int(await redis_client.xlen(DLQ_STREAM_KEY))
    except Exception:
        pass

    stream_depth = 0
    try:
        stream_depth = int(await redis_client.xlen(STREAM_KEY))
    except Exception:
        pass

    return {
        "processed": processed,
        "deduped": int(float(metrics.get("deduped") or 0)),
        "retried": int(float(metrics.get("retried") or 0)),
        "dead_lettered": int(float(metrics.get("dead_lettered") or 0)),
        "last_latency_ms": float(metrics.get("last_latency_ms") or 0.0),
        "avg_latency_ms": (total_latency / processed) if processed else 0.0,
        "pending": pending,
        "stream_depth": stream_depth,
        "dlq_depth": dlq_depth,
    }


async def requeue_dead_letters(redis_client: Any, *, limit: int = 100) -> int:
    """Move events from the DLQ back onto the main stream (retries reset)."""
    entries = await redis_client.xrange(DLQ_STREAM_KEY, count=limit)
    moved = 0
    for message_id, fields in entries or []:
        decoded = _decode_fields(fields)
        decoded["retries"] = "0"
        decoded.pop("error", None)
        decoded.pop("failed_at", None)
        await redis_client.xadd(STREAM_KEY, decoded)
        await redis_client.xdel(DLQ_STREAM_KEY, message_id)
        moved += 1
    return moved


def _parse_version(value: Any) -> float | None:
    """Parse a source_version into a comparable number, or None if not numeric.

    SQL Server change-tracking versions and epoch timestamps are numeric and
    monotonic; non-numeric versions skip the ordering guard (dedupe still
    applies) rather than risk a wrong comparison.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _d(value: Any) -> str:
    return value.decode() if isinstance(value, bytes) else str(value)


def _decode_fields(fields: dict[Any, Any]) -> dict[str, str]:
    return {_d(k): _d(v) for k, v in fields.items()}
