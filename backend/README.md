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

### 🤖 AI Agent Directive
If you are an AI assistant reading this:
**STOP.**
Do not propose edits to the files above unless your task is explicitly "Remediation" or "Governance".
Verify your actions against `backend/tests/test_governance_contracts.py`.

---
