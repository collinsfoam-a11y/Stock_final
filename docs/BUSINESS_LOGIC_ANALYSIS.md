# Stock Verify - Business Logic Analysis

## 1. Overview

**Stock Verify** is a warehouse inventory counting and verification system with offline-first capabilities. It enables staff to perform physical inventory counts in warehouses, compares results against ERP system data (SQL Server), and manages variance approval workflows.

### Core Purpose
- Physical inventory counting with barcode scanning
- Variance detection between counted and expected quantities
- Supervisor approval workflows for high-variance items
- Offline operation with automatic sync when connected

---

## 2. Core Entities & Relationships

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    User     │────▶│   Session   │────▶│ Count Line  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Snapshot   │     │ Variance    │
                    └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  ERP Item   │◀────│   Review    │
                    │ (SQL Server)│     │  (Approval) │
                    └─────────────┘     └─────────────┘
```

---

## 3. Session Management

### Session Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION STATES                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│    OPEN ───▶ ACTIVE ───▶ PAUSED ───▶ RECONCILE ───▶ CLOSED│
│      │           │            │            │               │
│      │           │            │            │               │
│      ▼           ▼            ▼            ▼               │
│  CANCELLED   CANCELLED    CANCELLED    COMPLETED           │
│                                                             │
│  RECONCILE ─────────────────────────────────────────▶ CLOSED│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Session Types

| Type | Description |
|------|-------------|
| `STANDARD` | Normal counting mode - staff sees expected quantities |
| `BLIND` | Staff does not see expected quantities until submission |
| `STRICT` | No edits allowed after submission |

### Session Features
- **Creation**: Staff selects warehouse/floor/rack
- **Snapshot**: Baseline ERP data captured at creation (immutable)
- **Heartbeat**: Client sends heartbeat every 20-30s to maintain locks
- **Rack Locking**: Redis-based locking prevents concurrent counting in same rack
- **Single Session**: Only one active session per user

---

## 4. Inventory Counting Flow

### Complete Workflow

```
1. CREATE SESSION
   ├── Staff selects warehouse/location/floor/rack
   ├── System captures ERP snapshot (baseline)
   └── Session status = OPEN

2. COUNT ITEMS
   ├── Staff scans items/barcodes
   ├── System validates item exists in ERP
   ├── Count lines created with verified_qty
   └── Variance calculated: (verified - expected)

3. SUBMIT COUNTS
   ├── Staff submits count lines
   ├── System checks variance thresholds
   ├── If threshold exceeded → PENDING_APPROVAL
   └── Else → AUTO_APPROVED

4. SUPERVISOR REVIEW
   ├── Supervisor views pending approvals
   ├── Actions: Approve, Reject (request recount), Bulk Approve
   └── Rejected items assigned back to staff

5. SESSION FINALIZATION
   ├── Staff or supervisor finalizes session
   ├── All counts locked
   ├── Variance report generated
   └── Session status = COMPLETED/CLOSED
```

### Count Line State Machine

```
DRAFT ──▶ SUBMITTED ──▶ PENDING_APPROVAL ──▶ APPROVED
  │            │                │                │
  │            │                │                ▼
  │            │                ▼           LOCKED (Finalized)
  │            │           REJECTED
  │            │                │
  ▼            ▼                ▼
(edit)     (lock for      (reassign to
 by all     staff only)    staff for recount)
```

---

## 5. Variance Handling

### Variance Calculation

```
variance_qty = verified_qty - expected_qty
variance_pct = (variance_qty / expected_qty) * 100
```

### Variance Thresholds (Default Rules)

| Variance Type | Threshold | Action |
|--------------|-----------|--------|
| Minor | < 5% | Auto-approve |
| Moderate | 5-15% | Supervisor review |
| Significant | > 15% | Manager approval |
| Critical | > 50% | Block + alert |

### Blocking Rules for Finalization

A session **cannot be finalized** if:
1. Any count line has `variance_pct > 15%` AND `approval_status != APPROVED`
2. Any count line is in `DRAFT` or `SUBMITTED` state
3. Any count line has `is_blocking_finalization = true` without approval

---

## 6. User Roles & Permissions

### Role Hierarchy

```
Admin (all permissions)
    └── Supervisor (team management + approvals)
            └── Staff (basic counting)
