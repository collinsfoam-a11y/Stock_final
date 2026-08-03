# Offline Command Protocol — L07 Implementation

## Scope
Durable offline command protocol providing device-side command journaling, server-side
idempotent command ingestion, and conflict/rejection semantics for stock verification
offline flows.

## Device-side SQLite Schema (Conceptual)

The device maintains a local command journal (typically in SQLite on the mobile client).
Each row is immutable once written. The schema corresponds to the `CommandJournalEntry`
model defined in `backend/api/schemas.py`.

| Column | Type | Notes |
|---|---|---|
| `command_id` | UUID (TEXT) | Stable, never reused. Client-generated. |
| `device_id` | TEXT | Unique per physical device / install. |
| `client_sequence` | INTEGER | Monotonically increasing per device. Used for ordering guard. |
| `actor_id` | TEXT | Staff or system user ID. |
| `master_session_id` | TEXT | Optional top-level session identifier. |
| `location_session_id` | TEXT | Optional location-scoped session identifier. |
| `item_code` | TEXT | Optional item context for the command. |
| `command_type` | TEXT | One of `COUNT_OBSERVATION`, `BATCH_PROPOSAL`, `SERIAL_REGISTRATION`, `CORRECTION`, `DAMAGE_REPORT`, `SESSION_CLAIM`, `HEARTBEAT`. |
| `payload` | JSON | Free-form command payload. |
| `payload_hash` | TEXT | SHA-256 of canonicalized payload. |
| `created_at` | ISO-8601 TEXT | Device local timestamp at creation. |
| `state` | TEXT | Client-side lifecycle: `PENDING`, `IN_FLIGHT`. Server sets terminal states. |
| `retry_count` | INTEGER | Retries attempted by the client. |
| `last_error` | TEXT | Last client-visible error message. |

## Server-side Collection

Collection: `command_journal`

Fields follow the device schema, enriched with server-supplied `actor_id` and server-assigned
terminal `state`.

## Server-side Deduplication Rules

All rules are enforced inside a single transaction per command entry:

1. **Idempotent retry** — same `command_id` + same `payload_hash` → return prior acknowledgement.
   The server does not rewrite the document.
2. **Security conflict** — same `command_id` + different `payload_hash` → rejected as `CONFLICT`.
   A reused `command_id` with modified content is treated as a tampering signal.
3. **Ordering guard** — if the device submits a `client_sequence` lower than the last processed
   sequence for that `device_id`, the command is rejected with `SEQUENCE_TOO_LOW`.
4. **Staff policy guard** — staff `actor_id` payloads must not contain approval fields
   (`approved_by`, `approved_at`, `locked`, `locked_by`). Such payloads are rejected as
   `BLOCKED_POLICY`.
5. **Atomic write + acknowledgement** — business document insertion and acknowledgement
   generation happen in a single Mongo transaction.

## API Contract

`POST /api/commands/sync`

Request:
```json
{
  "device_id": "device-abc-123",
  "commands": [
    {
      "command_id": "550e8400-...",
      "device_id": "device-abc-123",
      "client_sequence": 17,
      "actor_id": "staff-1",
      "master_session_id": "session-1",
      "location_session_id": "loc-session-2",
      "item_code": "ITEM-001",
      "command_type": "COUNT_OBSERVATION",
      "payload": { "counted_qty": 5, "condition": "good" },
      "payload_hash": "sha256:...",
      "created_at": "2026-07-28T10:00:00Z",
      "state": "PENDING",
      "retry_count": 0,
      "last_error": null
    }
  ],
  "client_batch_id": "batch-xyz"
}
```

Response:
```json
{
  "accepted": [
    { "command_id": "550e8400-...", "state": "ACKNOWLEDGED" }
  ],
  "rejected": [],
  "acks": {
    "550e8400-...": { "command_id": "550e8400-...", "state": "ACKNOWLEDGED" }
  },
  "client_batch_id": "batch-xyz"
}
```

Rejection shape:
```json
{
  "command_id": "550e8400-...",
  "state": "REJECTED",
  "reason": "SEQUENCE_TOO_LOW",
  "last_error": "client_sequence 16 <= last_processed 17"
}
```

## Indexes

`command_journal` indexes (defined in `backend/db/indexes.py`):

| Index | Fields | Options |
|---|---|---|
| `idx_command_journal_command_id` | `command_id` ASC | unique |
| `idx_command_journal_device_seq` | `device_id` ASC, `client_sequence` DESC | |
| `idx_command_journal_payload_hash` | `payload_hash` ASC | sparse |
| `idx_command_journal_state_time` | `state` ASC, `created_at` DESC | |
| `idx_command_journal_actor_time` | `actor_id` ASC, `created_at` DESC | |

## Non-negotiable Invariants

| # | Rule |
|---|---|
| 14 | Every offline command has a stable ID and content hash. |
| 15 | A command ID cannot be reused with different content. |

## Migration / Rollback

No data migration is required. The `command_journal` collection is created lazily on first
sync. If the feature is rolled back, the collection can be dropped without affecting
existing stock verification data.
