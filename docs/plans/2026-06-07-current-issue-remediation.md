# Current Issue Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the current confirmed sync validation, authorization, query-efficiency, analytics-boundary, and dashboard typing issues found in the live `D:\n.STK` checkout.

**Architecture:** Keep stock mutations inside the governed count-line write path. Add boundary validation at both the offline-sync edge and canonical write service, preserve offline per-record conflict behavior for data errors, and reserve hard HTTP failures for authorization failures. Replace remaining avoidable per-row reads with bounded bulk lookups or MongoDB aggregation while keeping projections and dashboard contracts stable.

**Tech Stack:** FastAPI, Pydantic, Motor/MongoDB, pytest, React Native/Expo, TypeScript, pnpm.

---

### Task 1: Block Negative Quantities At Sync And Write Boundaries

**Files:**
- Modify: `backend/api/sync_batch_api.py`
- Modify: `backend/services/validation_service.py`
- Test: `backend/tests/api/test_sync_batch_logic.py`
- Test: `backend/tests/services/test_count_line_write_service_hardening.py`

**Step 1: Write failing sync validation tests**

Add tests that keep batch parsing intact and return per-record conflicts for bad client data:

```python
async def test_validate_record_rejects_negative_verified_qty():
    record = SyncRecord(
        client_record_id="neg-verified",
        session_id="session-1",
        location_id="loc-1",
        floor_id="floor-1",
        rack_id="rack-1",
        item_code="ITEM-1",
        verified_qty=-1,
        damaged_qty=0,
        serial_numbers=[],
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, _FakeDb(), lock_manager, user_id="user-1")

    assert conflict is not None
    assert conflict.conflict_type == "invalid_quantity"
    assert "negative" in conflict.message.lower()


async def test_validate_record_rejects_negative_damaged_qty():
    record = SyncRecord(
        client_record_id="neg-damaged",
        session_id="session-1",
        location_id="loc-1",
        floor_id="floor-1",
        rack_id="rack-1",
        item_code="ITEM-1",
        verified_qty=1,
        damaged_qty=-1,
        serial_numbers=[],
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, _FakeDb(), lock_manager, user_id="user-1")

    assert conflict is not None
    assert conflict.conflict_type == "invalid_quantity"
```

**Step 2: Add canonical write validation tests**

Add focused tests for `ValidationService.validate_count_line(..., raise_on_error=True)`:

```python
async def test_count_line_validation_rejects_negative_counted_qty(fake_db):
    service = ValidationService(fake_db)
    doc = {
        "session_id": "session-1",
        "location_id": "loc-1",
        "floor_id": "floor-1",
        "rack_id": "rack-1",
        "item_code": "ITEM-1",
        "counted_qty": -1,
        "damaged_qty": 0,
    }

    with pytest.raises(GovernanceViolation, match="NEGATIVE_QUANTITY"):
        await service.validate_count_line(doc, raise_on_error=True)


async def test_count_line_validation_rejects_negative_damaged_qty(fake_db):
    service = ValidationService(fake_db)
    doc = {
        "session_id": "session-1",
        "location_id": "loc-1",
        "floor_id": "floor-1",
        "rack_id": "rack-1",
        "item_code": "ITEM-1",
        "counted_qty": 1,
        "damaged_qty": -1,
    }

    with pytest.raises(GovernanceViolation, match="NEGATIVE_DAMAGE_QUANTITY"):
        await service.validate_count_line(doc, raise_on_error=True)
```

**Step 3: Run tests to verify they fail**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/services/test_count_line_write_service_hardening.py -q
```

Expected: new tests fail because negative quantities are currently accepted.

**Step 4: Implement minimal validation**

In `backend/api/sync_batch_api.py`, add a helper near quantity validation:

```python
def _invalid_quantity_conflict(record: SyncRecord, message: str) -> SyncConflict:
    return SyncConflict(
        client_record_id=record.client_record_id,
        conflict_type="invalid_quantity",
        message=message,
        details={
            "verified_qty": record.verified_qty,
            "damaged_qty": record.damaged_qty,
        },
    )
