---
name: frontend-offline-sync-contract
description: Use when changing Stock Verify frontend offline storage, sync queues, scan submission, API client mapping, conflict handling, idempotency, serial prechecks, or React Native scan/session flows. Keeps frontend behavior aligned with the backend Stock Contract V3.1.
---

# Frontend Offline Sync Contract

Use this skill for frontend work involving scan flows, offline queues, sync retries, API payloads, local storage, serial validation, session state, or conflict displays.

## Authoritative Docs

- `AGENTS.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/DOMAIN.md`
- `docs/STOCK_VERIFICATION_V3_UI_UX_GUIDE.md`
- `docs/TESTING_GUIDE.md`

## Rules

- Offline sync must be idempotent and conflict-aware.
- Require or preserve `idempotency_key` where sync writes can replay.
- Preserve `scan_fingerprint` behavior where applicable.
- Prefer additive or merge semantics. Do not introduce overwrite sync flows.
- Keep serial checks item-scoped (`item_code + serial`) across UI precheck, local queue, and backend calls.
- Frontend API changes must keep snake_case to camelCase mapping aligned in `frontend/src/services/api/api.ts`.
- Prefer existing offline-first storage and API patterns instead of adding a second sync model.
- Strict mode and projection gaps must be visible to the user; do not hide sync or projection failures behind generic success states.

## Workflow

1. Locate the existing API/storage/sync path before editing.
2. Confirm whether the change affects local queue shape, retry behavior, conflict state, or backend payload names.
3. Keep UI actions idempotent: retry must not duplicate count lines or serials.
4. Preserve user input during offline, retry, navigation, reconnect, and validation failures.
5. Add or run focused tests for the touched flow.

## Verification

Useful frontend checks:

- `cd frontend && npm run typecheck`
- `cd frontend && npm test -- --runInBand`
- `cd frontend && npm run e2e:recount-smoke` when scan/recount behavior changes and the local stack is available

For cross-contract changes, also run focused backend tests when Python is available.
