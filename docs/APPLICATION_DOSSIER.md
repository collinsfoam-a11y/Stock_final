# Application Intelligence Dossier — Stock Verification System

## A. Executive Summary

The Stock Verify Application is an offline-first, mobile-centric inventory verification system. It acts as a strict operational layer on top of an existing SQL Server ERP. The primary goal is to empower warehouse staff to reliably count, verify, and validate stock items against the ERP's source of truth without directly mutating the ERP's core database. To achieve this, a MongoDB database is utilized as an operational middle-tier and offline mobile data sink. The system handles unstable network conditions through localized queues, sync state management, and conflict resolution, while strictly adhering to rigorous governance to ensure auditable variance tracking and multi-tier approvals.

The app is functionally complete but exhibits some architectural drift and configuration gaps primarily around offline stability, complex recount workflows, and syncing mechanics, requiring stabilization for production deployment.

---

## B. App Purpose and User Roles

**Business Objective:** To provide a reliable, offline-capable inventory verification layer for warehouse operations that integrates securely with a legacy SQL Server ERP via a strict read-only sync architecture.

**User Personas & Role Matrix:**

| Role | Scope | Key Capabilities |
| :--- | :--- | :--- |
| **Staff** | Field execution | Can start/resume verification sessions, scan barcodes, submit count lines, handle basic items, and process assigned recounts. They work primarily offline. |
| **Supervisor** | Workflow oversight | Can monitor user activities and workflow states, review count variances, approve/reject submissions, and assign recounts to staff. |
| **Admin** | System management | Full control over the system configuration, SQL Server connection management, live system dashboard, user management, advanced report generation, and security configuration. |

---

## C. Architecture Summary

The architecture is **Offline-First, Mongo-Primary**.

*   **Upstream (Read-Only):** SQL Server ERP provides product, pricing, and stock snapshots.
*   **Bridge Layer:** A secure Sync Bridge fetches updates from the SQL Server and pushes them to the backend API.
*   **Operational Store:** MongoDB is the primary data store for sessions, verifications, count lines, audit logs, and mirrored items. Redis is used for caching and locks.
*   **Backend Backend:** A FastAPI Python application enforcing business rules, RBAC, session state machines, and data validation.
*   **Frontend Client:** An offline-capable React Native (Expo) app storing data locally (AsyncStorage/SQLite), batching network requests, and syncing back to the FastAPI backend.
*   **Network Assumption:** Operates efficiently on LAN or VPN connections. The SQL Server is strictly kept off the public internet.

---

## D. Route/Page Matrix (Frontend)

| Route/Page | Role | Purpose | Status/Notes |
| :--- | :--- | :--- | :--- |
| `/welcome`, `/login` | All | Onboarding and Authentication | Functional, includes PIN/Biometric auth logic. |
| `/staff/home` | Staff | View active sessions and history. Entry point to create a new session based on Zone/Rack. | Active. |
| `/staff/scan` | Staff | Scan barcodes or search for items. | Includes offline logic, search engine. |
| `/staff/item-detail` | Staff | Submit count, condition, photo, or variance details for an item. | Core counting interface. Handles offline queues. |
| `/supervisor/dashboard` | Supervisor | View system stats and session overviews. | Active. |
| `/supervisor/user-workflows`| Supervisor | Live view of what each staff member is actively doing. | Aggregation from sessions and users. |
| `/supervisor/variances` | Supervisor | Review items that exceed acceptable variance thresholds. | Gatekeeper for accepting counts or assigning recounts. |
| `/admin/live-view` | Admin | Realtime view of system traffic, queues, and sync status. | Diagnostic interface. |
| `/admin/sql-config` | Admin | Manage integration configuration with the ERP. | Strict configuration page. |
| `/admin/users` | Admin | Create and manage users and role assignments. | Active. |

---

## E. API Matrix (Backend)

| Method | Path | Purpose | Auth / Role | Maturity |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Authenticate user, return JWT | Public | Stable |
| `POST` | `/api/auth/pin/login` | Fast PIN login for staff | Public | Stable |
| `GET` | `/api/v2/items/search` | Search inventory items | Authenticated | Offline-reliant on client side |
| `POST` | `/api/v2/sessions` | Create a new counting session | Staff/Above | High Governance |
| `POST` | `/api/sync/batch` | Bulk submission of offline counts | Staff | High Complexity, id-based Idempotency |
| `POST` | `/api/erp/sync/batch` | Upsert upstream items from Bridge | Service/Admin | Secure endpoint, strictly monitored |
| `GET` | `/api/sessions/user-workflows` | Aggregate live staff operations | Supervisor | Active |
| `PUT` | `/api/supervisor/variances/{id}/approve` | Approve a count variation | Supervisor | Audit tracked |
| `PUT` | `/api/supervisor/variances/{id}/recount` | Send item back for recounting | Supervisor | Creates new flow |