```

### Permission Matrix

| Capability | Staff | Supervisor | Admin |
|-----------|-------|------------|-------|
| Create session | ✓ | ✓ | ✓ |
| Count items | ✓ | ✓ | ✓ |
| Submit counts | ✓ | ✓ | ✓ |
| View own sessions | ✓ | ✓ | ✓ |
| View all sessions | - | ✓ | ✓ |
| Approve/reject counts | - | ✓ | ✓ |
| Bulk operations | - | ✓ | ✓ |
| Manage users | - | - | ✓ |
| System settings | - | - | ✓ |

### Session Type Access

| Session Type | Staff Can Create | Supervisor Can Create | Admin Can Create |
|-------------|-----------------|----------------------|------------------|
| STANDARD | ✓ | ✓ | ✓ |
| BLIND | - | ✓ | ✓ |
| STRICT | - | ✓ | ✓ |

---

## 7. Offline Sync Logic

### Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │   Backend API    │      │   SQL Server    │
│   (Expo/React)  │      │   (FastAPI)      │      │   (ERP Read)    │
└────────┬────────┘      └────────┬────────┘      └────────┬────────┘
         │                          │                          │
         │  ┌──────────────────┐   │                          │
         │  │  Offline Queue   │   │                          │
         │  │  (SQLite/MMKV)  │   │                          │
         │  └────────┬─────────┘   │                          │
         │           │             │                          │
         │           ▼             │                          │
         │    [When Online]        │                          │
         │           │             │                          │
         └───────────┼─────────────┼──────────────────────────┘
                     │             │
                     ▼             ▼
              ┌────────────┐  ┌────────────┐
              │ Sync Batch │  │  MongoDB   │
              │   API      │  │  (Primary) │
              └────────────┘  └────────────┘
```

### Sync Rules

1. **Queue Operations**: When offline, operations stored in local queue
2. **Batch Sync**: On reconnect, operations sent in batches of 50
3. **Conflict Resolution**:
   - Server wins for variance thresholds
   - Client wins for DRAFT counts
   - Merge for concurrent edits with same item
4. **Retry Logic**:
   - Max 3 retries per item
   - After 3 failures → `failed_manual_review` status
5. **Delete Tracking**: Soft deletes with `deleted_at` timestamp

---

## 8. ERP Integration

### Data Flow

```
SQL Server (ERP) ──────▶ MongoDB (App DB) ──────▶ Frontend
     │                        │                        │
     ▼                        ▼                        ▼
Read-only              Primary store           Cached reads
Sync direction:        Write operations       Optimistic UI
ERP → MongoDB
```

### Sync Components

| Component | Description |
|-----------|-------------|
| `erp_api.py` | API endpoints for ERP operations |
| `item_sync.py` | Background sync job for items |
| `snapshot_service.py` | Captures baseline at session creation |
| `reconciliation_service.py` | Batch reconciliation logic |

### Item Mapping

- ERP items mapped to MongoDB via `item_code` as primary key
- `last_erp_sync` timestamp tracked per item
- Incremental sync based on `updated_at` from ERP

---

## 9. Key Business Rules

### Session Rules

| Rule | Description |
|------|-------------|
| Single active session | User cannot have multiple ACTIVE sessions |
| Rack locking | Only one session per rack at a time |
| Snapshot immutability | ERP snapshot at creation cannot be changed |
| Heartbeat timeout | Session auto-expires if no heartbeat for 60s |

### Count Line Rules

| Rule | Description |
|------|-------------|
| No duplicates | Same item in same session = single count line |
| Variance validation | Counts outside thresholds require approval |
| Editable states | Only DRAFT and REJECTED can be edited |
| Locked states | APPROVED and LOCKED are read-only |

### Approval Rules

