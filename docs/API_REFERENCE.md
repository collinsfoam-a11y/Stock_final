# Stock Verify API Documentation

## Overview

The Stock Verify API is a FastAPI-based backend service that manages warehouse inventory counting sessions, user authentication, and ERP integration.

**Base URL**: `http://localhost:8001` (development)

---

## Authentication

### Login

Authenticate with username and password to receive JWT tokens.

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "username": "staff1",
  "password": "password123"
}
```

**Response** (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900
}
```

**Response** (401 - Invalid credentials):
```json
{
  "detail": "Invalid username or password"
}
```

---

### Refresh Token

Get a new access token using a refresh token.

**Endpoint**: `POST /api/auth/refresh`

**Request Body**:
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response** (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 900
}
```

---

### PIN Login

Quick authentication using a 4-digit PIN (after initial login).

**Endpoint**: `POST /api/auth/pin-login`

**Request Body**:
```json
{
  "username": "staff1",
  "pin": "1234"
}
```

**Response** (200):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

---

### Logout

Invalidate the current session.

**Endpoint**: `POST /api/auth/logout`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "message": "Logged out successfully"
}
```

---

## Sessions

### Create Session

Create a new counting session.

**Endpoint**: `POST /api/sessions`

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "warehouse": "Main Warehouse",
  "location_type": "Showroom",
  "location_name": "Floor 1",
  "rack_no": "A1",
  "type": "STANDARD"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| warehouse | string | Yes | Target warehouse name |
| location_type | string | Yes | Type: Showroom, Godown, etc. |
| location_name | string | Yes | Floor or area name |
| rack_no | string | Yes | Rack identifier |
| type | string | No | STANDARD, BLIND, STRICT (default: STANDARD) |

**Response** (201):
```json
{
  "id": "65f1234567890abcdef12345",
  "warehouse": "Main Warehouse",
  "location_type": "Showroom",
  "location_name": "Floor 1",
  "rack_no": "A1",
  "staff_user": "staff1",
  "status": "OPEN",
  "type": "STANDARD",
  "started_at": "2026-04-16T10:00:00Z",
  "snapshot_hash": "abc123..."
}
```

---

### List Sessions

Get all sessions (filtered by user's role).

**Endpoint**: `GET /api/sessions`

**Headers**: `Authorization: Bearer <token>`

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status (OPEN, ACTIVE, COMPLETED, etc.) |
| warehouse | string | Filter by warehouse |
| page | int | Page number (default: 1) |
| limit | int | Items per page (default: 20) |

**Response** (200):
```json
{
  "items": [
    {
      "id": "65f1234567890abcdef12345",
      "warehouse": "Main Warehouse",
      "status": "OPEN",
      "count": 15,
      "pending": 5
    }
  ],
  "total": 50,
  "page": 1,
  "pages": 3
}
```

---

### Get Session

Get details of a specific session.

**Endpoint**: `GET /api/sessions/{session_id}`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12345",
  "warehouse": "Main Warehouse",
  "location_type": "Showroom",
  "location_name": "Floor 1",
  "rack_no": "A1",
  "staff_user": "staff1",
  "staff_name": "John Staff",
  "status": "ACTIVE",
  "type": "STANDARD",
  "started_at": "2026-04-16T10:00:00Z",
  "last_heartbeat": "2026-04-16T10:30:00Z",
  "count_lines": 15,
  "pending_approval": 2,
  "variance_count": 3
}
```

---

### Session Heartbeat

Send heartbeat to keep session active.

**Endpoint**: `POST /api/sessions/{session_id}/heartbeat`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "message": "Heartbeat received",
  "last_heartbeat": "2026-04-16T10:30:00Z"
}
```

---

### Activate Session

Change session status to ACTIVE.

**Endpoint**: `POST /api/sessions/{session_id}/activate`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12345",
  "status": "ACTIVE"
}
```

---

### Pause Session

Pause an active session.

**Endpoint**: `POST /api/sessions/{session_id}/pause`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12345",
  "status": "PAUSED"
}
```

---

### Finalize Session

Complete and close a session.

**Endpoint**: `POST /api/sessions/{session_id}/finalize`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12345",
  "status": "CLOSED",
  "finalized_at": "2026-04-16T11:00:00Z",
  "summary": {
    "total_items": 100,
    "approved": 95,
    "pending_approval": 3,
    "rejected": 2
  }
}
```

---

## Count Lines

### Create Count Line

Record a count for an item.

**Endpoint**: `POST /api/count-lines`

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "session_id": "65f1234567890abcdef12345",
  "item_code": "ITEM-001",
  "item_name": "Widget A",
  "verified_qty": 50,
  "expected_qty": 55,
  "damaged_qty": 0,
  "condition": "good",
  "notes": "Shelf was understocked"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| session_id | string | Yes | Parent session ID |
| item_code | string | Yes | ERP item code |
| item_name | string | No | Item display name |
| verified_qty | int | Yes | Physically counted quantity |
| expected_qty | int | No | Expected from ERP (auto-filled if not provided) |
| damaged_qty | int | No | Damaged items count |
| condition | string | No | good, damaged, expired |
| notes | string | No | Additional notes |

**Response** (201):
```json
{
  "id": "65f1234567890abcdef12346",
  "session_id": "65f1234567890abcdef12345",
  "item_code": "ITEM-001",
  "item_name": "Widget A",
  "verified_qty": 50,
  "expected_qty": 55,
  "variance_qty": -5,
  "variance_pct": -9.09,
  "status": "DRAFT",
  "approval_status": "AUTO_APPROVED"
}
```

---

### Submit Count Line

Submit a count line for review (if variance exceeds threshold).

**Endpoint**: `POST /api/count-lines/{count_line_id}/submit`

**Headers**: `Authorization: Bearer <token>`

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12346",
  "status": "SUBMITTED",
  "approval_status": "PENDING_APPROVAL"
}
```

