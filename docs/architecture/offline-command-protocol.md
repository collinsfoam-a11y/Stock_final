# Offline Command Protocol

## Overview

The offline command protocol replaces mutable offline queue replay with a deterministic command journal. Every offline operation is a durable, auditable command.

## Device-Side SQLite Journal

Each command includes:

- `command_id` — Stable UUID, never reused
- `device_id` — Identifies the originating device
- `client_sequence` — Monotonically increasing per device
- `actor_id` — Staff user who initiated the command
- `master_session_id` — Associated master session
- `location_session_id` — Associated location session
- `item_code` — Target item
- `command_type` — e.g., COUNT_OBSERVATION, BATCH_PROPOSAL, SERIAL_REGISTRATION
- `payload` — Command data
- `payload_hash` — SHA-256 of payload content
- `created_at` — Client timestamp (preserved as client timestamp)
- `state` — PENDING, IN_FLIGHT, ACKNOWLEDGED, CONFLICT, REJECTED, BLOCKED_AUTH, BLOCKED_POLICY, MANUAL_REVIEW
- `retry_count` — Number of retry attempts
- `last_error` — Last error message, if any

## Command States

| State | Description |
|---|---|
| PENDING | Command created locally, not yet sent |
| IN_FLIGHT | Command sent to server, awaiting acknowledgement |
| ACKNOWLEDGED | Server processed command successfully |
| CONFLICT | Server detected a conflict (e.g., duplicate command ID with different content) |
| REJECTED | Server rejected the command (e.g., policy violation) |
| BLOCKED_AUTH | Command blocked due to authentication failure |
| BLOCKED_POLICY | Command blocked due to policy violation |
| MANUAL_REVIEW | Command requires supervisor review |

## Server Rules

1. Existing command ID + same hash → return previous acknowledgement (idempotent).
2. Existing command ID + different hash → security conflict.
3. Lower device sequence with unknown command → reject or quarantine.
4. Staff payloads cannot contain approval fields.
5. Business write and idempotency acknowledgement occur in one transaction.
6. Server generates `received_at` and `accepted_at` timestamps.
7. Client timestamps are retained only as client timestamps.

## Reachability

Use backend reachability for LAN synchronisation. Do not require public internet access.

## Preservation Guarantees

The following scenarios must preserve every command:
- Application killed mid-sync
- Device restarts
- Token expires
- LAN disconnects
- Repeated reconnect
- Duplicate HTTP response
- Backend commits but response is lost
- Local storage corruption
- Session takeover occurs

## Never Delete

Unsynchronised commands must never be silently deleted. They persist in the journal until acknowledged, rejected, or explicitly quarantined with a supervisor decision.