# ADR-001: Event-Driven ERP Synchronization over Redis Streams

Status: Accepted (v2.2)
Date: 2026-07-20

## Context

ERP master data reaches MongoDB through a 15-minute polling loop
(Sync Bridge -> `/api/sync/batch`). That ceiling on freshness is the root
cause of the stale-variance race the requirement audit flagged: counts made
against a snapshot can diverge from reality for up to 15 minutes.

Success criterion for v2.2: <5s propagation with event mode enabled, while
keeping polling as the fallback and changing no existing API contracts.

## Decision

Add an opt-in event pipeline (flag: `ERP_EVENT_SYNC_ENABLED`, default off):

```
SQL Server Change Tracking -> Sync Bridge -> POST /api/erp/sync/events
  -> Redis Stream "erp:sync:events" -> consumer group "erp-sync-workers"
  -> MongoDB erp_items upsert -> WebSocket broadcast "erp_item_synced"
```

Key choices:

- **Redis Streams over Pub/Sub or a broker**: Redis is already in the stack
  (locks, cache, pub/sub). Streams add durability (events survive consumer
  restarts), consumer groups, and pending-entry tracking without new
  infrastructure. A move to Kafka/NATS stays possible behind the same
  producer/consumer interfaces if scale demands it.
- **Ordering**: single stream + single logical consumer. Redis Streams
  preserve insertion order; one consumer guarantees updates to the same item
  apply in bridge-observed order. Throughput comes from batched reads
  (COUNT=100), not parallelism. If parallel workers become necessary,
  partition by hash(item_code) into N streams, one consumer each.
- **Idempotency**: `event_id = sha256(item_code + source_version)`. The
  consumer records processed ids in a TTL'd Redis set and skips replays
  (bridge retries, redeliveries after crash).
- **Retry/DLQ**: failures re-queue with a retry counter; after 3 attempts
  the event moves to `erp:sync:dlq` with the error. Operators inspect and
  requeue via `POST /api/erp/sync/events/dlq/requeue`.
- **Deletes are soft**: `is_deleted: true` instead of document removal, so
  exports, audit history, and count lines keep resolving their item refs
  (database compatibility constraint).
- **Latency measurement**: events carry `produced_at`; the consumer records
  per-event latency and rolling aggregates in `erp:sync:metrics`, exposed at
  `GET /api/erp/sync/events/metrics` for the ops dashboard.
- **Fallback**: polling sync is untouched and keeps running. When the flag
  is off (or Redis is down) the ingest endpoints answer 503 and the bridge
  uses `/api/sync/batch` as before.

## Consequences

- Near real-time item freshness shrinks the stale-variance window that the
  server-side approval guard (FR-M-34, see count_lines_routes) protects
  against; the guard remains as defense in depth.
- New operational surface: stream depth, pending entries, and DLQ depth need
  monitoring (metrics endpoint feeds the live ops dashboard, Priority 5).
- The Sync Bridge needs a change-tracking query + event POST mode; until it
  ships, enabling the flag simply means the endpoints are live but idle.