```

Use it in `validate_record()` before the damage-vs-verified check:

```python
if record.verified_qty < 0:
    return _invalid_quantity_conflict(record, "Verified quantity cannot be negative")
if record.damaged_qty < 0:
    return _invalid_quantity_conflict(record, "Damage quantity cannot be negative")
```

Add the same defensive check in `sync_single_record()` before building `doc`:

```python
if record.verified_qty < 0 or record.damaged_qty < 0:
    return False, "Quantities cannot be negative"
```

In `backend/services/validation_service.py`, reject negative base quantities before UOM conversion:

```python
if qty < 0:
    raise GovernanceViolation("NEGATIVE_QUANTITY")
```

In `validate_count_line()`, validate damage quantity explicitly:

```python
try:
    damaged_qty = _as_decimal(doc.get("damaged_qty"), default="0")
    if damaged_qty < 0:
        errors.append("NEGATIVE_DAMAGE_QUANTITY")
except GovernanceViolation as exc:
    errors.append(str(exc))
```

**Step 5: Run focused tests**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/services/test_count_line_write_service_hardening.py -q
```

Expected: PASS.

---

### Task 2: Preserve Hard Authorization Failures In Offline Sync

**Files:**
- Modify: `backend/api/sync_batch_api.py`
- Test: `backend/tests/api/test_sync_batch_logic.py`

**Step 1: Write failing authorization tests**

Add a test that a non-owner, non-privileged user gets a hard forbidden error from `sync_single_record()`:

```python
async def test_sync_single_record_raises_403_for_session_owner_mismatch(monkeypatch):
    class _LifecycleService:
        async def ensure_session_active(self, session_id):
            return {"session_id": session_id, "staff_user": "owner-user"}

    record = _make_record(
        session_id="session-1",
        item_code="ITEM-1",
        verified_qty=1,
        serials=[],
    )

    with pytest.raises(HTTPException) as exc:
        await sync_single_record(
            record,
            _FakeDb(),
            "other-user",
            user_role="staff",
            lifecycle_service=_LifecycleService(),
        )

    assert exc.value.status_code == 403
```

Add or update an endpoint-level test so raised `HTTPException` is not rewrapped as 500.

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py -q
```

Expected: FAIL because the current code returns `(False, "...")`.

**Step 3: Implement hard auth behavior**

In `sync_single_record()`, replace:

```python
return False, "Not authorized to sync records for this session"
```

with:

```python
raise HTTPException(
    status_code=403,
    detail="Not authorized to sync records for this session",
)
```

In the endpoint `try` block, preserve HTTP exceptions before the broad exception handler:

```python
    except HTTPException:
        await circuit_breaker.record_failure()
        raise
    except Exception as e:
        await circuit_breaker.record_failure()
        logger.error("Batch sync failed: %s", sanitize_for_logging(str(e)))
        raise HTTPException(status_code=500, detail=f"Batch sync failed: {str(e)}")
```

**Step 4: Run focused tests**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py -q
```

Expected: PASS.

---

### Task 3: Bulk Prefetch Count-Line Idempotency For Batch Sync

**Files:**
- Modify: `backend/api/sync_batch_api.py`
- Test: `backend/tests/api/test_sync_batch_logic.py`
- Test: `backend/tests/test_remediation_group1_serial_qty.py`
- Test: `backend/tests/test_remediation_group12_concurrency.py`

**Step 1: Write failing query-count test**

Add a fake collection test proving a batch checks existing count-line idempotency keys in bulk, not once per record.

