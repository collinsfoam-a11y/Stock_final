# Stock_final — Complete Fix Plan
**Generated from three-pass codebase analysis**
**Issues: 27 | Pending Wirings: 8 | Logic Upgrades: 9 | Sprints: 5**

---

## Table of Contents
1. [Severity Index](#severity-index)
2. [CRITICAL Issues (fix immediately)](#critical-issues)
3. [HIGH Issues (fix this sprint)](#high-issues)
4. [MEDIUM Issues (fix next sprint)](#medium-issues)
5. [Pending Wirings](#pending-wirings)
6. [Logic Upgrades](#logic-upgrades)
7. [Execution Plan (Sprint Breakdown)](#execution-plan)

---

## Severity Index

| # | ID | Severity | File | Description |
|---|---|---|---|---|
| 1 | C-01 | CRITICAL | `api/reporting_api.py` | Any user can query any MongoDB collection |
| 2 | C-02 | CRITICAL | `api/notes_api.py` | ReDoS via unescaped regex in search |
| 3 | C-03 | CRITICAL | `core/lifespan.py` | Zero backend Python test coverage |
| 4 | H-01 | HIGH | `api/count_lines_routes.py` | Session status case-sensitivity blocks valid counts |
| 5 | H-02 | HIGH | `api/count_lines_routes.py` | In-memory full scan for verified filter |
| 6 | H-03 | HIGH | `api/count_lines_routes.py` | Approval race condition, no optimistic concurrency |
| 7 | H-04 | HIGH | `api/realtime_dashboard_api.py` | Two independent WebSocket managers |
| 8 | H-05 | HIGH | `api/realtime_dashboard_api.py` | JWT in URL path logged by proxies |
| 9 | H-06 | HIGH | `core/websocket_manager.py` | WS manager is process-local, breaks multi-worker |
| 10 | H-07 | HIGH | `services/rate_limiter.py` | Rate limiter is process-local, breaks multi-worker |
| 11 | H-08 | HIGH | `services/cache_service.py` | Cache thundering herd (no stampede protection) |
| 12 | H-09 | HIGH | `services/ai_search.py` | AI search blocks event loop (synchronous CPU) |
| 13 | H-10 | HIGH | `frontend/…/enhancedApiClient.ts` | Retries non-idempotent POST/PATCH |
| 14 | M-01 | MEDIUM | `core/lifespan.py` | Lock service silently None — no operator alert |
| 15 | M-02 | MEDIUM | `core/lifespan.py` | Auto-sync manager double instantiation |
| 16 | M-03 | MEDIUM | `app_factory.py` | Dead duplicate `init_default_users` never called |
| 17 | M-04 | MEDIUM | `app_factory.py` | Business logic (verify/unverify/get_count_lines) defined twice |
| 18 | M-05 | MEDIUM | `services/circuit_breaker.py` | TOCTOU race on `is_available` property |
| 19 | M-06 | MEDIUM | `services/governance_guard.py` | `__getattr__` fallthrough bypasses write guard |
| 20 | M-07 | MEDIUM | `api/admin_control_api.py` | Start endpoints are no-ops (return success, do nothing) |
| 21 | M-08 | MEDIUM | `api/admin_control_api.py` | Synchronous log file read blocks event loop |
| 22 | M-09 | MEDIUM | `api/admin_control_api.py` | Lazy pandas import in request handler |
| 23 | M-10 | MEDIUM | `app_factory.py` | Sentry initialized at module import time |
| 24 | M-11 | MEDIUM | `core/lifespan.py` | `install_db_write_guards` called at module level |
| 25 | L-01 | LOW | `api/admin_control_api.py` | Device deduplication uses IP+platform (multi-user collision) |
| 26 | L-02 | LOW | `api/notifications_api.py` | `unread_count` in `BatchNotificationRequest` is unused |
| 27 | L-03 | LOW | `api/reconciliation_api.py` | `$max` for baseline_qty may select wrong baseline |

---

## CRITICAL Issues

---

### C-01 — Reporting API Unrestricted Collection Access

**File:** `backend/api/reporting_api.py`
**Endpoint:** `POST /api/reports/query/preview`

**Problem:**
The endpoint accepts an arbitrary `collection` field from any authenticated user and runs
a MongoDB aggregation on it. There is no allowlist. A staff user can send:
```json
{ "collection": "users", "limit": 100 }
```
and receive paginated records from the `users` collection including hashed passwords,
roles, custom permissions, and disabled permissions. Same applies to `refresh_tokens`,
`audit_logs`, `pin_authentication`, and any other collection.

**Root Cause:**
`QueryBuilder.build_pipeline()` takes `collection` as a plain string and passes it
directly to `db[query_spec.collection].aggregate(pipeline)`. No validation.

**Fix — Step 1: Add a collection allowlist constant**
```python
# backend/api/reporting_api.py  (top of file, after imports)

REPORT_ALLOWED_COLLECTIONS = frozenset({
    "count_lines",
    "sessions",
    "erp_items",
    "activity_logs",
    "audit_logs",       # read-only audit data — keep if supervisors need it
    "sync_logs",
    "notifications",
})
```

**Fix — Step 2: Validate collection before executing**
```python
@router.post("/query/preview")
async def preview_query(
    query_spec: QuerySpec,
    current_user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    # ADD THIS BLOCK
    if query_spec.collection not in REPORT_ALLOWED_COLLECTIONS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "COLLECTION_NOT_ALLOWED",
                "message": f"Collection '{query_spec.collection}' is not available for reporting.",
                "allowed": sorted(REPORT_ALLOWED_COLLECTIONS),
            },
        )
    # ... rest of handler unchanged
```

**Fix — Step 3: Apply the same allowlist to all other reporting endpoints**
Check `create_snapshot`, `compare_snapshots`, `export_*` endpoints in `reporting_api.py`
and any engine that accepts a collection name parameter — apply the same guard.

**Fix — Step 4: Add RBAC overlay**
Restrict `audit_logs` to `supervisor`/`admin` only within the allowlist check:
```python
SUPERVISOR_ONLY_COLLECTIONS = frozenset({"audit_logs"})

if query_spec.collection in SUPERVISOR_ONLY_COLLECTIONS:
    role = current_user.get("role", "")
    if role not in {"supervisor", "admin"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this collection")
```

---

### C-02 — ReDoS via Unescaped Regex in Notes Search

**File:** `backend/api/notes_api.py`
**Endpoint:** `GET /notes?q=...`

**Problem:**
User-supplied `q` is passed through `sanitize_for_logging` (a logging sanitiser, NOT
a regex escaper) and then inserted directly into a MongoDB `$regex` filter:
```python
safe_q = sanitize_for_logging(q)   # ← does NOT escape regex metacharacters
query = {"$or": [
    {"title": {"$regex": safe_q, "$options": "i"}},
    {"content": {"$regex": safe_q, "$options": "i"}},
]}
```
Input `(((((a+)+)+)+)+)` causes catastrophic backtracking in MongoDB's regex engine.
Input `.*` returns all notes for that user. Input `[invalid` causes a query error (500).

**Root Cause:**
Missing `re.escape()` call. `sanitize_for_logging` only strips/truncates for log safety.

**Fix:**
```python
import re

# In list_notes handler, replace:
safe_q = sanitize_for_logging(q)

# With:
safe_q = re.escape(q.strip())   # literal search, no regex injection
```

**Additional hardening** — add search length limit at the Pydantic level:
```python
@router.get("/notes", response_model=dict[str, Any])
async def list_notes(
    q: Optional[str] = Query(default=None, max_length=200, description="Search query"),
    ...
```

---

### C-03 — Zero Backend Python Test Coverage

**Problem:**
There are 0 Python test files in `backend/` that exercise business logic (state machines,
finalization predicates, governance guard, canonical inventory). Only Playwright E2E and
Jest frontend tests exist. Any regression in `is_blocking_finalization`,
`normalize_session_status`, or `recompute_session_totals` goes undetected.

**Fix — Create test infrastructure:**
```
backend/tests/unit/
  __init__.py
  test_canonical_inventory.py
  test_count_state_machine.py
  test_session_state_machine.py
  test_governance_guard.py
  test_circuit_breaker.py
  test_refresh_token.py
backend/tests/integration/
  __init__.py
  test_count_lines_api.py   (already exists in backend/tests/ — move/extend)
  test_sessions_api.py      (already exists)
conftest.py                 (shared fixtures: mock DB, test app factory)
```

**Minimum test cases for `canonical_inventory.py`:**
```python
# backend/tests/unit/test_canonical_inventory.py
import pytest
from backend.services.canonical_inventory import (
    normalize_session_status,
    is_blocking_finalization,
    is_count_line_effectively_reviewed,
    get_effective_count_line_status,
)

class TestNormalizeSessionStatus:
    def test_in_progress_maps_to_active(self):
        assert normalize_session_status("IN_PROGRESS") == "ACTIVE"

    def test_reconciling_maps_to_reconcile(self):
        assert normalize_session_status("RECONCILING") == "RECONCILE"

    def test_active_with_reconciled_at_becomes_reconcile(self):
        assert normalize_session_status("ACTIVE", reconciled_at="2024-01-01") == "RECONCILE"

    def test_unknown_value_returns_unknown(self):
        assert normalize_session_status("") == "UNKNOWN"
        assert normalize_session_status(None) == "UNKNOWN"

    def test_case_insensitive(self):
        assert normalize_session_status("completed") == "COMPLETED"

class TestIsBlockingFinalization:
    def test_superseded_line_never_blocks(self):
        line = {"status": "superseded"}
        assert is_blocking_finalization(line) is False

    def test_locked_line_never_blocks(self):
        line = {"status": "locked"}
        assert is_blocking_finalization(line) is False

    def test_rejected_line_blocks(self):
        line = {"status": "rejected", "variance": 0}
        assert is_blocking_finalization(line) is True

    def test_approved_line_with_variance_does_not_block(self):
        # C3+MM10 fix regression test
        line = {"status": "approved", "approval_status": "APPROVED", "variance": 5.0}
        assert is_blocking_finalization(line) is False

    def test_pending_with_variance_blocks_when_unapproved(self):
        line = {"status": "pending", "variance": 5.0, "approval_status": "PENDING"}
        assert is_blocking_finalization(line) is True

    def test_recount_pending_blocks(self):
        line = {
            "status": "pending",
            "variance": 0,
            "assigned_to": "user1",
            "recount_requested_at": "2024-01-01",
        }
        assert is_blocking_finalization(line) is True
```

**Run command:** Add `pytest backend/tests/unit/ -v` to CI pipeline.

---

## HIGH Issues

---

### H-01 — Session Status Case-Sensitivity Blocks Valid Counts

**File:** `backend/api/count_lines_routes.py`
**Function:** `_ensure_session_accepts_counts` (~line 501)

**Problem:**
```python
def _ensure_session_accepts_counts(session: dict[str, Any]) -> None:
    if session.get("status") not in ["OPEN", "ACTIVE"]:   # ← uppercase only
        raise HTTPException(status_code=400, detail="Session is not active")
```
If a session document has `status: "open"` (sync from external system, legacy record,
or a client that sends lowercase), this rejects every count line creation with a 400.
The canonical normaliser in `canonical_inventory.py` exists but is not called here.

**Fix:**
```python
from backend.services.canonical_inventory import normalize_session_status

def _ensure_session_accepts_counts(session: dict[str, Any]) -> None:
    normalized = normalize_session_status(
        session.get("status"),
        reconciled_at=session.get("reconciled_at"),
    )
    if normalized not in {"OPEN", "ACTIVE"}:
        raise HTTPException(
            status_code=400,
            detail=f"Session is not active (status: {normalized})",
        )
    if session.get("reconciled_at"):
        raise HTTPException(status_code=400, detail="Session is in reconciliation mode")
```

**Also audit:** Every place in `count_lines_routes.py` that does a raw string comparison
against session status (grep `session.get("status")`). Apply `normalize_session_status`
consistently.

---

### H-02 — In-Memory Full Scan for Verified Count Line Filter

**File:** `backend/api/count_lines_routes.py`
**Function:** `get_count_lines` (~line 1482)

**Problem:**
When `verified=True/False` is passed, the function streams ALL count lines for the session
and filters in Python using `is_count_line_effectively_reviewed`. For a session with
5,000 lines this fetches 5,000 documents from MongoDB, projects each in Python, and
discards most of them. This blocks the event loop and consumes significant memory.

**Root Cause:**
`is_count_line_effectively_reviewed` is a composite predicate that cannot be expressed
as a single MongoDB filter because it combines `verified`, `approval_status`, `status`,
`assigned_to`, `recount_requested_at`, and `variance` fields. A pure DB-side filter
would need to replicate all the logic.

**Fix — Materialized `effective_reviewed` field approach:**
Add a `effective_reviewed` boolean field written on every count line mutation, so MongoDB
can filter on it directly.

Step 1 — Write the field on insert/update in `_build_count_line_document`:
```python
# After building the count_line dict, add:
count_line["effective_reviewed"] = is_count_line_effectively_reviewed(count_line)
```

Step 2 — Write the field on every state change (approve, reject, verify, unverify):
```python
# In approve_count_line, add to the $set:
"effective_reviewed": True,

# In reject_count_line:
"effective_reviewed": False,

# In verify_stock:
"effective_reviewed": True,   # if it was the last pending review item

# In unverify_stock:
"effective_reviewed": False,
```

Step 3 — Use the materialized field in the query:
```python
async def get_count_lines(session_id, current_user, page=1, page_size=50, verified=None, *, db_override=None):
    db_client = _get_db_client(db_override)
    filter_query: dict[str, Any] = {"session_id": session_id}

    if verified is not None:
        filter_query["effective_reviewed"] = verified   # ← DB-side filter

    skip = (page - 1) * page_size
    total = await db_client.count_lines.count_documents(filter_query)
    lines_cursor = (
        db_client.count_lines.find(filter_query, {"_id": 0})
        .sort("counted_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    lines = await lines_cursor.to_list(length=page_size)
    lines = [materialize_count_line_review_state(line) for line in lines]
    ...
```

Step 4 — Add MongoDB index:
```python
# In backend/db/indexes.py (or wherever indexes are defined):
await db.count_lines.create_index([("session_id", 1), ("effective_reviewed", 1)])
```

Step 5 — Backfill existing records (one-time migration):
```python
# backend/scripts/backfill_effective_reviewed.py
async def backfill():
    async for line in db.count_lines.find({"effective_reviewed": {"$exists": False}}):
        val = is_count_line_effectively_reviewed(line)
        await db.count_lines.update_one(
            {"_id": line["_id"]},
            {"$set": {"effective_reviewed": val}},
        )
```

---

### H-03 — Approval Race Condition (No Optimistic Concurrency)

**File:** `backend/api/count_lines_routes.py`
**Functions:** `approve_count_line`, `reject_count_line`

**Problem:**
Two supervisors can approve the same count line if their lock acquisitions are serialised
but the second acquires the lock after the first has released it (the lock TTL window).
The second approval writes over the first's `approved_by`/`approved_at` data. There is
no check that the line is still in an approvable state at the point of writing.

**Fix — Add approval_status pre-condition to the update filter:**
```python
# In approve_count_line, change the write_service.process_write call:
result = await write_service.process_write(
    {
        "operation": "update_one",
        "filter": {
            "_id": count_line["_id"],
            # Optimistic concurrency: only update if still in a pending state
            "approval_status": {"$nin": ["APPROVED", "REJECTED"]},
            "status": {"$nin": ["approved", "rejected", "locked"]},
        },
        "update": {
            "$set": {
                "status": "approved",
                "approval_status": "APPROVED",
                "approved_by": current_user["username"],
                "approved_at": approved_at,
                "approval_note": request.notes if request else None,
                "rejection_reason": None,
                "assigned_to": None,
                "effective_reviewed": True,
            }
        },
    },
    context={"session_id": str(count_line.get("session_id") or ""), "governance_mode": "mutable_session"},
)

# Then check modified_count instead of matched_count:
if result.modified_count == 0:
    # Re-fetch to distinguish "already approved" from "not found"
    current_state = await _find_count_line(db, line_id)
    if current_state and current_state.get("approval_status") == "APPROVED":
        raise HTTPException(status_code=409, detail="Count line was already approved by another user")
    raise HTTPException(status_code=409, detail="Count line is no longer in a pending state")
```

Apply the same pattern to `reject_count_line` with the symmetric filter.

---

### H-04 — Two Independent WebSocket Managers

**Files:** `backend/api/realtime_dashboard_api.py`, `backend/core/websocket_manager.py`

**Problem:**
`realtime_dashboard_api.py` defines its own `ConnectionManager` class and `manager`
singleton. `websocket_api.py` uses `backend.core.websocket_manager.manager`.
`count_lines_routes.py` broadcasts scan events to `core.websocket_manager.manager`.
Supervisors connected to the dashboard WebSocket receive no scan events. Scan events
and dashboard refreshes go to completely different sets of connected clients.

**Fix — Remove the local manager and wire dashboard WS to the core manager:**

Step 1 — Delete `class ConnectionManager` and `manager = ConnectionManager()` from
`realtime_dashboard_api.py`.

Step 2 — Import the core manager instead:
```python
# backend/api/realtime_dashboard_api.py
from backend.core.websocket_manager import manager
```

Step 3 — Update `websocket_endpoint` in `realtime_dashboard_api.py` to use the core
manager's connect/disconnect interface (same signature as `websocket_api.py`'s endpoint):
```python
@realtime_dashboard_router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    # Decode the token to get a real user_id
    try:
        payload = decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except Exception:
        await websocket.accept()
        await websocket.close(code=1008)
        return

    user_id = payload.get("sub")
    role = payload.get("role", "").lower()
    if not user_id or role not in {"supervisor", "admin"}:
        await websocket.accept()
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user_id, session_id=None, role=role)
    try:
        db = get_db()
        service = AdvancedReportService(db)
        config = DashboardConfig()

        result = await _ws_get_report(service, config)
        await manager.send_personal_message({"type": "initial_data", "payload": result}, user_id)

        while True:
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=config.refresh_interval_seconds,
                )
                config = await _ws_process_message(data, user_id, service, config, db)
            except asyncio.TimeoutError:
                await _ws_handle_auto_refresh(user_id, service, config)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id, None)
    except Exception as e:
        logger.error("Dashboard WS error: %s", sanitize_for_logging(str(e)))
        manager.disconnect(websocket, user_id, None)
```

Step 4 — Update `_ws_handle_config_update` and `_ws_handle_refresh` to use
`manager.send_personal_message` directly (already the correct interface).

---

### H-05 — JWT in URL Path Logged by Proxies

**File:** `backend/api/realtime_dashboard_api.py`
**Endpoint:** `WS /dashboard/ws/{token}`

**Problem:**
The full JWT access token is embedded as a URL path segment. Nginx, Uvicorn, and any
reverse proxy will log the full URL including the token. An attacker with access to
server logs can replay any active session for 15 minutes (the access token TTL).

**Fix — Accept token via Sec-WebSocket-Protocol subprotocol (same as websocket_api.py):**

Replace the path parameter approach with the multi-strategy extraction already
implemented in `websocket_api.py`:
```python
# Import the extractor from websocket_api.py
from backend.api.websocket_api import _extract_jwt_from_websocket

@realtime_dashboard_router.websocket("/ws")   # No {token} path param
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),       # legacy fallback only
):
    jwt_token, accept_subprotocol = _extract_jwt_from_websocket(websocket, token)
    if not jwt_token:
        await websocket.accept()
        await websocket.close(code=1008)
        return
    # ... decode and proceed
```

**Frontend change:** Update dashboard WS connection to send token via subprotocol:
```typescript
// frontend: replace
new WebSocket(`${WS_BASE}/dashboard/ws/${accessToken}`)
// with
new WebSocket(`${WS_BASE}/dashboard/ws`, ["jwt", accessToken])
```

---

### H-06 — WebSocket Manager is Process-Local (Multi-Worker Break)

**File:** `backend/core/websocket_manager.py`

**Problem:**
The `manager` singleton stores active WebSocket connections in a Python dict. Under
Uvicorn multi-worker mode (e.g., `uvicorn --workers 4`), each worker has its own
in-memory dict. A scan event broadcast by Worker 1 is invisible to supervisors whose
WebSocket connections landed on Worker 2/3/4.

**Fix — Redis pub/sub fan-out:**

Step 1 — Add a Redis pub/sub publisher to the manager:
```python
# backend/core/websocket_manager.py

import json
from redis.asyncio import Redis

REDIS_CHANNEL_ALL = "ws:broadcast:all"
REDIS_CHANNEL_ROLE_PREFIX = "ws:broadcast:role:"
REDIS_CHANNEL_SESSION_PREFIX = "ws:broadcast:session:"

class WebSocketManager:
    def __init__(self):
        self._connections: dict[str, list[WebSocket]] = {}
        self._redis: Optional[Redis] = None

    def set_redis(self, redis: Redis) -> None:
        """Called from lifespan after Redis is initialized."""
        self._redis = redis

    async def _publish(self, channel: str, message: dict) -> None:
        if self._redis:
            try:
                await self._redis.publish(channel, json.dumps(message, default=str))
            except Exception as e:
                logger.warning("Redis publish failed: %s", e)

    async def broadcast_to_roles(self, message: dict, roles: set[str]) -> None:
        # Publish to Redis so other workers pick it up
        for role in roles:
            await self._publish(f"{REDIS_CHANNEL_ROLE_PREFIX}{role}", message)
        # Also deliver to local connections
        await self._local_broadcast_to_roles(message, roles)

    async def broadcast_to_session(self, message: dict, session_id: str) -> None:
        await self._publish(f"{REDIS_CHANNEL_SESSION_PREFIX}{session_id}", message)
        await self._local_broadcast_to_session(message, session_id)
```

Step 2 — Add a subscriber task started in `lifespan.py`:
```python
# backend/core/lifespan.py — inside lifespan(), after Redis init:
asyncio.create_task(manager.start_redis_subscriber(redis_client))
```

Step 3 — Implement subscriber:
```python
async def start_redis_subscriber(self, redis: Redis) -> None:
    pubsub = redis.pubsub()
    await pubsub.psubscribe(
        f"{REDIS_CHANNEL_ROLE_PREFIX}*",
        f"{REDIS_CHANNEL_SESSION_PREFIX}*",
        REDIS_CHANNEL_ALL,
    )
    async for message in pubsub.listen():
        if message["type"] != "pmessage":
            continue
        try:
            data = json.loads(message["data"])
            channel = message["channel"].decode()
            await self._route_local(channel, data)
        except Exception as e:
            logger.error("WS subscriber error: %s", e)
```

**Note:** If Redis is unavailable, the manager falls back to local-only delivery
(existing behaviour) — the `if self._redis:` guard handles this gracefully.

---

### H-07 — Rate Limiter is Process-Local (Multi-Worker Break)

**File:** `backend/services/rate_limiter.py`

**Problem:**
`RateLimiter` uses `threading.Lock` and an in-memory dict. Under 4 workers, a user
can make 4× the allowed requests per window by having each request hit a different
worker. The `ConcurrentRequestHandler` uses `asyncio.Semaphore` — also process-local.

**Fix — Redis-backed token bucket:**
```python
# backend/services/rate_limiter.py

class RedisRateLimiter:
    """Token bucket backed by Redis. Safe across multiple Uvicorn workers."""

    SCRIPT = """
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local data = redis.call("HMGET", key, "tokens", "last_refill")
    local tokens = tonumber(data[1]) or capacity
    local last_refill = tonumber(data[2]) or now

    local elapsed = math.max(0, now - last_refill)
    tokens = math.min(capacity, tokens + elapsed * refill_rate)

    if tokens < cost then
        return -1
    end

    tokens = tokens - cost
    redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
    redis.call("EXPIRE", key, 3600)
    return math.floor(tokens)
    """

    def __init__(self, redis: Redis, capacity: int = 60, refill_rate: float = 1.0):
        self._redis = redis
        self._capacity = capacity
        self._refill_rate = refill_rate
        self._script = redis.register_script(self.SCRIPT)

    async def check(self, key: str, cost: int = 1) -> bool:
        import time
        result = await self._script(
            keys=[f"rl:{key}"],
            args=[self._capacity, self._refill_rate, time.time(), cost],
        )
        return result >= 0
```

Wire in `lifespan.py` after Redis init:
```python
from backend.services.rate_limiter import RedisRateLimiter
rate_limiter = RedisRateLimiter(redis_client, capacity=60, refill_rate=1.0)
# Store on app.state for use in auth routes
app.state.rate_limiter = rate_limiter
```

**Fallback:** Keep the existing `RateLimiter` as a fallback when Redis is not available.

---

### H-08 — Cache Thundering Herd (No Stampede Protection)

**File:** `backend/services/cache_service.py`
**Method:** `get_or_set`

**Problem:**
```python
async def get_or_set(self, key, factory, ttl):
    cached = await self.get(key)          # miss
    if cached is None:
        value = await factory()            # N concurrent calls all reach here
        await self.set(key, value, ttl)    # all write the same result
    return cached or value
```
Under high concurrency (e.g., 50 requests for the same session's ERP item simultaneously),
all 50 see a cache miss and all 50 invoke the expensive `factory()` call. For AI search
or SQL Server queries this amplifies load by 50×.

**Fix — asyncio.Lock per key:**
```python
import asyncio
from collections import defaultdict

class CacheService:
    def __init__(self, ...):
        ...
        self._inflight: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def get_or_set(self, key: str, factory, ttl: int):
        # Fast path: cache hit without acquiring lock
        cached = await self.get(key)
        if cached is not None:
            return cached

        # Slow path: acquire per-key lock so only one caller runs factory()
        async with self._inflight[key]:
            # Re-check after acquiring lock — another waiter may have filled it
            cached = await self.get(key)
            if cached is not None:
                return cached

            value = await factory()
            await self.set(key, value, ttl)

            # Clean up lock entry to prevent memory leak
            self._inflight.pop(key, None)
            return value
```

**Note:** This is process-local but correct for most cases. For cross-worker stampede
protection, use `SET NX EX` in Redis as a distributed lock around the factory call.

---

### H-09 — AI Search Blocks the Event Loop

**File:** `backend/services/ai_search.py`
**Method:** `search_rerank`

**Problem:**
`sentence_transformers` encoding (`model.encode(texts)`) is synchronous CPU work running
on the event loop thread. During encoding of 100+ candidates, the entire event loop is
blocked — no other HTTP requests can be processed.

**Fix — Run in a thread pool executor:**
```python
import asyncio
from functools import partial

class AISearchService:
    ...
    async def search_rerank(self, query: str, candidates: list[str], top_k: int = 10):
        loop = asyncio.get_running_loop()

        def _encode_sync():
            query_emb = self.model.encode([query], convert_to_tensor=True)
            cand_embs = self.model.encode(candidates, convert_to_tensor=True)
            return query_emb, cand_embs

        query_emb, cand_embs = await loop.run_in_executor(None, _encode_sync)

        # Similarity computation is fast — can stay synchronous
        scores = util.cos_sim(query_emb, cand_embs)[0]
        top_indices = scores.topk(min(top_k, len(candidates))).indices.tolist()
        return [candidates[i] for i in top_indices]
```

**Bonus fix — add embedding caching:**
```python
from functools import lru_cache

@lru_cache(maxsize=1000)
def _encode_cached(self, text: str):
    return self.model.encode([text], convert_to_tensor=True)[0]
```

---

### H-10 — EnhancedApiClient Retries Non-Idempotent POST/PATCH

**File:** `frontend/src/services/api/enhancedApiClient.ts`

**Problem:**
`retryWithBackoff` is applied to all HTTP methods including `POST` and `PATCH`. If a
`POST /count-lines` request succeeds on the server but the response is lost due to a
network error, the retry creates a duplicate count line. The idempotency key mitigates
this for count lines specifically, but not for all POST endpoints (e.g., `POST /sessions`,
`POST /auth/login`).

**Fix — Whitelist retry by method:**
```typescript
// frontend/src/services/api/enhancedApiClient.ts

const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

async request<T>(method: string, url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const isIdempotent = IDEMPOTENT_METHODS.has(method.toUpperCase());

  if (isIdempotent) {
    return retryWithBackoff(() => this.axiosInstance.request({ method, url, data, ...config }));
  } else {
    // Non-idempotent: single attempt, no retry
    const response = await this.axiosInstance.request({ method, url, data, ...config });
    return this.normalizeResponse(response);
  }
}
```

**Exception for POST with idempotency key:** Allow retry for count line creation since
it sends `idempotency_key`:
```typescript
async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const hasIdempotencyKey = data && typeof data === "object" && "idempotency_key" in data;
  if (hasIdempotencyKey) {
    return retryWithBackoff(() => this.axiosInstance.post(url, data, config));
  }
  const response = await this.axiosInstance.post(url, data, config);
  return this.normalizeResponse(response);
}
```

---

## MEDIUM Issues

---

### M-01 — Lock Service Silently None — No Operator Alert

**File:** `backend/core/lifespan.py`

**Problem:**
```python
try:
    lock_service = LockService(redis_client)
except Exception:
    lock_service = None   # ← silent failure, no alert
```
If `LockService` fails to initialize, count line locking is completely disabled for the
entire session. Two users can submit the same item simultaneously, creating duplicate
count lines. The operator has no indication this is happening.

**Fix:**
```python
try:
    lock_service = LockService(redis_client)
    logger.info("LockService initialized successfully")
except Exception as exc:
    lock_service = None
    # Structured warning visible in monitoring dashboards
    logger.critical(
        "LOCK_SERVICE_UNAVAILABLE: Count line locking is DISABLED. "
        "Duplicate count submissions are possible. Cause: %s",
        exc,
        extra={"alert": True, "component": "lock_service"},
    )
    # Write to a startup_warnings collection so /api/admin/control/system/issues
    # can surface this to the operator dashboard:
    try:
        await db.startup_warnings.insert_one({
            "component": "lock_service",
            "severity": "critical",
            "message": "Count line locking is disabled",
            "cause": str(exc),
            "timestamp": utc_now_naive(),
        })
    except Exception:
        pass
```

**Also wire the warning into `_collect_system_issues` in `admin_control_api.py`:**
```python
async def _collect_system_issues() -> list[dict[str, Any]]:
    issues = [...]
    # Check for startup warnings
    warnings = await db.startup_warnings.find(
        {"timestamp": {"$gte": datetime.now() - timedelta(hours=1)}}
    ).to_list(50)
    for w in warnings:
        issues.append(_format_issue(w["component"], w["message"], severity=w["severity"]))
    return issues
```

---

### M-02 — Auto-Sync Manager Double Instantiation

**File:** `backend/core/lifespan.py`

**Problem:**
`auto_sync_manager` is instantiated at module level (lines ~312–321) and again inside
the `lifespan` function (lines ~553–590). The second instantiation overwrites the first.
The first instance is never started, the module-level assignment leaks a disconnected
object.

**Fix:**
Remove the module-level instantiation entirely. Keep only the one inside `lifespan`:
```python
# DELETE these lines at module level (around line 312-321):
# auto_sync_manager = AutoSyncManager(...)   ← DELETE

# Keep only the one inside lifespan():
auto_sync_manager = AutoSyncManager(
    db=db,
    sql_connector=sql_connector,
    interval_seconds=settings.AUTO_SYNC_INTERVAL,
)
await auto_sync_manager.start()
app.state.auto_sync_manager = auto_sync_manager
```

---

### M-03 — Dead Duplicate `init_default_users` in app_factory.py

**File:** `backend/app_factory.py` (lines 300–355)

**Problem:**
`init_default_users` is defined in `app_factory.py` but never called from there.
The canonical version in `backend/db/initialization.py` is what actually runs. The
dead copy in `app_factory.py` will silently diverge over time.

**Fix:**
Delete lines 300–355 from `app_factory.py` entirely. Add a comment:
```python
# Default user seeding is handled in backend/db/initialization.py
# called from backend/core/lifespan.py during startup.
```

---

### M-04 — Business Logic Defined Twice in app_factory.py

**File:** `backend/app_factory.py`

**Problem:**
`verify_stock`, `unverify_stock`, and `get_count_lines` are defined inline in
`app_factory.py` AND in `count_lines_routes.py`. The `app_factory.py` versions are
used by some route registrations, the routes file versions by others. They can diverge.

**Fix:**
Delete the inline definitions from `app_factory.py`. Import from `count_lines_routes.py`:
```python
from backend.api.count_lines_routes import (
    verify_stock,
    unverify_stock,
    get_count_lines,
)
```
Any router registrations in `app_factory.py` that reference these functions will now
use the authoritative versions from `count_lines_routes.py`.

---

### M-05 — Circuit Breaker TOCTOU on `is_available`

**File:** `backend/services/circuit_breaker.py`

**Problem:**
```python
@property
def is_available(self) -> bool:
    # Not lock-protected — reads _state without acquiring _lock
    if self._state == CircuitState.OPEN:
        return time.monotonic() - self._last_failure_time >= self._config.timeout_seconds
    return self._state != CircuitState.OPEN
```
`is_available` reads `_state` and `_last_failure_time` without the asyncio lock.
Between `is_available` returning `True` and `acquire()` being called, the state can
change. `acquire()` does acquire the lock, so the actual transition is safe — but the
caller may proceed based on a stale `is_available` read.

**Fix:** Mark `is_available` as a cached check that must be re-confirmed inside the lock:
```python
async def acquire(self) -> bool:
    async with self._lock:
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._last_failure_time >= self._config.timeout_seconds:
                self._state = CircuitState.HALF_OPEN
                self._half_open_calls = 0
            else:
                return False  # Still open
        if self._state == CircuitState.HALF_OPEN:
            if self._half_open_calls >= self._config.half_open_max_calls:
                return False
            self._half_open_calls += 1
        return True
```
Remove the `is_available` property entirely or make it advisory only (add a docstring
warning it is not authoritative for control flow).

---

### M-06 — Governance Guard `__getattr__` Bypass

**File:** `backend/services/governance_guard.py`

**Problem:**
`GovernedCollection.__getattr__` is a fallthrough that proxies any unrecognised
attribute to the underlying Motor collection. If Motor adds a new write method
(e.g., `bulk_write`, `replace_one`, `find_one_and_update`) in a future version,
callers using it will bypass the governance guard silently.

**Fix — Explicit denylist for known Motor write methods:**
```python
# backend/services/governance_guard.py

# Methods that should NEVER be called without going through process_write
_GUARDED_WRITE_METHODS = frozenset({
    "insert_one", "insert_many",
    "update_one", "update_many",
    "replace_one",
    "delete_one", "delete_many",
    "find_one_and_update", "find_one_and_replace", "find_one_and_delete",
    "bulk_write",
})

class GovernedCollection:
    def __getattr__(self, name: str):
        if name in _GUARDED_WRITE_METHODS:
            raise GovernanceViolationError(
                f"Direct call to '{name}' is not allowed on a governed collection. "
                f"Use process_write() instead."
            )
        return getattr(self._collection, name)
```

---

### M-07 — Admin Start Endpoints Are No-Ops

**File:** `backend/api/admin_control_api.py`

**Problem:**
`POST /services/backend/start` and `POST /services/frontend/start` return `success: True`
without spawning any process. Operators will believe the service started when it did not.

**Fix Option A — Remove the endpoints** and replace with documentation:
Delete both routes. The response currently says "use shell scripts" — make that a proper
`405 Method Not Allowed` with a message:
```python
@admin_control_router.post("/services/backend/start")
async def start_backend(current_user: dict = Depends(require_admin)):
    raise HTTPException(
        status_code=status.HTTP_405_METHOD_NOT_ALLOWED,
        detail={
            "message": "Process management is not available via API. "
                       "Use scripts/start_backend.sh or the system service manager.",
            "documentation": "/docs#tag/Admin-Control",
        },
    )
```

**Fix Option B — Implement actual process spawning** using `asyncio.create_subprocess_exec`:
```python
@admin_control_router.post("/services/backend/start")
async def start_backend(current_user: dict = Depends(require_admin)):
    existing = _find_running_backend_process()
    if existing:
        return existing

    script = Path(__file__).parent.parent.parent / "scripts" / "start_backend.sh"
    if not script.exists():
        raise HTTPException(status_code=503, detail="Start script not found")

    proc = await asyncio.create_subprocess_exec(
        str(script),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    return {"success": True, "message": f"Backend start initiated (pid: {proc.pid})"}
```

---

### M-08 — Synchronous Log Read Blocks Event Loop

**File:** `backend/api/admin_control_api.py`
**Function:** `_read_log_file`

**Problem:**
```python
with open(log_path, encoding="utf-8") as f:    # synchronous I/O
    all_lines = f.readlines()                   # blocks event loop
```
For a 100 MB log file this blocks all in-flight requests for the duration of the read.

**Fix — Use `asyncio.to_thread` (Python 3.9+):**
```python
import asyncio

async def _read_log_file_async(log_path: Path, lines: int, level, service) -> list:
    def _sync_read():
        return _read_log_file(log_path, lines, level, service)

    return await asyncio.to_thread(_sync_read)

# In get_service_logs handler:
logs = await _read_log_file_async(log_path, lines, level, service)
```

---

### M-09 — Lazy pandas Import in Request Handler

**File:** `backend/api/admin_control_api.py`
**Function:** `generate_report` (format=="excel" branch)

**Problem:**
```python
elif format == "excel":
    if not data:
        import pandas as pd    # ImportError mid-request if pandas not installed
```
This raises an unhandled `ImportError` that FastAPI converts to a 500 with the full
stack trace in the response body (if `DEBUG=True`).

**Fix — Module-level import with graceful fallback:**
```python
# Top of admin_control_api.py
try:
    import pandas as pd
    _PANDAS_AVAILABLE = True
except ImportError:
    pd = None
    _PANDAS_AVAILABLE = False

# In generate_report:
elif format == "excel":
    if not _PANDAS_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Excel export requires pandas and xlsxwriter. Install with: pip install pandas xlsxwriter",
        )
    ...
```

---

### M-10 — Sentry Initialized at Module Import Time

**File:** `backend/app_factory.py`

**Problem:**
Sentry `sentry_sdk.init(...)` is called at module import time (top-level code, not
inside `create_app()`). This means:
1. Tests that import `app_factory` send data to Sentry even when `SENTRY_DSN` is not set.
2. The DSN is read before settings are fully validated.
3. `RUNNING_UNDER_PYTEST` is checked but the module-level init may still configure the SDK.

**Fix — Move Sentry init into `create_app()` after settings validation:**
```python
def create_app() -> FastAPI:
    # Initialize Sentry only inside the factory, not at module level
    _dsn = getattr(settings, "SENTRY_DSN", None)
    if _dsn and not RUNNING_UNDER_PYTEST:
        import sentry_sdk
        sentry_sdk.init(
            dsn=_dsn,
            traces_sample_rate=getattr(settings, "SENTRY_TRACES_SAMPLE_RATE", 0.1),
            environment=getattr(settings, "ENVIRONMENT", "production"),
        )
        logger.info("Sentry initialized for environment: %s", settings.ENVIRONMENT)
    ...
```

---

### M-11 — `install_db_write_guards` Called at Module Level

**File:** `backend/core/lifespan.py`

**Problem:**
`install_db_write_guards(db)` is called at module level (before the `lifespan`
function), meaning it runs during import before the real `db` object is created.
If `db` is a placeholder or `None` at import time, the guards are installed on the
wrong object.

**Fix — Move into the lifespan startup sequence:**
```python
# DELETE from module level:
# install_db_write_guards(db)   ← REMOVE

# INSIDE lifespan(), after db is created:
async with lifespan(app):
    db = create_mongo_client(settings.MONGODB_URI)
    install_db_write_guards(db)    # ← correct placement
    ...
```

---

## LOW Issues

---

### L-01 — Device Deduplication Collision

**File:** `backend/api/admin_control_api.py`
**Endpoint:** `GET /admin/control/devices`

**Problem:**
Devices are deduplicated on `ip_address + platform`. Two users on the same corporate
WiFi and the same platform (e.g., both on Android) collapse to one entry.

**Fix:**
Add `user` (username) to the deduplication key:
```python
device_key = f"{session.get('user', 'unknown')}-{session.get('ip_address', 'unknown')}-{session.get('device_info', {}).get('platform', 'unknown')}"
```

---

### L-02 — Unused `unread_count` in BatchNotificationRequest

**File:** `backend/api/notifications_api.py`

**Problem:**
`BatchNotificationRequest` has a required `unread_count: int` field that is not used
anywhere in the `send_batch_notifications` handler. This forces callers to supply a
meaningless value.

**Fix:**
Remove the field:
```python
class BatchNotificationRequest(BaseModel):
    user_ids: list[str]
    notification_type: str
    title: str
    message: str
    priority: str = "medium"
    action_url: Optional[str] = None
    # REMOVED: unread_count: int
```

---

### L-03 — `$max` for baseline_qty May Select Wrong Baseline

**File:** `backend/api/reconciliation_api.py`

**Problem:**
```python
"baseline_qty": {"$max": {"$ifNull": ["$erp_qty", 0]}},
```
When multiple count lines for the same item exist with different `erp_qty` values
(i.e., the ERP qty changed mid-session), `$max` picks the highest baseline rather
than the earliest (first scan). This can misrepresent the actual count variance.

**Fix — Use `$first` with a sort by `counted_at`:**
```python
# Add to the pipeline before the $group stage:
{"$sort": {"session_id": 1, "item_code": 1, "counted_at": 1}},

# In the $group stage:
"baseline_qty": {"$first": {"$ifNull": ["$erp_qty", 0]}},
```

---

## Pending Wirings

These are features/services that are partially wired but have broken or missing
connections that prevent them from functioning correctly.

---

### PW-01 — `_activity_log_service` Silently None in Count Lines Routes

**File:** `backend/api/count_lines_routes.py`

**State:** If `init_count_lines_api()` is not called (partial startup, test harness),
`_activity_log_service` remains `None`. All `await _activity_log_service.log_activity(...)`
calls are guarded with `if _activity_log_service:`, so they silently skip — leaving
zero audit trail for every count line operation.

**Wire:**
1. Ensure `init_count_lines_api()` is always called in `lifespan.py` with a non-None
   `activity_log_service`.
2. Add a startup assertion:
```python
# In lifespan.py, after calling init_count_lines_api:
from backend.api.count_lines_routes import _activity_log_service as _cls
if _cls is None:
    raise RuntimeError("STARTUP FAILED: _activity_log_service not wired in count_lines_routes")
```
3. For tests, provide a mock `ActivityLogService` in `conftest.py`.

---

### PW-02 — `_snapshot_service` Silently None — Baseline Falls Back Silently

**File:** `backend/api/count_lines_routes.py`

**State:** `_snapshot_service` is `None` if `SnapshotService(get_db())` raises during
`init_count_lines_api`. The `write_service.resolve_baseline` call then falls back to
reading directly from `erp_items`, bypassing snapshot semantics. No warning is logged.

**Wire:**
```python
# In init_count_lines_api:
if snapshot_service is None:
    logger.warning(
        "SNAPSHOT_SERVICE_UNAVAILABLE: Baseline resolution will use live ERP data. "
        "Count variance may be inflated if ERP stock changes mid-session."
    )
```
Also: ensure `SnapshotService` is initialized before `init_count_lines_api` is called
in `lifespan.py`.

---

### PW-03 — Redis Pub/Sub Not Connected to WebSocket Manager

**File:** `backend/core/websocket_manager.py`, `backend/core/lifespan.py`

**State:** The WebSocket manager exists and broadcasts to local connections. Redis is
initialized in `lifespan.py`. But `manager.set_redis(redis_client)` is never called.
Multi-worker WebSocket fan-out is completely absent.

**Wire:**
```python
# In lifespan.py, after Redis init:
from backend.core.websocket_manager import manager as ws_manager
ws_manager.set_redis(redis_client)
asyncio.create_task(ws_manager.start_redis_subscriber(redis_client))
logger.info("WebSocket Redis pub/sub subscriber started")
```
(Requires H-06 implementation above.)

---

### PW-04 — mDNS Service Discovery Has No Consumer

**File:** `backend/core/lifespan.py`

**State:** `start_mdns(port)` is called at startup, registering the backend service
on the local network. No frontend code or other service was found consuming this
discovery mechanism. It adds startup overhead and an open mDNS advertisement with no
benefit.

**Wire Options:**
- Option A: Remove `start_mdns` from lifespan if mDNS is not required.
- Option B: Document the mDNS service name and add frontend discovery logic in
  `frontend/src/core/config/` to detect the backend IP at startup instead of using
  a hardcoded `API_BASE_URL`.

---

### PW-05 — OpenTelemetry Not Guaranteed to Initialize

**File:** `backend/core/lifespan.py`

**State:**
```python
try:
    init_tracing()
    instrument_fastapi_app(app)
except Exception as e:
    logger.warning("OpenTelemetry init failed: %s", e)
```
If `init_tracing` fails silently, `@trace_dashboard_query` and `trace_span()` calls
throughout the codebase will fail silently or become no-ops. There is no health check
for tracing state.

**Wire:**
```python
_tracing_active = False
try:
    init_tracing()
    instrument_fastapi_app(app)
    _tracing_active = True
    logger.info("OpenTelemetry tracing initialized")
except Exception as e:
    logger.warning("OpenTelemetry disabled: %s", e)

app.state.tracing_active = _tracing_active
```

Add to health endpoint:
```python
@router.get("/health")
async def health():
    return {
        "status": "ok",
        "tracing": app.state.tracing_active,
        "lock_service": app.state.lock_service is not None,
        ...
    }
```

---

### PW-06 — Push Notification Device Tokens Registered But No APNS/FCM Delivery

**File:** `backend/api/notifications_api.py`, `backend/services/notification_service.py`

**State:** `POST /notifications/devices` stores device tokens. `NotificationService`
creates in-app notifications stored in MongoDB. But there is no code that reads stored
device tokens and sends push notifications to APNS (Apple) or FCM (Google). Push
delivery exists as a registration mechanism with no sender.

**Wire:**
```python
# backend/services/push_notification_service.py (create this file)
import httpx

class PushNotificationService:
    """Send Expo push notifications to registered devices."""

    EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

    async def send(self, token: str, title: str, body: str, data: dict = None):
        payload = {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(self.EXPO_PUSH_URL, json=payload, timeout=10)
            resp.raise_for_status()
```

Wire into `NotificationService.create_notification`:
```python
async def create_notification(self, user_id, ...):
    # 1. Store in-app notification (existing)
    notification_id = await self._store_notification(...)

    # 2. Send push to registered devices (new)
    devices = await self.db.notification_devices.find(
        {"user_id": user_id, "active": True}
    ).to_list(10)
    push_service = PushNotificationService()
    for device in devices:
        try:
            await push_service.send(device["token"], title, message)
        except Exception as e:
            logger.warning("Push failed for device %s: %s", device["token"][:10], e)

    return notification_id
```

---

### PW-07 — `LOG_ROUTE_TABLE` Env Var Declared But Format Incomplete

**File:** `backend/app_factory.py`

**State:** `LOG_ROUTE_TABLE` env var logs the route table at startup. The format only
logs method + path, not the dependency chain or auth requirements. This makes debugging
auth misconfigurations difficult.

**Wire — Enhanced route logging:**
```python
if os.getenv("LOG_ROUTE_TABLE"):
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            deps = [str(d) for d in getattr(route, "dependencies", [])]
            logger.info("ROUTE: %s %s | deps: %s", sorted(route.methods), route.path, deps)
```

---

### PW-08 — `WatchdogService.run_all_checks()` Has No Scheduled Invocation

**File:** `backend/core/lifespan.py`, `backend/services/watchdog_service.py`

**State:** `WatchdogService` exists and `run_all_checks()` is exposed via
`POST /admin/control/watchdog/run`. But there is no background task running it
periodically. Velocity anomaly and brute force detection only trigger when an admin
manually hits the endpoint.

**Wire — Periodic background task:**
```python
# In lifespan.py:
async def _watchdog_loop(db, interval_seconds: int = 300):
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            watchdog = WatchdogService(db)
            await watchdog.run_all_checks()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Watchdog check failed: %s", e)

# Inside lifespan():
watchdog_task = asyncio.create_task(
    _watchdog_loop(db, interval_seconds=int(os.getenv("WATCHDOG_INTERVAL", 300)))
)
app.state.watchdog_task = watchdog_task

# On shutdown:
watchdog_task.cancel()
```

---

## Logic Upgrades

These are not bugs but architectural improvements that significantly improve correctness,
performance, or safety.

---

### LU-01 — Centralize Session Status Normalization

**Problem:** `normalize_session_status` exists in `canonical_inventory.py` but is called
inconsistently. `_ensure_session_accepts_counts` does raw string comparison.
`session_state_machine.py` does `.upper()`. Multiple places repeat the same logic.

**Upgrade:**
Create a single `get_normalized_session` helper that normalizes on fetch:
```python
# canonical_inventory.py
async def find_session_normalized(db, session_id: str) -> Optional[dict]:
    session = await find_session(db, session_id)
    if session is None:
        return None
    session["status"] = normalize_session_status(
        session.get("status"),
        reconciled_at=session.get("reconciled_at"),
    )
    return session
```
Replace all `find_session` calls with `find_session_normalized` wherever the status
is subsequently checked.

---

### LU-02 — Materialized `effective_reviewed` Field on Count Lines

Already described in H-02 fix. This also enables:
- MongoDB-side aggregation of `verified_items` count (currently done by cursor scan)
- Faster session finalization check (`is_blocking_finalization` can become a DB query)

---

### LU-03 — Atomic Serial Number Uniqueness Check

**Problem:** Serial number uniqueness check (`check_serial_uniqueness`) is three
sequential reads across three collections and is not atomic with count line creation.
Two concurrent submissions can both pass the check and both persist.

**Upgrade:** Use a MongoDB unique index on a `serial_registry` collection, and do an
upsert on count line creation rather than a pre-check:
```python
# On count line insert, also upsert serial entries:
for serial in line_data.serial_numbers or []:
    try:
        await db.serial_registry.insert_one({
            "serial_no": serial,
            "item_code": line_data.item_code,
            "session_id": line_data.session_id,
            "count_line_id": count_line["id"],
            "created_at": counted_at,
        })
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409,
            detail=f"Serial number {serial} is already registered for item {line_data.item_code}",
        )
```
Index: `db.serial_registry.create_index([("serial_no", 1), ("item_code", 1)], unique=True)`

---

### LU-04 — Session Finalization Check via DB Query

**Problem:** `is_blocking_finalization` is evaluated by iterating all count lines for a
session in Python. For finalization readiness checks this means a full cursor scan each
time an operator clicks "Close Session".

**Upgrade:** With `effective_reviewed` materialized (LU-02), add:
```python
async def session_has_blocking_lines(db, session_id: str) -> bool:
    """Returns True if any non-superseded line is still blocking finalization."""
    count = await db.count_lines.count_documents({
        "session_id": session_id,
        "status": {"$nin": ["superseded", "locked"]},
        "$or": [
            {"status": "rejected"},
            {"assigned_to": {"$ne": None}, "recount_requested_at": {"$ne": None}},
            {"approval_status": {"$in": ["NEEDS_REVIEW", "REJECTED"]}},
            {"effective_reviewed": False, "variance": {"$ne": 0}},
        ],
    })
    return count > 0
```

---

### LU-05 — Replace `threading.Lock` in RateLimiter with asyncio

**Problem:** `RateLimiter` uses `threading.Lock` in an async codebase. While it works,
`threading.Lock.acquire()` blocks the thread — in an async context this means the lock
is effectively correct but semantically wrong. If the lock is ever held for more than
a microsecond, it could starve other coroutines.

**Upgrade:**
```python
import asyncio

class RateLimiter:
    def __init__(self, ...):
        self._lock = asyncio.Lock()   # not threading.Lock

    async def check_rate_limit(self, key: str) -> bool:
        async with self._lock:
            # existing token bucket logic
            ...
```

---

### LU-06 — Add `version` Field to Count Lines for Optimistic Concurrency

**Problem:** The `version` field already exists on count lines for recount tracking, but
is not used for optimistic concurrency on approval/rejection (H-03 fix uses approval_status
filter instead). A full optimistic concurrency approach would use `version` as a
compare-and-swap guard.

**Upgrade:** Increment `version` on every state-changing write:
```python
# In approve_count_line $set:
"$set": {"version": {"$inc": 1}, ...},   # MongoDB does not support $inc inside $set
# Use $inc separately:
"$inc": {"version": 1},
"$set": {... fields ...},

# And add to the filter:
"filter": {"_id": count_line["_id"], "version": count_line["version"]},
```

---

### LU-07 — Decouple Governance Guard from Motor Version

**Problem:** `GovernedCollection.__getattr__` allows any unrecognised Motor attribute.
The explicit denylist (M-06) is one fix but requires manual maintenance.

**Upgrade:** Use a whitelist approach — only proxy attributes that are explicitly allowed:
```python
_ALLOWED_READ_METHODS = frozenset({
    "find", "find_one", "count_documents", "distinct", "aggregate",
    "watch", "estimated_document_count",
})
_ALLOWED_WRITE_METHODS = frozenset({
    "insert_one", "insert_many", "update_one", "update_many",
    "replace_one", "delete_one", "delete_many",
    "find_one_and_update", "find_one_and_replace", "find_one_and_delete",
    "bulk_write",
})
_ALLOWED_ADMIN_METHODS = frozenset({
    "create_index", "drop_index", "index_information",
})

class GovernedCollection:
    def __getattr__(self, name: str):
        if name in _ALLOWED_WRITE_METHODS:
            raise GovernanceViolationError(f"Use process_write() for '{name}'")
        if name in _ALLOWED_READ_METHODS | _ALLOWED_ADMIN_METHODS:
            return getattr(self._collection, name)
        raise AttributeError(f"'{type(self).__name__}' has no attribute '{name}'")
```

---

### LU-08 — Add Health Check Endpoint That Tests Critical Subsystems

**Problem:** No single endpoint reports whether locking, cache, tracing, and write
guards are all properly initialized.

**Upgrade — Comprehensive health endpoint:**
```python
@router.get("/health/deep")
async def deep_health(current_user: dict = Depends(require_admin)):
    from backend.api.count_lines_routes import _lock_service, _activity_log_service
    return {
        "mongodb": await _ping_mongo(),
        "redis": await _ping_redis(),
        "lock_service": _lock_service is not None,
        "activity_log_service": _activity_log_service is not None,
        "tracing_active": getattr(app.state, "tracing_active", False),
        "websocket_connections": manager.connection_count(),
        "governance_guards_installed": _governance_guards_active(),
    }
```

---

### LU-09 — Idempotency Key Collision Window in Offline Sync

**Problem:** Offline count lines generate `idempotency_key` via `generateOfflineId()`.
If two offline devices generate the same key for the same session (UUID collision is
extremely unlikely but `generateOfflineId` may use a deterministic scheme), the second
submission will silently return the first submission's result.

**Upgrade:** Prefix the idempotency key with the device ID:
```typescript
// frontend/src/services/offline/offlineCountLine.ts
const idempotency_key = `${deviceId}:${generateOfflineId()}`;
```
This makes collisions across devices impossible regardless of the ID generation scheme.

---

## Execution Plan

### Sprint 0 — Security Hardening (1 week, ship-blocking)

| # | Issue | Owner | Effort |
|---|---|---|---|
| 1 | C-01: Reporting API allowlist | Backend | 2h |
| 2 | C-02: Notes regex escape | Backend | 1h |
| 3 | H-10: Frontend retry whitelist | Frontend | 2h |
| 4 | H-05: JWT in URL → subprotocol | Backend + Frontend | 3h |
| 5 | L-02: Remove unused `unread_count` field | Backend | 30m |

**Acceptance criteria:**
- `POST /api/reports/query/preview` returns 403 for `users`, `refresh_tokens` collections.
- Notes search with `(((a+)+)+)` input returns 400 or escapes correctly.
- Dashboard WS URL no longer contains token.

---

### Sprint 1 — Correctness Fixes (2 weeks)

| # | Issue | Owner | Effort |
|---|---|---|---|
| 6 | H-01: Session status normalization | Backend | 2h |
| 7 | H-03: Approval optimistic concurrency | Backend | 4h |
| 8 | M-01: Lock service alert + startup_warnings | Backend | 3h |
| 9 | M-02: Remove double auto_sync instantiation | Backend | 1h |
| 10 | M-03: Delete dead `init_default_users` | Backend | 30m |
| 11 | M-04: Remove duplicate business logic in app_factory | Backend | 2h |
| 12 | M-06: Governance guard denylist | Backend | 2h |
| 13 | M-09: Lazy pandas import fix | Backend | 30m |
| 14 | M-10: Move Sentry init into create_app | Backend | 1h |
| 15 | M-11: Move install_db_write_guards into lifespan | Backend | 1h |
| 16 | L-01: Device dedup key fix | Backend | 30m |
| 17 | L-03: Baseline $first not $max | Backend | 1h |
| 18 | PW-01: Wire _activity_log_service assertion | Backend | 1h |
| 19 | PW-02: Wire _snapshot_service warning | Backend | 1h |

**Acceptance criteria:**
- A session with `status: "open"` (lowercase) accepts count line submissions.
- Double-approving a count line returns 409 on the second call.
- `startup_warnings` collection has a record when LockService fails.

---

### Sprint 2 — Performance & Event Loop Safety (2 weeks)

| # | Issue | Owner | Effort |
|---|---|---|---|
| 20 | H-02: Materialized `effective_reviewed` + backfill | Backend | 6h |
| 21 | H-08: Cache stampede protection | Backend | 3h |
| 22 | H-09: AI search run_in_executor | Backend | 2h |
| 23 | M-05: Circuit breaker TOCTOU | Backend | 2h |
| 24 | M-08: Async log file read | Backend | 2h |
| 25 | M-07: Admin start endpoints fix | Backend | 2h |
| 26 | LU-01: Centralize session normalization | Backend | 4h |
| 27 | LU-03: Atomic serial uniqueness | Backend | 4h |
| 28 | LU-05: asyncio.Lock in RateLimiter | Backend | 1h |
| 29 | LU-06: version-based concurrency | Backend | 3h |

**Acceptance criteria:**
- `GET /count-lines/session/{id}?verified=true` uses DB-side filter, confirmed by explain plan.
- AI search response time does not block other requests under load test.

---

### Sprint 3 — Multi-Worker & Real-Time Correctness (2 weeks)

| # | Issue | Owner | Effort |
|---|---|---|---|
| 30 | H-06: Redis pub/sub for WebSocket | Backend | 8h |
| 31 | H-07: Redis-backed rate limiter | Backend | 6h |
| 32 | H-04: Unify WebSocket managers | Backend | 4h |
| 33 | PW-03: Wire Redis to WS manager | Backend | 2h |
| 34 | PW-08: Watchdog background loop | Backend | 2h |
| 35 | PW-05: OpenTelemetry health wire | Backend | 1h |
| 36 | LU-04: Session finalization via DB query | Backend | 3h |
| 37 | LU-07: GovernedCollection whitelist | Backend | 2h |
| 38 | LU-08: Deep health endpoint | Backend | 2h |

**Acceptance criteria:**
- With 4 Uvicorn workers, a scan event broadcast from Worker 1 is received by a
  supervisor WebSocket connected to Worker 2 (verified via load test + WS client).
- Rate limiter correctly enforces limits across workers.

---

### Sprint 4 — Test Infrastructure (ongoing, run in parallel from Sprint 1)

| # | Issue | Owner | Effort |
|---|---|---|---|
| 39 | C-03: pytest infrastructure setup | Backend | 4h |
| 40 | Unit tests: canonical_inventory | Backend | 6h |
| 41 | Unit tests: count_state_machine | Backend | 4h |
| 42 | Unit tests: session_state_machine | Backend | 4h |
| 43 | Unit tests: governance_guard | Backend | 4h |
| 44 | Unit tests: circuit_breaker | Backend | 3h |
| 45 | Unit tests: refresh_token | Backend | 3h |
| 46 | Integration: count_lines_api | Backend | 8h |
| 47 | Integration: sessions_api | Backend | 6h |
| 48 | PW-04: mDNS decision | Backend | 1h |
| 49 | PW-06: Expo push delivery | Backend | 6h |
| 50 | PW-07: Enhanced route logging | Backend | 1h |
| 51 | LU-09: Device-prefixed idempotency keys | Frontend | 2h |

**Acceptance criteria:**
- `pytest backend/tests/unit/ -v` passes with ≥ 60 test cases.
- Coverage report shows ≥ 80% line coverage on `canonical_inventory.py`,
  `count_state_machine.py`, `session_state_machine.py`.

---

## Summary

| Category | Count | Estimated Hours |
|---|---|---|
| CRITICAL issues | 3 | ~20h |
| HIGH issues | 10 | ~55h |
| MEDIUM issues | 11 | ~25h |
| LOW issues | 3 | ~3h |
| Pending Wirings | 8 | ~30h |
| Logic Upgrades | 9 | ~35h |
| **Total** | **44** | **~168h** |

**Highest-priority single action:** Apply the reporting API collection allowlist (C-01).
It is a 10-line change that closes a data exfiltration path affecting every authenticated
user.

**Highest-leverage single action:** Add the `effective_reviewed` materialized field (H-02 /
LU-02). It fixes the performance issue, enables DB-side finalization checks, and simplifies
four different query paths simultaneously.