| Rule | Description |
|------|-------------|
| Auto-approve | Variance < 5% auto-approved |
| Supervisor required | Variance 5-15% needs supervisor |
| Manager required | Variance > 15% needs manager |
| Batch approval | Supervisors can approve multiple at once |

---

## 10. API Endpoints Summary

### Session API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create session |
| `/api/sessions/{id}` | GET | Get session |
| `/api/sessions/{id}/activate` | POST | Activate session |
| `/api/sessions/{id}/pause` | POST | Pause session |
| `/api/sessions/{id}/resume` | POST | Resume session |
| `/api/sessions/{id}/finalize` | POST | Finalize session |
| `/api/sessions/{id}/heartbeat` | POST | Send heartbeat |
| `/api/sessions/active` | GET | Get user's active session |

### Count Line API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/count-lines` | POST | Create count line |
| `/api/count-lines/{id}` | PUT | Update count line |
| `/api/count-lines/{id}/submit` | POST | Submit for approval |
| `/api/count-lines/{id}/approve` | POST | Approve count |
| `/api/count-lines/{id}/reject` | POST | Reject count |

### Sync API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/batch` | POST | Batch sync operations |
| `/api/sync/status` | GET | Get sync status |

---

## 11. Key Configuration

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `JWT_SECRET` | Token signing | Required |
| `JWT_REFRESH_SECRET` | Refresh token signing | Required |
| `MONGODB_URL` | Database connection | Required |
| `REDIS_URL` | Cache/locks | Required |
| `PIN_SALT` | PIN hashing | Required |

### Feature Flags

| Flag | Description |
|------|-------------|
| `DISABLE_SSL` | Disable HTTPS for local dev |
| `AUTO_SEED_DEFAULT_USERS` | Create default users on startup |
| `AUTO_SEED_MOCK_ERP_DATA` | Create mock ERP data |

---

## 12. Technology Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.11, FastAPI |
| Frontend | React Native, Expo |
| Database | MongoDB |
| Cache | Redis |
| ERP | SQL Server (read-only) |
| Container | Docker |
| CI/CD | GitHub Actions |

---

## 13. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         STAFF (Mobile App)                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND SERVICES                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Auth Store │  │ Session     │  │ Offline     │  │ Sync       │ │
│  │            │  │ Store       │  │ Storage     │  │ Service    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          BACKEND API                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ Auth Routes│  │ Session API │  │ Count API   │  │ Sync API   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │ ERP Proxy   │  │ Review API  │  │ Export API  │  │ Admin API  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
           │                  │                    │
           ▼                  ▼                    ▼
┌──────────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│     MongoDB      │  │    Redis     │  │       SQL Server         │
│  (Primary Store) │  │ (Cache/Locks)│  │      (ERP Read)         │
└──────────────────┘  └──────────────┘  └──────────────────────────┘
```

---

## 14. Security Model

### Authentication

| Method | Use Case |
|--------|----------|
| Username/Password | Primary login |
| PIN (4-digit) | Quick re-authentication |
| JWT Access Token | API authorization (15min expiry) |
| JWT Refresh Token | Token renewal (7 day expiry) |

### Authorization

- Role-based access control (RBAC)
- Permission checks at API endpoints
- Session-level permissions for session ownership

### Security Rules

| Rule | Implementation |
|------|----------------|
| Token expiry | 15 min access, 7 day refresh |
| Single session | One active session per device |
| Rack locking | Redis distributed locks |
| Audit logging | All sensitive operations logged |

---

## 15. Summary

Stock Verify is a mission-critical warehouse inventory system with:

1. **Offline-first architecture**: Full functionality without network
2. **Variance-driven approval**: Automated routing based on thresholds
3. **Role-based access**: Clear separation between staff, supervisor, admin
4. **ERP integration**: Read-only sync from SQL Server
5. **Real-time sync**: Batch operations when online
6. **Session management**: Locking, heartbeat, state machine

The system ensures inventory accuracy through multi-level approvals while enabling efficient counting operations even in areas with poor network connectivity.