Expected behavior:
- Records already present in `count_lines` by `(session_id, idempotency_key)` are marked OK.
- `sync_single_record()` is not called for those records.
- `count_lines.find(...)` is called once for the batch prefetch.

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py -q
```

Expected: FAIL because `_count_line_is_idempotent()` still performs per-record `find_one()`.

**Step 3: Implement bulk prefetch**

Add helper:

```python
async def _prefetch_count_line_idempotency_keys(db: Any, records: list[SyncRecord]) -> set[tuple[str, str]]:
    pairs = [
        (record.session_id, record.client_record_id)
        for record in records
        if record.session_id and record.client_record_id
    ]
    if not pairs:
        return set()

    clauses = [
        {"session_id": session_id, "idempotency_key": idempotency_key}
        for session_id, idempotency_key in pairs
    ]
    existing = await db.count_lines.find(
        {"$or": clauses},
        {"session_id": 1, "idempotency_key": 1},
    ).to_list(length=len(clauses))
    return {
        (str(row.get("session_id")), str(row.get("idempotency_key")))
        for row in existing or []
        if row.get("session_id") and row.get("idempotency_key")
    }
```

In `sync_batch()`, prefetch before the per-record loop and skip records already present:

```python
existing_count_line_keys = await _prefetch_count_line_idempotency_keys(db, request.records)

for record in request.records:
    if record.client_record_id in existing_op_ids:
        ok_records.append(record.client_record_id)
        continue
    if (record.session_id, record.client_record_id) in existing_count_line_keys:
        ok_records.append(record.client_record_id)
        continue
```

Keep `_count_line_is_idempotent()` as a final defensive guard for direct helper callers and legacy operations.

**Step 4: Run focused sync tests**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/test_remediation_group1_serial_qty.py backend/tests/test_remediation_group12_concurrency.py -q
```

Expected: PASS.

---

### Task 4: Replace Dashboard Projection Refresh Loops With Aggregation

**Files:**
- Modify: `backend/services/projection_service.py`
- Test: `backend/tests/test_event_sourcing_contract.py`
- Test: `backend/tests/services/test_projection_read_service.py`

**Step 1: Write failing projection aggregation test**

Add a test around `_refresh_session_dashboard_projection()` using the in-memory DB utilities or a small fake collection. The test should assert:
- inactive lines are excluded
- verified count, damage count, variance totals, and latest counted timestamp are correct
- pending and approved approval counts are correct

**Step 2: Run test to verify current behavior baseline**

Run:

```powershell
python -m pytest backend/tests/test_event_sourcing_contract.py backend/tests/services/test_projection_read_service.py -q
```

Expected before implementation: existing behavior passes, but the new fake aggregation-use assertion fails if included.

**Step 3: Implement aggregation helper**

In `projection_service.py`, replace the `async for` loops in `_refresh_session_dashboard_projection()` with aggregation:

```python
line_summary = await self.db.verified_items_projection.aggregate(
    [
        {"$match": {"session_id": session_id, "is_removed": {"$ne": True}}},
        {
            "$group": {
                "_id": None,
                "total_items": {"$sum": 1},
                "verified_items": {"$sum": {"$cond": [{"$eq": ["$verified", True]}, 1, 0]}},
                "damage_items": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$damaged_qty", 0]}, 0]}, 1, 0]}},
                "total_variance": {"$sum": {"$ifNull": ["$variance", 0]}},
                "positive_variance": {
                    "$sum": {"$cond": [{"$gt": [{"$ifNull": ["$variance", 0]}, 0]}, {"$ifNull": ["$variance", 0]}, 0]}
                },
                "negative_variance": {
                    "$sum": {"$cond": [{"$lt": [{"$ifNull": ["$variance", 0]}, 0]}, {"$ifNull": ["$variance", 0]}, 0]}
                },
                "last_counted_at": {"$max": "$counted_at"},
            }
        },
    ],
    **kwargs,
).to_list(length=1)
```

Use a second aggregation for `variance_summary_projection`:

```python
approval_summary = await self.db.variance_summary_projection.aggregate(
    [
        {"$match": {"session_id": session_id}},
        {
            "$group": {
                "_id": None,
                "pending_approvals": {
                    "$sum": {
                        "$cond": [
                            {"$in": [{"$toUpper": {"$ifNull": ["$approval_status", ""]}}, ["PENDING", "NEEDS_REVIEW"]]},
                            1,
                            0,
                        ]
                    }
                },
                "approved_count": {
                    "$sum": {
                        "$cond": [
                            {"$eq": [{"$toUpper": {"$ifNull": ["$approval_status", ""]}}, "APPROVED"]},
                            1,
                            0,
                        ]
                    }
                },
            }
        },
    ],
    **kwargs,
).to_list(length=1)
```

Keep the update document fields unchanged.

**Step 4: Run projection tests**

Run:

```powershell
python -m pytest backend/tests/test_event_sourcing_contract.py backend/tests/services/test_projection_read_service.py -q
```

Expected: PASS.

---

### Task 5: Bound Session Analytics Aggregation Outputs

**Files:**
- Modify: `backend/api/session_management_api.py`
- Test: `backend/tests/api/test_session_management_api.py`

**Step 1: Write failing pipeline-bound tests**

Add tests around `_build_sessions_analytics_payload()` that assert:
- `status_pipeline` remains grouped by status
- `date_pipeline` limits output to a bounded recent window
- `warehouse_pipeline` and `staff_pipeline` sort and limit output
- `.to_list()` uses explicit finite lengths

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest backend/tests/api/test_session_management_api.py -q
```

Expected: FAIL because current code uses `to_list(None)` for multiple outputs.

**Step 3: Implement bounds**

Add constants near `_build_sessions_analytics_payload()`:

```python
SESSION_ANALYTICS_STATUS_LIMIT = 32
SESSION_ANALYTICS_DATE_LIMIT = 365
SESSION_ANALYTICS_DIMENSION_LIMIT = 100
```

Update pipelines:

```python
date_pipeline = [
    {"$project": {"date": {"$substr": ["$started_at", 0, 10]}}},
    {"$group": {"_id": "$date", "count": {"$sum": 1}}},
    {"$sort": {"_id": -1}},
    {"$limit": SESSION_ANALYTICS_DATE_LIMIT},
    {"$sort": {"_id": 1}},
]

warehouse_pipeline = [
    {"$group": {"_id": "$warehouse", "total_variance": {"$sum": {"$abs": "$total_variance"}}, "session_count": {"$sum": 1}}},
    {"$sort": {"total_variance": -1}},
    {"$limit": SESSION_ANALYTICS_DIMENSION_LIMIT},
]

staff_pipeline = [
    {"$group": {"_id": "$staff_name", "total_items": {"$sum": "$total_items"}, "session_count": {"$sum": 1}}},
    {"$sort": {"total_items": -1}},
    {"$limit": SESSION_ANALYTICS_DIMENSION_LIMIT},
]
```

Update reads:

```python
by_status = await db.sessions.aggregate(status_pipeline).to_list(SESSION_ANALYTICS_STATUS_LIMIT)
by_date = await db.sessions.aggregate(date_pipeline).to_list(SESSION_ANALYTICS_DATE_LIMIT)
by_warehouse = await db.sessions.aggregate(warehouse_pipeline).to_list(SESSION_ANALYTICS_DIMENSION_LIMIT)
by_staff = await db.sessions.aggregate(staff_pipeline).to_list(SESSION_ANALYTICS_DIMENSION_LIMIT)
```

**Step 4: Run focused tests**

Run:

```powershell
python -m pytest backend/tests/api/test_session_management_api.py -q
```

Expected: PASS.

---

### Task 6: Replace Dashboard Payload `any` Types

**Files:**
- Modify: `frontend/src/components/admin/dashboard/DashboardPanels.tsx`
- Modify: `frontend/src/components/admin/dashboard/dashboardWebShared.ts`
- Modify: `frontend/src/services/dashboardReadService.ts`
- Test: `frontend/__tests__/verification_audit.test.ts` if it already covers dashboard contracts, otherwise add `frontend/src/components/admin/dashboard/__tests__/DashboardPanels.types.test.tsx`

**Step 1: Add local dashboard interfaces**

Define narrow but tolerant interfaces in `DashboardPanels.tsx` or a new shared file:

```typescript
type ServiceKey = "backend" | "frontend" | string;

interface DashboardServiceStatus {
  running?: boolean;
  status?: string;
  name?: string;
  port?: number;
  health?: string;
  [key: string]: unknown;
}

interface DashboardSystemStats {
  active_sessions?: number;
  total_sessions?: number;
  total_users?: number;
  total_items?: number;
  [key: string]: unknown;
}

interface DashboardIssue {
  severity?: "critical" | "warning" | "info" | string;
  title?: string;
  description?: string;
  auto_fix_available?: boolean;
  [key: string]: unknown;
}

interface DiagnosisHealth {
  health_score?: number;
  total_issues?: number;
  critical_issues?: number;
  auto_fixable_issues?: number;
  issues?: DashboardIssue[];
  recommendations?: string[];
}

type ServicesStatusMap = Record<ServiceKey, DashboardServiceStatus>;
```

**Step 2: Replace payload `any` usage**

Change props:

```typescript
issues: DashboardIssue[];
servicesStatus: ServicesStatusMap | null;
systemStats: DashboardSystemStats | null;
metrics: DashboardMetrics | null;
onServiceToggle: (serviceKey: "backend" | "frontend", service: DashboardServiceStatus) => void;
diagnosisHealth: DiagnosisHealth | null;
onAutoFix: (issue: DashboardIssue) => void;
reports: DashboardReportSummary[];
```

Use safe service iteration:

```typescript
Object.values(servicesStatus ?? {}).filter((service) => Boolean(service.running)).length
```

Use stable keys for issue rows when possible:

```typescript
diagnosisHealth.issues.map((issue, index) => (
  <View key={`${issue.title ?? "issue"}-${index}`} style={styles.issueRow}>
```

**Step 3: Run frontend type check**

Run:

```powershell
cd frontend
pnpm exec tsc --noEmit
```

Expected before implementation: may fail once stricter types expose parent prop mismatches. Fix callers by aligning response mappers, not by reintroducing `any`.

**Step 4: Run frontend tests**

Run:

```powershell
make node-test
```

Expected: PASS.

---

### Task 7: Final Verification

**Files:**
- No source changes unless prior tasks reveal direct failures.

**Step 1: Run focused backend verification**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/api/test_session_management_api.py backend/tests/services/test_count_line_write_service_hardening.py backend/tests/services/test_projection_read_service.py backend/tests/test_event_sourcing_contract.py backend/tests/test_remediation_group1_serial_qty.py backend/tests/test_remediation_group12_concurrency.py -q
```

Expected: PASS.

**Step 2: Run frontend verification**

Run:

```powershell
cd frontend
pnpm exec tsc --noEmit
```

Expected: PASS.

**Step 3: Run compact repo verification**

Run:

```powershell
make agent-ci
```

Expected: PASS. If this fails outside the touched scope, capture the failing command and decide whether it is in-scope before expanding.

**Step 4: Check git diff**

Run:

```powershell
git diff -- backend/api/sync_batch_api.py backend/services/validation_service.py backend/services/projection_service.py backend/api/session_management_api.py frontend/src/components/admin/dashboard/DashboardPanels.tsx frontend/src/components/admin/dashboard/dashboardWebShared.ts frontend/src/services/dashboardReadService.ts
```

Expected: only targeted validation, authorization, aggregation, bounded analytics, and dashboard typing changes.

---

### Task 8: Approval-Gated Items To Avoid

Do not run any of these during this remediation without a separate Human Checkpoint:

- MongoDB backfills, projection rebuilds, or snapshot repair scripts.
- SQL Server writes of any kind.
- Deploy, rollback, or release workflow commands.
- Index drops/recreates, especially serial-related indexes.
- Destructive git operations.

This plan is local code and test work only.
