# Stock Verify Application - User Workflows

This document outlines the runtime workflows for each type of user role within the Stock Verify Application. The system defines three primary roles: **Staff**, **Supervisor**, and **Admin**. Workflows are derived from the explicit permission-based access control system (`backend/auth/permissions.py`) and available API endpoints.

## 1. Common Authentication Workflows (All Users)

All users regardless of role start with authentication workflows:

### A. First-Time Login & Setup
1. **Initial Login:** User logs in using their assigned `username` and `password` via `/api/auth/login`.
2. **PIN Setup (Optional but Recommended):** Once logged in, the user can set up a 4-digit PIN via `/api/auth/pin-setup` for faster subsequent logins (useful for shared devices).
3. **Password Management:** Users can change their password at any time via `/api/auth/change-password` by providing their current password.

### B. Daily Login Workflows
- **Standard Login:** User logs in with `username` and `password`.
- **Fast PIN Login:** Staff users can use the `/api/auth/login-pin` endpoint with their `username` and 4-digit `pin` to quickly authenticate during busy counting sessions.

### C. Password Reset Workflow
1. **Request Reset:** User submits their `username` or `phone_number` to `/api/auth/password-reset/request`.
2. **OTP Verification:** The system generates an OTP and sends it via WhatsApp (if a phone number is registered). The user submits the OTP to `/api/auth/password-reset/verify` to receive a short-lived reset token.
3. **Confirm Reset:** The user submits the reset token and their new password to `/api/auth/password-reset/confirm` to finalize the reset.

---

## 2. Staff Workflows

The **Staff** role is primarily focused on operational tasks: stock counting, basic item verification, and limited data export.

### A. Counting Stock (Session Workflow)
1. **Start Counting Session:** Staff creates a new counting session (`SESSION_CREATE`).
2. **View Assigned Sessions:** Staff reads their active sessions (`SESSION_READ`).
3. **Add Count Lines:** While physically counting stock, staff scans items and creates count lines (`COUNT_LINE_CREATE`) within their active session.
4. **Update Count Lines:** If a mistake is made, staff updates their own count lines (`COUNT_LINE_UPDATE`).
5. **Update MRP (Maximum Retail Price):** Staff can perform individual updates to an item's MRP if an update is needed (`MRP_UPDATE`).
6. **End Session:** Once counting for a section/rack is complete, the staff user updates and closes the session (`SESSION_UPDATE`, `SESSION_CLOSE`).

### B. Item Verification
1. **Search & Read Items:** Staff uses the application to search for specific items by code or barcode (`ITEM_SEARCH`) and read item details (`ITEM_READ`) to verify stock attributes against physical stock.

### C. Reviews & Exports
1. **Create Reviews/Comments:** Staff can create a review request (`REVIEW_CREATE`) or add comments (`REVIEW_COMMENT`) if they encounter a discrepancy that requires supervisor attention.
2. **Export Own Data:** Staff can export data related to their own counting sessions (`EXPORT_OWN`) for their personal records or basic reporting.

---

## 3. Supervisor Workflows

The **Supervisor** role includes all Staff permissions, plus elevated privileges for overseeing staff, managing bulk data, and resolving conflicts.

### A. Team Oversight & Session Management
1. **View All Sessions:** Supervisors can read all sessions across the warehouse, not just their own (`SESSION_READ_ALL`).
2. **Manage Staff Sessions:** Supervisors can update or forcefully delete staff sessions (`SESSION_UPDATE`, `SESSION_DELETE`) if a staff member forgot to close one or made a critical error.

### B. Count Line Approval & Rejection
1. **Review Counts:** Supervisors review count lines submitted by staff.
2. **Approve/Reject:** They can approve valid counts (`COUNT_LINE_APPROVE`) or reject invalid ones (`COUNT_LINE_REJECT`), which may require staff to recount.
3. **Delete Count Lines:** Supervisors have the authority to completely delete erroneous count lines (`COUNT_LINE_DELETE`).

### C. Bulk Operations & Sync Resolution
1. **Bulk MRP Updates:** Supervisors can perform bulk updates to item MRPs (`MRP_BULK_UPDATE`) saving time over individual updates.
2. **Trigger Data Sync:** Supervisors can manually trigger synchronizations between the operational database and the SQL Server ERP (`SYNC_TRIGGER`).
3. **Resolve Sync Conflicts:** If a conflict occurs during sync (e.g., local changes conflict with upstream ERP data), the supervisor is responsible for resolving it (`SYNC_RESOLVE_CONFLICT`).

### D. Advanced Reviews & Reporting
1. **Approve Reviews:** Supervisors can approve review requests submitted by staff (`REVIEW_APPROVE`).
2. **View Activity/Error Logs:** Supervisors have read access to system activity logs (`ACTIVITY_LOG_READ`) and error logs (`ERROR_LOG_READ`) for troubleshooting operational issues.
3. **Advanced Exporting:** Supervisors can export all system data (`EXPORT_ALL`) and schedule automated exports (`EXPORT_SCHEDULE`).
4. **View Analytics:** Supervisors have access to viewing standard reports (`REPORT_VIEW`), financial reports (`REPORT_FINANCIAL`), and analytics dashboards (`REPORT_ANALYTICS`).

---

## 4. Admin Workflows

The **Admin** role is the highest level of access and encompasses all Supervisor workflows plus full system management capabilities.

### A. User Management
1. **Create & Manage Users:** Admins can register new users, update user roles, assign custom permissions, disable specific permissions for individual users, or deactivate user accounts entirely (`USER_MANAGE`).

### B. System Configuration & Database Management
1. **Manage Settings:** Admins configure global system settings, such as variance thresholds and application configurations (`SETTINGS_MANAGE`).
2. **Manage Database Mapping:** Admins configure and manage how the operational MongoDB maps to the upstream SQL Server ERP (`DB_MAPPING_MANAGE`).

### C. Comprehensive Oversight
- Admins possess a superset of all permissions (the `*Permission` wildcard in the codebase). They can perform any action in the system, acting as the ultimate fallback for any workflow or technical requirement.