---

### Approve Count Line

Supervisor approves a count line.

**Endpoint**: `POST /api/count-lines/{count_line_id}/approve`

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "notes": "Count verified with recount"
}
```

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12346",
  "status": "SUBMITTED",
  "approval_status": "APPROVED",
  "approved_by": "supervisor1",
  "approved_at": "2026-04-16T11:30:00Z"
}
```

---

### Reject Count Line

Supervisor rejects a count line for recount.

**Endpoint**: `POST /api/count-lines/{count_line_id}/reject`

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "reason": "Item was double-counted",
  "assign_to": "staff1"
}
```

**Response** (200):
```json
{
  "id": "65f1234567890abcdef12346",
  "status": "REJECTED",
  "approval_status": "REJECTED",
  "rejected_by": "supervisor1",
  "rejected_at": "2026-04-16T11:30:00Z",
  "rejection_reason": "Item was double-counted",
  "reassigned_to": "staff1"
}
```

---

## Sync

### Batch Sync

Sync offline operations in batch.

**Endpoint**: `POST /api/sync/batch`

**Headers**: `Authorization: Bearer <token>`

**Request Body**:
```json
{
  "operations": [
    {
      "id": "op_001",
      "type": "count_line",
      "action": "create",
      "payload": {
        "session_id": "65f1234567890abcdef12345",
        "item_code": "ITEM-001",
        "verified_qty": 50
      },
      "timestamp": "2026-04-16T10:30:00Z"
    }
  ]
}
```

**Response** (200):
```json
{
  "results": [
    {
      "id": "op_001",
      "status": "success",
      "result": {
        "id": "65f1234567890abcdef12346"
      }
    }
  ],
  "total": 1,
  "success_count": 1,
  "failed_count": 0
}
```

---

## Health Checks

### Liveness Probe

Kubernetes liveness check.

**Endpoint**: `GET /health/live`

**Response** (200):
```json
{
  "alive": true,
  "timestamp": "2026-04-16T10:00:00Z"
}
```

---

### Readiness Probe

Kubernetes readiness check (checks MongoDB connectivity).

**Endpoint**: `GET /health/ready`

**Response** (200):
```json
{
  "ready": true,
  "checks": {
    "mongodb": true,
    "sql_server": true,
    "disk_space": true
  },
  "message": "System operational (All systems operational)"
}
```

**Response** (503 - Not Ready):
```json
{
  "ready": false,
  "checks": {
    "mongodb": false,
    "sql_server": true
  },
  "message": "MongoDB is required but not available"
}
```

---

### Version Check

Check if client version is compatible.

**Endpoint**: `GET /api/version/check?client_version=1.0.0`

**Response** (200):
```json
{
  "is_compatible": true,
  "is_latest": true,
  "update_available": false,
  "update_type": null,
  "force_update": false,
  "client_version": "1.0.0",
  "minimum_version": "1.0.0",
  "current_version": "1.0.0"
}
```

---

## Error Responses

All API endpoints may return these error responses:

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Request validation failed |
| 500 | Internal Server Error |

**Error Response Format**:
```json
{
  "detail": "Error message description",
  "error_code": "ERROR_CODE",
  "timestamp": "2026-04-16T10:00:00Z"
}
```

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/api/auth/login` | 10 requests/minute |
| `/api/auth/pin-login` | 30 requests/minute |
| Other endpoints | 100 requests/minute |

Rate limit headers included in responses:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## WebSocket

Real-time updates via WebSocket.

**Endpoint**: `ws://host/ws/{user_id}`

**Messages**:

```json
{
  "type": "session_update",
  "data": {
    "session_id": "65f1234567890abcdef12345",
    "status": "ACTIVE"
  }
}
```

---

## Offline Sync Protocol

1. **Detect Offline**: App monitors `navigator.onLine` and `Connection` API
2. **Queue Operations**: Mutations stored in local SQLite queue
3. **Batch Sync**: On reconnect, POST to `/api/sync/batch`
4. **Conflict Resolution**: Server returns conflicts for manual resolution

---

## Appendix: Session States

| State | Description |
|-------|-------------|
| OPEN | Session created, not yet active |
| ACTIVE | Staff actively counting |
| PAUSED | Session paused by staff |
| RECONCILE | In reconciliation phase |
| COMPLETED | Counting finished, awaiting finalization |
| CLOSED | Finalized and locked |
| CANCELLED | Session cancelled |

---

## Appendix: Count Line States

| State | Description |
|-------|-------------|
| DRAFT | Initial state, editable |
| SUBMITTED | Submitted for review |
| PENDING_APPROVAL | Awaiting supervisor approval |
| APPROVED | Supervisor approved |
| REJECTED | Rejected, needs recount |
| LOCKED | Finalized, read-only |

---

## Appendix: Variance Thresholds

| Variance % | Action |
|-----------|--------|
| < 5% | Auto-approve |
| 5-15% | Supervisor review |
| > 15% | Additional approval |
| > 50% | Block + alert |
