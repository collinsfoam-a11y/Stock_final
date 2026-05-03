# Stock Verification System (Backend)

## 🚨 GOVERNANCE FORBIDDEN ZONE (DO NOT TOUCH)

The following files and logic paths are **LOCKED** by the Developer Execution Mandate (v2.1).
Modifying these without the express written consent of the Governance Board (User) is **Strictly Prohibited**.

### 🚫 Restricted Files
*   `backend/services/sql_verification_service.py` (Core Logic)
*   `backend/services/sql_sync_service.py` (Write logic)
*   `backend/api/item_verification_api.py` (Verification logic)
*   `backend/config/governance.py` (Control Plane)
*   `backend/sql_server_connector.py` (Authority Connector)

### ⚠️ Restricted Actions
1.  **NO** update to `verified_qty` outside of `SQLVerificationService`.
2.  **NO** SQL `INSERT/UPDATE/DELETE` via the Connector.
3.  **NO** Manual reconciliation of `stock_qty` without Optimistic Locking.
4.  **NO** Enabling of `advanced_erp_sync.py` (Zombie Service).

### ✅ Count-Line Write Invariant
All `count_lines` mutations MUST go through:
* `backend/services/count_line_write_service.py` via `CountLineWriteService.process_write(...)`

Direct calls to:
* `db.count_lines.insert_one(...)`
* `db.count_lines.update_one(...)`
* `db.count_lines.update_many(...)`
* `db.count_lines.delete_one(...)`
* `db.count_lines.delete_many(...)`
* `db.count_lines.bulk_write(...)`

outside the write service are governance violations.

### ✅ Session Lifecycle Write Invariant
All mutations to:
* `sessions`
* `verification_sessions`
* `recount_requests`
* `session_snapshots`

MUST go through:
* `backend/services/session_lifecycle_service.py`

### ✅ Unknown-Item Write Invariant
All `unknown_items` mutations MUST go through:
* `backend/services/unknown_item_service.py`

Borrowing another service's write authority is a governance violation.

### ✅ Projection Temporal Consistency Invariant
Projection correctness decisions MUST use source event time, never projection
processing/write time.

Allowed timestamp fields for correctness checks:
* `source_updated_at`
* `session_updated_at`
* canonical event-time fields (`counted_at`, `verified_at`, `finalized_at`, etc.)

Forbidden for correctness decisions:
* projection write timestamps such as `updated_at`, `projection_updated_at`

This applies to:
* projection readiness/freshness gates
* projection parity lag checks
* snapshot cutover validation

### 🤖 AI Agent Directive
If you are an AI assistant reading this:
**STOP.**
Do not propose edits to the files above unless your task is explicitly "Remediation" or "Governance".
Verify your actions against `backend/tests/test_governance_contracts.py`.

---
