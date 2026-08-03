# UI/UX Screen Audit Matrix

This matrix evaluates every screen component across the application against 7 key operational dimensions: UI Consistency, User Experience, Layout Alignment, Accessibility, Runtime Performance, Responsive Behaviour, and Error Handling.

---

## Screen Evaluation Scale
- **Pass**: Fully compliant with design tokens and operational criteria.
- **Minor issue**: Cosmetic inconsistency or minor token deviation.
- **Major issue**: Usability friction, missing accessibility label, or layout shift.
- **Critical issue**: Screen broken, missing module import, or complete workflow failure.
- **Not assessed**: Route unreferenced or dead file.

---

## 1. Screen Audit Matrix

| Screen File Path | UI | UX | Alignment | Accessibility | Performance | Responsive | Error Handling | Overall Status |
|---|---|---|---|---|---|---|---|---|
| `app/index.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/login.tsx` | Major issue | Major issue | Minor issue | Minor issue | Pass | Pass | Pass | **Major issue** *(Duplicate file)* |
| `app/improved-login.tsx` | Pass | Pass | Pass | Minor issue | Pass | Pass | Pass | **Pass** |
| `app/welcome.tsx` | Major issue | Major issue | Major issue | Major issue | Pass | Pass | Minor issue | **Major issue** *(Obsolete stub)* |
| `app/improved-welcome.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/forgot-password.tsx` | Minor issue | Pass | Minor issue | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/reset-password.tsx` | Minor issue | Pass | Minor issue | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/otp-verification.tsx` | Minor issue | Pass | Minor issue | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/register.tsx` | Minor issue | Pass | Minor issue | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/notifications.tsx` | Major issue | Minor issue | Minor issue | Minor issue | Pass | Pass | Pass | **Major issue** |
| `app/help.tsx` | Major issue | Major issue | Major issue | Minor issue | Pass | Pass | Pass | **Major issue** *(Obsolete version)* |
| `app/improved-help.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/security.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/debug.tsx` | Minor issue | Minor issue | Minor issue | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/staff/home.tsx` | Major issue | Major issue | Major issue | Major issue | Pass | Pass | Major issue | **Major issue** *(Obsolete stub)* |
| `app/staff/improved-home.tsx` | Pass | Pass | Pass | Minor issue | Pass | Pass | Pass | **Pass** |
| `app/staff/scan.tsx` | Major issue | Major issue | Major issue | Minor issue | Pass | Pass | Minor issue | **Major issue** *(Legacy version)* |
| `app/staff/improved-scan.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/staff/item-detail.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/staff/history.tsx` | Major issue | Minor issue | Minor issue | Minor issue | Pass | Pass | Pass | **Major issue** |
| `app/staff/settings.tsx` | Critical issue | Critical issue | Major issue | Major issue | Pass | Pass | Critical issue | **Critical issue** *(Imports missing logoutService)* |
| `app/staff/improved-settings.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/dashboard.tsx` | Major issue | Major issue | Major issue | Minor issue | Pass | Pass | Pass | **Major issue** *(Legacy version)* |
| `app/supervisor/improved-dashboard.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/sessions.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/approval-queue.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/supervisor/variances.tsx` | Major issue | Pass | Minor issue | Minor issue | Major issue | Pass | Pass | **Major issue** *(Monolith list)* |
| `app/supervisor/variance-details.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/sync-conflicts.tsx` | Major issue | Major issue | Minor issue | Minor issue | Pass | Pass | Major issue | **Major issue** *(Business logic in UI)* |
| `app/supervisor/offline-queue.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/supervisor/recount-request.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/observation-detail.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/items.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/activity-logs.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/user-workflows.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/supervisor/settings.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/admin/dashboard-web.tsx` | Minor issue | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/admin/realtime-dashboard.tsx` | Pass | Pass | Pass | Pass | Pass | Pass | Pass | **Pass** |
| `app/admin/users.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/admin/permissions.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/admin/sql-config.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/admin/unknown-items.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/admin/security.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |
| `app/admin/logs.tsx` | Minor issue | Pass | Pass | Minor issue | Pass | Pass | Pass | **Minor issue** |

---

## 2. Key Screen Audit Observations

### A. Critical Route Duplications & Routing Conflicts
1. **`app/staff/settings.tsx`**: Contains an active import of missing module `../../src/components/auth/UniversalLogout`, which in turn imports non-existent `LogoutService`. Renders the entire settings screen broken in Web export builds.
2. **Parallel `improved-*.tsx` Screens**: Expo Router automatically exposes every file in `app/` as a valid URL endpoint. The coexistence of `home.tsx` and `improved-home.tsx`, `scan.tsx` and `improved-scan.tsx`, `settings.tsx` and `improved-settings.tsx` results in 7 sets of duplicate routes.
3. **Patch file in routing directory**: `app/staff/item-detail.tsx.patch` is stored inside the Expo Router directory tree.

### B. UI/UX Consistency Highlights
- Screens upgraded under the `improved-*` prefix use `ModernHeader`, `ModernCard`, `AppTouchable`, and `useUiTokens()` correctly.
- Un-upgraded screens (e.g. `app/notifications.tsx`, `app/staff/history.tsx`) use inline `StyleSheet.create` with hardcoded pixel padding (`padding: 14`), arbitrary border radii (`borderRadius: 24`), and hardcoded hex colors.
