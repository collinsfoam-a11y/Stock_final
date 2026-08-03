# Session Domain Architecture

## Overview

The session domain manages counting sessions with exclusive ownership, safe recovery, and full auditability.

## Two-Level Session Model

### Master Session

Created by a supervisor, administrator, or owner for a count programme. Controls:
- ERP baseline snapshot
- Counting scope (locations included)
- Policy version
- Overall completion and final approval

### Location Session

Created or claimed by staff for a specific physical location within a master session. Staff choose the showroom/godown, floor, and rack.

## Location Session Statuses

| Status | Description |
|---|---|
| AVAILABLE | No staff member has claimed this location |
| CLAIMED | A staff member has claimed but not yet started counting |
| ACTIVE | Staff is actively counting at this location |
| PAUSED | Staff has paused work; ownership is preserved |
| RELEASED | Staff has explicitly released the location |
| STALE | No heartbeat for 60 minutes; eligible for takeover |
| SUBMITTED | All counts at this location have been submitted |
| RECOUNT | A recount has been requested |
| UNDER_REVIEW | Supervisor is reviewing the count |
| APPROVED | Count has been approved |
| CLOSED | Session is complete and archived |
| CANCELLED | Session was cancelled before completion |

## Ownership Rules

1. Staff can create a location session only when they have no other active session.
2. The location must not already be claimed.
3. PAUSED is a real state (not converted to ACTIVE).
4. Explicit pause releases the active work lock but preserves ownership history.
5. After 60 minutes without heartbeat, state becomes STALE.
6. Another staff member may claim a stale session only after server confirmation.
7. Unsynchronised work on the former device creates a takeover warning.
8. Supervisor takeover requires a reason.
9. Every ownership change is append-only.

## Endpoints

- `POST /location-sessions/claim` — Claim a location session
- `POST /location-sessions/{id}/pause` — Pause an active session
- `POST /location-sessions/{id}/resume` — Resume a paused session
- `POST /location-sessions/{id}/release` — Release a session
- `POST /location-sessions/{id}/takeover` — Takeover a stale session

## Session Claim Fields

- `session_id`
- `staff_user`
- `device_id`
- `claimed_at`
- `last_heartbeat`
- `released_at`
- `release_reason`
- `claim_version`