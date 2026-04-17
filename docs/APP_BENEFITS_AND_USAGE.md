# Stock Verify - Benefits & Usage Guide

## Overview

Stock Verify is a warehouse inventory counting app designed for **offline-first operations**. Staff can count inventory, scan barcodes, and track variances—even without network connectivity.

---

## Benefits of Using Stock Verify

### 1. Never Stop Counting (Offline-First)

| Feature | Benefit |
|---------|---------|
| **Offline Queue** | Count items without network; operations sync when connected |
| **Auto-Flush** | Automatically uploads data when connection restored |
| **Conflict Detection** | Clear UI for resolving sync conflicts |

**Real-world impact**: In warehouses with poor WiFi (basements, cold storage), staff can work uninterrupted.

---

### 2. Inventory Accuracy

| Feature | Benefit |
|---------|---------|
| **Variance Detection** | Auto-calculates difference between counted vs. expected |
| **Threshold Alerts** | Flags items that need supervisor review (>5% variance) |
| **Photo Evidence** | Attach photos to disputed counts |
| **Immutable Snapshots** | ERP data locked at session start prevents mid-count changes |

**Real-world impact**: High-variance items automatically routed for supervisor approval before finalization.

---

### 3. Speed & Efficiency

| Feature | Benefit |
|---------|---------|
| **Barcode Scanning** | Camera-based barcode scan with flash toggle |
| **PIN Login** | 4-digit quick re-authentication |
| **Bulk Approvals** | Supervisors approve/reject multiple items at once |
| **Scan Deduplication** | Prevents counting same item twice |

**Real-world impact**: Experienced staff can count 100+ items per hour.

---

### 4. Real-Time Visibility

| Feature | Benefit |
|---------|---------|
| **Live Dashboard** | Supervisors see team progress instantly |
| **Session Stats** | Items scanned, pending, variance summary |
| **Sync Status** | Clear indicators for offline/online state |

**Real-world impact**: Managers know exact inventory status without waiting for end-of-day reports.

---

### 5. Audit & Compliance

| Feature | Benefit |
|---------|---------|
| **Complete Logging** | Every action timestamped with user ID |
| **ERP Snapshots** | Immutable baseline prevents disputes |
| **Role Permissions** | Staff can't approve their own high-variance counts |

**Real-world impact**: Audit trail for stock discrepancies reduces shrinkage claims.

---

## Who Uses It?

### Staff (Warehouse Workers)

**Primary tasks**: Count inventory, scan items, submit counts

```
Daily Flow:
1. Login (username/password or PIN)
2. See active sessions on home screen
3. Create new session for assigned area
4. Scan items in assigned racks
5. Enter verified quantities
6. Submit counts (auto-approved or flagged for review)
```

### Supervisors

**Primary tasks**: Review variances, approve/reject counts, monitor team

```
Daily Flow:
1. View variance dashboard
2. Filter by floor, category, or variance threshold
3. Approve legitimate counts
4. Reject suspicious counts with recount assignment
5. Monitor active sessions
```

### Admins

**Primary tasks**: System health, reports, user management

```
Daily Flow:
1. Check system dashboard
2. Generate variance reports (CSV/Excel)
3. Manage users and roles
4. View error logs
```

---

## Key Screens

### Staff Screens

| Screen | Purpose |
|--------|---------|
| `/staff/home` | View/create sessions |
| `/staff/scan` | Barcode scanner + search |
| `/staff/item-detail` | Enter count, add notes/photos |
| `/staff/history` | Past session records |

### Supervisor Screens

| Screen | Purpose |
|--------|---------|
| `/supervisor/dashboard` | Team stats, recommendations |
| `/supervisor/variances` | Review flagged counts |
| `/supervisor/sessions` | All team sessions |
| `/supervisor/offline-queue` | Pending sync items |

### Admin Screens

| Screen | Purpose |
|--------|---------|
| `/admin/dashboard-web` | System health, controls |
| `/admin/realtime-dashboard` | Live verified items |
| `/admin/reports` | Export variance reports |
| `/admin/users` | User management |

---

## How Offline Mode Works

### When Offline (No WiFi)

```
✓ Can create/edit count lines
✓ Can scan barcodes
✓ Can pause/resume sessions
✓ Can search cached items
✗ Cannot approve variances (requires supervisor)
✗ Cannot generate reports
```

### When Back Online

```
1. App detects network restoration
2. Queued operations auto-sync in batches
3. Conflicts flagged to supervisor
4. User sees toast: "Sync complete: 15 items uploaded"
```

---

## Session Workflow

```
1. CREATE → Select warehouse, floor, rack
2. COUNT → Scan items, enter quantities
3. SUBMIT → System calculates variances
4. REVIEW → Supervisor approves (if needed)
5. FINALIZE → Lock counts, generate report
```

---

## Variance Thresholds

| Variance % | Action |
|-----------|--------|
| < 5% | Auto-approved |
| 5-15% | Supervisor review |
| > 15% | Additional approval required |
| > 50% | Block + alert |

---

## Quick Reference

| Question | Answer |
|----------|--------|
| **How do I login quickly?** | Use 4-digit PIN after first login |
| **Can't scan barcode?** | Use search by item code or name |
| **Item marked for review?** | Supervisor will review, you'll be notified |
| **Session paused accidentally?** | Resume from home screen |
| **Network lost mid-count?** | Continue counting—data saved locally |

---

## Business Value Summary

| Benefit | Impact |
|---------|--------|
| **No downtime** | Offline mode = zero counting interruptions |
| **Fewer errors** | Variance flags catch discrepancies early |
| **Less supervisor time** | Bulk operations and auto-approval |
| **Better audits** | Complete logging for every action |
| **Faster reporting** | Real-time dashboards vs. end-of-day |

---

## Technical Benefits

| Feature | Value |
|---------|-------|
| **Offline-first** | Works in warehouses with poor connectivity |
| **ERP-safe** | Read-only sync; never writes to SQL Server |
| **Scalable** | Batch sync handles high-volume counting |
| **Secure** | JWT tokens, RBAC, audit logs |
| **Mobile-ready** | iOS/Android via React Native/Expo |
