# Realtime Dashboard Live Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the admin realtime dashboard so KPI cards, table rows, and live status refresh from websocket events while the screen is open.

**Architecture:** Reuse the existing `/ws/updates` channel instead of introducing a second dashboard transport. Backend count-line mutations will broadcast narrow dashboard events to supervisor and admin websocket clients, and the dashboard screen will subscribe once, coalesce incoming events, and refetch its existing REST data/stats endpoints.

**Tech Stack:** FastAPI, MongoDB, React Native / Expo Router, existing `useWebSocket` hook, Jest, pytest

---

### Task 1: Add failing backend websocket coverage

**Files:**
- Modify: `backend/tests/test_websocket_manager.py`
- Modify: `backend/tests/test_count_lines_api.py`

**Step 1: Write the failing tests**

- Add a websocket manager test proving role-targeted broadcasts only reach matching roles.
- Add count-line route tests proving `verify_stock` and `unverify_stock` emit dashboard refresh events.

**Step 2: Run tests to verify they fail**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_websocket_manager.py backend/tests/test_count_lines_api.py -k "broadcast_to_roles or dashboard_event"`

Expected: FAIL because the manager has no role-targeted broadcast and verify paths do not emit dashboard events.

**Step 3: Write minimal backend implementation**

- Extend `backend/core/websocket_manager.py` with per-user role tracking and a `broadcast_to_roles(...)` helper.
- Pass the authenticated role into `backend/api/websocket_api.py`.
- Add a small helper in `backend/api/count_lines_routes.py` that emits dashboard events after create, verify, and unverify mutations.

**Step 4: Run tests to verify they pass**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_websocket_manager.py backend/tests/test_count_lines_api.py -k "broadcast_to_roles or dashboard_event"`

Expected: PASS

### Task 2: Add failing frontend realtime-refresh coverage

**Files:**
- Create: `frontend/src/components/admin/realtime-dashboard/realtimeDashboardLive.ts`
- Create: `frontend/src/components/admin/realtime-dashboard/__tests__/realtimeDashboardLive.test.ts`

**Step 1: Write the failing tests**

- Cover which websocket message types should trigger a dashboard refresh.
- Cover connection badge state derivation for live, reconnecting, and offline states.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --runTestsByPath src/components/admin/realtime-dashboard/__tests__/realtimeDashboardLive.test.ts`

Expected: FAIL because the helper module does not exist yet.

**Step 3: Write minimal frontend implementation**

- Add pure helpers for message filtering and connection-state labels.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --runTestsByPath src/components/admin/realtime-dashboard/__tests__/realtimeDashboardLive.test.ts`

Expected: PASS

### Task 3: Wire the dashboard screen to websocket events

**Files:**
- Modify: `frontend/app/admin/realtime-dashboard.screen.tsx`
- Modify: `frontend/src/components/admin/realtime-dashboard/RealtimeDashboardToolbar.tsx`

**Step 1: Write the failing screen-level expectation**

- Add or extend a focused test around the live helper behavior if the screen itself is too heavy for direct rendering.

**Step 2: Write minimal implementation**

- Subscribe to `useWebSocket()` while the dashboard screen is mounted.
- Replace unconditional 10-second polling with push-driven refresh when connected, keeping timed refresh only as fallback when auto-refresh is enabled but the socket is disconnected.
- Coalesce websocket-driven refreshes so bursts of scan events do not trigger redundant requests.
- Show a compact live status badge in the toolbar.

**Step 3: Run focused frontend verification**

Run: `npm test -- --runTestsByPath src/components/admin/realtime-dashboard/__tests__/realtimeDashboardLive.test.ts src/hooks/__tests__/useWebSocket.test.tsx`

Expected: PASS

### Task 4: End-to-end focused verification

**Files:**
- Modify as needed from previous tasks only

**Step 1: Run backend verification**

Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_websocket_manager.py backend/tests/test_count_lines_api.py -k "broadcast_to_roles or dashboard_event or verify_stock or unverify_stock"`

Expected: PASS

**Step 2: Run frontend verification**

Run: `npm test -- --runTestsByPath src/components/admin/realtime-dashboard/__tests__/realtimeDashboardLive.test.ts src/hooks/__tests__/useWebSocket.test.tsx`

Expected: PASS

**Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS
