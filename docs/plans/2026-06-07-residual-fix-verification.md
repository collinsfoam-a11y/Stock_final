# Residual Fix Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the two remaining verified gaps after the current remediation attempt: hard offline-sync authorization failures and bounded session status analytics.

**Architecture:** Keep the changes narrow. `sync_single_record()` should continue returning `(success, error)` for normal row-level sync/data/governance failures, but must re-raise FastAPI `HTTPException` for hard authorization failures. Session analytics should keep the same response shape while replacing the remaining unbounded status cursor materialization with an explicit limit.

**Tech Stack:** FastAPI, pytest, Motor-style async cursors, existing backend test helpers.

---

### Task 1: Preserve `HTTPException` In `sync_single_record()`

**Files:**
- Modify: `backend/api/sync_batch_api.py:381-391`
- Test: `backend/tests/api/test_sync_batch_logic.py`

**Step 1: Write the failing regression test**

Add the import:

```python
from fastapi import HTTPException
```

Add this test near the existing `sync_single_record()` tests:

```python
@pytest.mark.asyncio
async def test_sync_single_record_reraises_session_owner_forbidden():
    db = MagicMock()
    lifecycle_service = SimpleNamespace(
        ensure_session_active=AsyncMock(
            return_value={
                "id": "session-a",
                "session_id": "session-a",
                "status": "ACTIVE",
                "staff_user": "owner-user",
            }
        )
    )

    record = SyncRecord(
        client_record_id="offline-line-forbidden",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=1,
        damaged_qty=0,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )

    with pytest.raises(HTTPException) as exc:
        await sync_single_record(
            record,
            db,
            "other-user",
            user_role="staff",
            lifecycle_service=lifecycle_service,
            write_service=SimpleNamespace(process_write=AsyncMock(return_value=None)),
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Not authorized to sync records for this session"
```

**Step 2: Run the test to verify it fails**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py::test_sync_single_record_reraises_session_owner_forbidden -q
```

Expected before implementation: FAIL because `sync_single_record()` currently returns `(False, "403: ...")`.

**Step 3: Implement the minimal fix**

In `backend/api/sync_batch_api.py`, insert an `HTTPException` handler before the broad `except Exception`:

```python
    except GovernanceViolation as e:
        logger.error(
            "Governance violation syncing record {record.client_record_id}: %s",
            sanitize_for_logging(str(e)),
        )
        return False, str(e)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "Error syncing record {record.client_record_id}: %s", sanitize_for_logging(str(e))
        )
        return False, str(e)
```

This works because the endpoint-level `sync_batch()` already has:

```python
    except HTTPException:
        await circuit_breaker.record_failure()
        raise
```

**Step 4: Run focused tests**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py -q
```

Expected: PASS.

---

### Task 2: Add Missing Negative Quantity Regression Tests

**Files:**
- Modify: `backend/tests/api/test_sync_batch_logic.py`
- Modify: `backend/tests/services/test_count_line_write_service_hardening.py`

**Step 1: Add sync-edge tests**

Add two tests for `validate_record()`:

```python
@pytest.mark.asyncio
async def test_validate_record_rejects_negative_verified_qty():
    db = InMemoryDatabase()
    record = SyncRecord(
        client_record_id="negative-verified",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=-1,
        damaged_qty=0,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, db, lock_manager, user_id="staff1")

    assert conflict is not None
    assert conflict.conflict_type == "invalid_quantity"
    assert conflict.message == "Verified quantity cannot be negative"


@pytest.mark.asyncio
async def test_validate_record_rejects_negative_damaged_qty():
    db = InMemoryDatabase()
    record = SyncRecord(
        client_record_id="negative-damaged",
        session_id="session-a",
        location_id="showroom",
        floor_id="1",
        rack_id="A1",
        item_code="ITEM-1",
        verified_qty=1,
        damaged_qty=-1,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    lock_manager = SimpleNamespace(get_rack_lock_owner=AsyncMock(return_value=None))

    conflict = await validate_record(record, db, lock_manager, user_id="staff1")

    assert conflict is not None
    assert conflict.conflict_type == "invalid_quantity"
    assert conflict.message == "Damage quantity cannot be negative"
```

**Step 2: Add governed write validation tests**

In the write-service hardening test file, add tests that call the validation service or write service path and assert `NEGATIVE_QUANTITY` and `NEGATIVE_DAMAGE_QUANTITY`.

**Step 3: Run tests**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/services/test_count_line_write_service_hardening.py -q
```

Expected: PASS after current validation code remains in place.

---

### Task 3: Bound Status Analytics Materialization

**Files:**
- Modify: `backend/api/session_management_api.py:688-753`
- Modify: `backend/tests/api/test_session_management_api.py:1383-1455`

**Step 1: Write or update test assertions**

In `test_get_sessions_analytics()`, after the request assertion, add direct cursor assertions:

```python
assert by_status_cursor.to_list.await_args.args[0] == MAX_STATUS_BUCKETS
assert by_date_cursor.to_list.await_args.args[0] == MAX_DATE_BUCKETS
assert by_warehouse_cursor.to_list.await_args.args[0] == MAX_WAREHOUSE_BUCKETS
assert by_staff_cursor.to_list.await_args.args[0] == MAX_STAFF_BUCKETS
```

Import the constants from `backend.api.session_management_api` if needed.

**Step 2: Run test to verify it fails**

Run:

```powershell
python -m pytest backend/tests/api/test_session_management_api.py::TestSessionAnalyticsEndpoint::test_get_sessions_analytics -q
```

Expected before implementation: FAIL because `by_status` still uses `to_list(None)`.

**Step 3: Implement bound**

Add a status bucket constant:

```python
MAX_STATUS_BUCKETS = 32
```

Update `status_pipeline`:

```python
status_pipeline = [
    {
        "$group": {
            "_id": "$status",
            "count": {"$sum": 1},
        }
    },
    {"$sort": {"count": -1}},
    {"$limit": MAX_STATUS_BUCKETS},
]
```

Update the read:

```python
by_status = await db.sessions.aggregate(status_pipeline).to_list(MAX_STATUS_BUCKETS)
```

**Step 4: Run focused test**

Run:

```powershell
python -m pytest backend/tests/api/test_session_management_api.py::TestSessionAnalyticsEndpoint::test_get_sessions_analytics -q
```

Expected: PASS.

---

### Task 4: Final Verification

**Files:**
- No additional source changes unless focused tests expose a local regression.

**Step 1: Run backend focused suite**

Run:

```powershell
python -m pytest backend/tests/api/test_sync_batch_logic.py backend/tests/api/test_session_management_api.py backend/tests/services/test_count_line_write_service_hardening.py backend/tests/services/test_projection_read_service.py backend/tests/test_event_sourcing_contract.py -q
```

Expected: PASS.

**Step 2: Run frontend typecheck**

Use npm in this environment because `pnpm` was not available in the current shell:

```powershell
cd frontend
npm run typecheck
```

Expected: PASS.

**Step 3: Re-run the direct auth probe**

Run a small probe or rely on the new regression test. Expected behavior:

```text
RAISED_HTTP_EXCEPTION status=403 detail=Not authorized to sync records for this session
```

**Step 4: Check remaining known patterns**

Run:

```powershell
rg -n "to_list\\(None\\)|issues: any\\[\\]|servicesStatus: any|systemStats: any|metrics: any|issue: any|verified_items_projection\\.find\\(" backend/api/session_management_api.py backend/services/projection_service.py frontend/src/components/admin/dashboard/DashboardPanels.tsx
```

Expected: no hits for the remediated findings.

---

### Do Not Do In This Fix

- Do not run backfills, projection rebuild scripts, migrations, deploys, or index changes.
- Do not broaden into `projection_write_service.py`, local SQLite search, or unrelated performance findings from `post_fix_verification.md`.
- Do not refactor `sync_single_record()` return shape beyond preserving `HTTPException`; legacy callers still expect `(bool, Optional[str])` for normal sync row failures.
