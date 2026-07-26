# Admin/Supervisor Feature Review (2026-03-21)

## Goal
Reduce role-surface clutter for Admin and Supervisor, keep core warehouse operations visible, and deprioritize low-usage or duplicate screens from default navigation.

## Current Role Intent
| Role | Primary Use |
| :--- | :--- |
| Supervisor | Run daily operations: monitor sessions, resolve variances, unblock operators, keep sync healthy. |
| Admin | Govern system stability and access: monitor health, manage users/permissions, maintain integration and logs. |

## Recreated Role Surfaces
### Supervisor (default navigation)
- Dashboard
- Sessions
- Variances
- User Workflows
- Activity Logs
- Offline Queue
- Sync Conflicts
- Settings

### Admin (default navigation)
- Dashboard
- Sessions
- Variances
- User Workflows
- Offline Queue
- Sync Conflicts
- Users
- Permissions
- Security
- Real-Time Dashboard
- Unknown Items
- SQL Config
- System Logs
- Settings

## Removed From Default Navigation
These routes still exist but were removed from default role navigation to reduce noise:

- Supervisor: `export-schedules`, `export-results`, `db-mapping`, `error-logs`, `notes`.
- Admin: `ai-assistant`, export screens, notes, DB mapping, duplicated monitoring links that were already covered by dashboard tabs.

## In-App Recommendations Added
### Supervisor Dashboard
- Added a “Recommended next steps” card with action priorities based on:
  - high-risk sessions,
  - open sessions,
  - low completion percentage,
  - sync conflict hygiene.

### Admin Dashboard
- Added dynamic recommended tools at top of admin tool grid:
  - resolve critical issues,
  - stabilize service health,
  - review variance queue.
  - open help guide.

## Client-Ready UX Copy Pass
- Replaced technical labels with plain-language terms in sidebars and quick actions.
- Examples:
  - `Variances` -> `Count Differences`
  - `User Workflows` -> `Team Activity`
  - `Offline Queue` -> `Pending Uploads`
  - `Sync Conflicts` -> `Sync Issues`
  - `SQL Config` -> `ERP Connection`
  - `System Logs` -> `System History`
- Updated dashboard subtitles to focus on simple daily actions.

## Feature-Flag Enforcement Added
- Added centralized role feature flags:
  - `frontend/src/constants/roleFeatureFlags.ts`
- Added route-level gating in layouts:
  - Admin disabled routes redirect to `/admin/dashboard-web`.
  - Supervisor/Admin access to disabled supervisor routes redirects to `/supervisor/dashboard`.

## Hard Deletion Applied
- Removed route files from the Expo router tree:
  - `frontend/app/admin/ai-assistant.tsx`
  - `frontend/app/supervisor/db-mapping.tsx`
  - `frontend/app/supervisor/error-logs.tsx`
  - `frontend/app/supervisor/export.tsx`
  - `frontend/app/supervisor/export-results.tsx`
  - `frontend/app/supervisor/export-schedules.tsx`
  - `frontend/app/supervisor/notes.tsx`
  - `frontend/app/supervisor/watchtower.tsx`

## Recommended Next Iterations
1. Add role-based feature flags for advanced screens instead of hard-coded hiding.
2. Add telemetry for route usage and decision logs to validate what is actually “unwanted”.
3. Split supervisor “operations” and “diagnostics” modes, so diagnostics tools are enabled only when needed.
