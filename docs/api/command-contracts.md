# API Command Contracts

## Overview

This document defines the API contracts for commands used by the Stock Verify mobile application, particularly for offline-first scenarios.

## Command Contract

### Command Shape

```json
{
  "command_id": "uuid-v4",
  "device_id": "string",
  "client_sequence": "integer",
  "actor_id": "string",
  "master_session_id": "uuid",
  "location_session_id": "uuid",
  "item_code": "string",
  "command_type": "enum",
  "payload": "object",
  "payload_hash": "sha256-hex",
  "created_at": "iso8601",
  "state": "enum"
}
```

### Command Types

| Type | Description |
|---|---|
| COUNT_OBSERVATION | Submit a physical count observation |
| BATCH_PROPOSAL | Propose a new physical batch |
| SERIAL_REGISTRATION | Register a serial unit |
| DAMAGE_REPORT | Report damaged stock |
| LOCATION_VERIFICATION | Request other-location investigation |
| SESSION_CLAIM | Claim a location session |
| SESSION_PAUSE | Pause an active session |
| SESSION_RESUME | Resume a paused session |
| SESSION_RELEASE | Release a session |
| SESSION_TAKEOVER | Takeover a stale session |
| EVIDENCE_UPLOAD | Upload supporting evidence |

### Acknowledgement Shape

```json
{
  "command_id": "uuid-v4",
  "server_received_at": "iso8601",
  "server_accepted_at": "iso8601",
  "state": "ACKNOWLEDGED",
  "observation_id": "uuid (for COUNT_OBSERVATION)"
}
```

## Compatibility Contract

### CountLineCreate (Legacy Compatibility)

The legacy `CountLineCreate` payload is maintained as a compatibility projection. It maps to the new `count_observation` model:

```json
{
  "session_id": "uuid",
  "item_code": "string",
  "quantity": "integer",
  "remark": "string",
  "batch_id": "string (optional)",
  "serial_numbers": ["string"] (optional)",
  "condition": "enum (optional)",
  "damage_type": "enum (optional)",
  "photos": ["string"] (optional)"
}
```

### Migration Strategy

1. Existing `count_lines` collection remains as a compatibility projection.
2. New writes create `count_observation` documents.
3. Compatibility projection syncs from `count_observation` to `count_lines`.
4. Legacy mutation paths are retired only after stable operation is confirmed.