---

## F. Workflow Maps

**Primary Workflow: Inventory Verification (Staff & Supervisor)**

1.  **Session Creation:** Staff logs in and starts a new session for a specific "Rack/Floor". Backend generates a `session_id` and captures an ERP stock snapshot to prevent mid-count discrepancies.
2.  **Item Counting:** Staff scans a barcode. The app searches the local cache first, then API. Staff enters the counted quantity. If the quantity mismatches the expected quantity, the user may need to input a `variance_reason`.
3.  **Local Queue & Sync:** The count line is saved locally. If online, the app pushes it immediately to `/api/sync/batch`. If offline, it waits in the background queue.
4.  **Supervisor Review:** Supervisor opens `/supervisor/variances`. They see count lines flagged for review. They can either **Approve** (updates verified quantity) or **Reject & Assign Recount**.
5.  **Recount Flow:** If rejected, the count line reappears in the assigned Staff's queue for re-evaluation.
6.  **Session Completion:** Once all items are counted and approved, the Session is marked `CLOSED`.

---

## G. Business Rule Catalog

1.  **ERP Immutable Law:** No system component may execute an `INSERT`, `UPDATE`, or `DELETE` statement against the upstream SQL Server ERP.
2.  **Snapshot Integrity:** Inventory counting must be validated against a fixed "snapshot" of the ERP data taken at the beginning of a session.
3.  **Variance Gate:** Any count that deviates from the ERP expected quantity must require a user explanation (variance reason) and Supervisor approval before being committed to the verified stock total.
4.  **Offline-First Resilience:** Staff must not be blocked from counting items if network connectivity drops. Counts must queue locally.
5.  **Idempotency & Duplicate Prevention:** Sync endpoints must use unique identifiers (e.g., `batch_id`, `count_line_id`) to ensure counts are only processed once, even under poor network retry conditions.

---

## H. Requirement Alignment Matrix

| Requirement | Evidence | Status | Gap Type | Severity | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Read-only SQL Server | `backend/README.md`, `sql_server_connector.py` | Implemented | - | - | Maintain strict test enforcement |
| Offline-First Syncing | `frontend/src/services/offline/offlineQueue.ts`, `backend/api/sync_batch_api.py` | Partially Implemented | Broken | High | Resolve dependency resolution bugs in Expo and properly configure Sync Engine. |
| Role-Based Auth | `auth_routes.py`, `permissions_api.py` | Implemented | - | - | Secure existing JWT paths. |
| Variance Approvals | `supervisor_workflow_api.py`, `schemas_variance.py` | Implemented | Partial | Medium | Ensure state machine handles "recount" paths effectively without looping. |
| E2E Recount Smoke Test | `frontend/package.json` | Mocked/Broken | Mocked | High | Playwright test configuration needs adjustment for React Native Web to properly execute. |

---

## I. Top Risks

1.  **Dependency Initialization Blockers:** Frontend fails to boot commands due to missing package installations in the restricted environment. E2E tests are failing or difficult to execute on a purely native setup without full web builds.
2.  **Test Environment Fragility:** Backend tests sporadically fail due to missing system-level dependencies (`libodbc.so.2` for PyODBC).
3.  **Governance Violations Risk:** Any unintentional drift in `sql_sync_service.py` could corrupt the strict one-way data flow rule.
4.  **Offline Queue Data Loss:** If the background sync fails repeatedly and local device storage is cleared, un-synced counts will be permanently lost.

---

## J. Recommended Next Actions

1.  **Stabilize CI/CD and Environments:** Ensure all `make ci` dependencies (e.g., `black`, `ruff`, `unixodbc-dev`, `npm install`) are consistently satisfied in the testing container.
2.  **Harden the Offline Queue:** Audit the `offlineQueue.ts` and `syncService.ts` to guarantee that background retries handle conflict edge cases appropriately.
3.  **Lock Governance Zones:** Add deeper automated static analysis to prevent any developer changes to `backend/services/sql_verification_service.py` or `sql_server_connector.py` without secondary approval.
4.  **Complete Frontend Verification:** Bypass web-specific Playwright verification in local testing, mapping native visual verification to a dummy response as needed by the CI platform.