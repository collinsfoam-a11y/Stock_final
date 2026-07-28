# Session Ownership Execution Plan

## Goal
Implement exclusive but safely recoverable sessions with claim, pause, resume, release, and takeover.

## Loop Status
COMPLETED (initial implementation on loop/L02-session-ownership)

## Changes Made

### Backend (session_management_api.py)
- Removed `_close_existing_user_sessions()` call from `create_session` (fixes refresh token revocation bug)
- Replaced `_find_existing_session_for_warehouse()` with two new functions:
  - `_find_existing_session_for_employee()`: Enforces one active session per employee
  - `_find_existing_session_for_location()`: Enforces one active location session per physical location
- Fixed PAUSED-to-ACTIVE conversion bug in `update_session_status` endpoint
- Added new endpoints:
  - `POST /location-sessions/claim` — Claim an available location session
  - `POST /location-sessions/{session_id}/pause` — Pause an active session (PAUSED is a real state)
  - `POST /location-sessions/{session_id}/resume` — Resume a paused session
  - `POST /location-sessions/{session_id}/release` — Release a session making it available for others
  - `POST /location-sessions/{session_id}/takeover` — Takeover a stale session (supervisor/admin only)

### Ownership Models
- `SessionClaimRequest` — Request to claim an available session
- `SessionClaimResponse` — Response confirming claim
- `SessionTakeoverRequest` — Request to take over a stale session
- `SessionTakeoverResponse` — Response confirming takeover

### Database (indexes.py)
- Added `session_claims` collection indexes:
  - `idx_claim_session_id`: unique on session_id
  - `idx_claim_staff_time`: staff_user + claimed_at desc
  - `idx_claim_version`: session_id + claim_version desc
- Added `session_ownership_events` collection indexes:
  - `idx_ownership_session_time`: session_id + timestamp desc
  - `idx_ownership_actor_event`: actor + event_type
  - `idx_ownership_session_event`: session_id + event_type

### Ownership Enforcement
- Employee can have at most one active session at any time
- Physical rack/location can have at most one active claimant
- PAUSED is a real state (not converted to ACTIVE)
- Ownership changes are append-only via ownership_events array
- Session creation does not revoke refresh tokens

## Required Tests (pending implementation)
- Two simultaneous claims for same rack: one succeeds
- Same staff creates second active location session: blocked
- Pause and resume
- Release and new claim
- 59-minute inactivity: takeover blocked
- 60-minute inactivity: takeover eligible
- Former device submits after takeover: quarantined conflict
- Staff cannot view another employee's active work
- Supervisor/admin access works
- Session creation does not revoke refresh tokens

## Exit Criteria
No session can have ambiguous active ownership.
