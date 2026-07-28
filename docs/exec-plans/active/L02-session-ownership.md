# Session Ownership Execution Plan

## Goal
Implement exclusive but safely recoverable sessions with claim, pause, resume, release, and takeover.

## Loop Status
IN_PROGRESS

## Dependencies
None for L02 (first parallel loop)

## Execution Steps
1. Define session_claims, session_ownership_events, session_takeover_requests collections
2. Implement POST /location-sessions/claim
3. Implement POST /location-sessions/{id}/pause
4. Implement POST /location-sessions/{id}/resume
5. Implement POST /location-sessions/{id}/release
6. Implement POST /location-sessions/{id}/takeover
7. Add unique indexes for one-active-session-per-employee and one-active-session-per-location
8. Add PAUSED as a real state (do not convert to ACTIVE)
9. Add 60-minute inactivity detection
10. Write unit tests for all endpoints
11. Write integration tests for concurrent claims

## Verification
- Two simultaneous claims for same rack: one succeeds
- Same staff creates second active location session: blocked
- Pause and resume
- Release and new claim
- 59-minute inactivity: takeover blocked
- 60-minute inactivity: takeover eligible

## Acceptance Criteria
- No session can have ambiguous active ownership
- Session creation does not revoke refresh tokens