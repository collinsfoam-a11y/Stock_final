# Enterprise Frontend UI/UX Audit - 2026-05-18

Scope: Expo React Native frontend covering iOS, Android, tablet, web, PWA-adjacent offline behavior, dashboard responsiveness, scan workflows, operator fatigue, accessibility, and frontend architecture.

## Skill And Evidence Baseline

- Installed usable Codex skill folders:
  - `uxui-evaluator`, `interface-auditor`, `ai-interface-reviewer`, `flow-checker`, `vibe-coding-advisor`
  - `codex-design-ui`
  - `ui-ux-pro-max`, `design-system`, `design`, `ui-styling`
  - `find-skills`
  - `ax-audit`, `define-architecture`, `typography-audit`, `ui-animation`, `ui-audit`, `ui-design`, `ux-audit`
- OpenAI `skills` system skills are already present in this Codex install. Restart Codex to auto-discover the newly installed skills in future turns.
- `heilcheng/awesome-agent-skills` is an index/catalog, not a single installable `SKILL.md` folder. It was treated as a reference source, not installed as a local skill.
- Repo governance source: `docs/AGENT_UI_UX_RULES.md`.
- Frontend inventory: 59 route files, 12 staff routes, 15 supervisor routes, 19 admin routes, 13 public/auth routes, and 292 component/domain/screen files.
- Governance baseline before optimization: 405 files scanned, 991 P2 findings, 0 P0/P1 hard blockers, 0 unsafe navigation findings, 0 virtualization blockers.
- Governance after optimization: 406 files scanned, 982 P2 findings, 0 P0/P1 hard blockers, 0 unsafe navigation findings, 0 virtualization blockers.
- Reduced motion coverage improved from 20/73 animation files to 21/73. Accessibility advisories improved from 170 to 169. Token adoption advisories improved from 742 to 734.
- Validation run: `npm run typecheck`, `npm run lint`, `npm run governance:ui:changed:strict`, `npm run governance:ui:report:json`, `npm run governance:ui:health:json`.
- Web smoke evidence:
  - `reports/frontend-audit-home-smoke.png`
  - `reports/frontend-audit-admin-dashboard-smoke.png`
  - `reports/frontend-sync-banner-home-smoke.png`
  - `reports/frontend-sync-banner-admin-smoke.png`
  - `reports/frontend-sync-banner-staff-scan-smoke.png`
- Lint now completes without the previous scan hook dependency warnings.

## Executive Verdict

The frontend is operationally viable and has meaningful enterprise foundations: Expo Router role areas, offline stores, sync status surfaces, FlashList in most dense supervisor/admin lists, safe back navigation, dedicated scan components, and a repo governance scanner. It does not currently feel uniformly premium or industrial-grade because visual language, token adoption, and accessibility practices are uneven across route families.

No automated P0/P1 UI governance blockers were found. Manual audit flags the largest release risks as High, not Critical: scan-flow density, broad token debt, reduced-motion gaps, direct touchable drift, and role-dashboard data-density inconsistencies. These can be fixed incrementally without redesigning the backend or changing the stock contract.

## Global Architecture Findings

### Frontend Design System And Token Architecture

- Current Problems: The app has overlapping eras of UI primitives: `Modern*`, `App*`, `Premium*`, `GlassCard`, `ScreenContainer`, `ThemedScreen`, and legacy theme bridges. Governance reports 742 token/rhythm advisories and 32 quarantined legacy visual surfaces.
- Severity: High.
- Recommended Upgrade: Standardize new work on `useUiTokens`, `ScreenContainer`, `AppButton`, `AppCard`, `AppInput`, `StatusBadge`, `LoadingState`, `ErrorState`, `EmptyState`, `SyncIndicator`, and `ConfirmDialog`. Keep `Premium*`, `GlassCard`, `AuroraBackground`, `PatternBackground`, and gradient variants quarantined to non-operational surfaces.
- Better Alternatives: Use semantic status tokens (`success`, `warning`, `error`, `info`, `offline`, `pending`) and component-level tokens for buttons, cards, tabs, sheets, and scanner feedback.
- Unnecessary Elements: Decorative aurora, glass, pattern, particle, and gradient affordances are unnecessary for scan, count, variance, audit, and admin workflows.
- Visual Enhancements: Move dashboard and scan screens toward quiet surfaces, stronger information grouping, tabular numerals for counts, and consistent low-radius enterprise cards.
- Platform-Specific Improvements: iOS needs safe-area and sheet polish. Android needs lower shadow/blur usage. Web needs denser table and keyboard affordances. Tablet needs two-pane list/detail opportunities.
- Performance Optimizations: Reduce inline `StyleSheet.create` churn in hot components, remove decorative animated backgrounds from operational paths, and retire unbounded map rendering in dense surfaces.

### Navigation And Role Architecture

- Current Problems: Role areas are well separated, but labels and route naming vary: admin uses dashboards/control panels, supervisor uses sessions/variances/workflows, staff uses home/scan/item-detail. Some screen subtitles are generic rather than operational.
- Severity: Medium.
- Recommended Upgrade: Normalize route titles around role tasks: `Count`, `Review`, `Resolve`, `Configure`, `Audit`. Preserve safe back navigation everywhere.
- Better Alternatives: On tablet/web, use persistent side navigation for admin/supervisor and bottom navigation for staff only.
- Unnecessary Elements: Avoid redundant help/settings entries in both header and quick action surfaces when screen real estate is tight.
- Visual Enhancements: Make active nav state tokenized and text-labeled, not color-only.
- Platform-Specific Improvements: iOS should preserve swipe-back expectations; Android hardware back should keep session context; web should support focus order and keyboard tabbing across sidebars.
- Performance Optimizations: Keep sidebar group expansion state local and memoize route lists.

## Screen And Component Surface Audit

### Public/Auth Screens

Files: `app/welcome.tsx`, `app/index.tsx`, `app/login.tsx`, `app/register.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`, `app/otp-verification.tsx`, `app/security.tsx`, `app/help.tsx`, `app/notifications.tsx`.

- Current Problems: Auth and support routes have the most consumer-app styling risk: large visual treatments, decorative entry screens, direct spacing values, and inconsistent helper/error patterns.
- Severity: Medium.
- Recommended Upgrade: Use a compact enterprise-auth layout with visible labels, persistent validation, predictable keyboard behavior, and role-aware post-login destination copy.
- Better Alternatives: Replace ornamental welcome energy with product identity plus direct sign-in/register actions; use one auth form primitive.
- Unnecessary Elements: Decorative gradients or hero-heavy auth layouts add little to an inventory operations system.
- Visual Enhancements: Stronger field grouping, consistent error copy, and smaller brand header treatment on mobile.
- Platform-Specific Improvements: iOS keyboard should not obscure submit actions; Android should use correct input keyboards; web should expose keyboard focus and password manager-friendly fields.
- Performance Optimizations: Lazy load non-critical brand imagery and keep auth screens free of heavy animation.

### Staff Home And Session Creation

Files: `src/screens/staff/StaffHomeScreen.tsx`, `app/staff/home.tsx`, `app/staff/index.tsx`.

- Current Problems: Active/history sessions render in a `ScrollView` via `.map`; page size is currently 20, so this is not a blocker, but it limits future density. The start-session modal requires sequential location/floor/rack selection but does not show a compact final preview before start.
- Severity: High.
- Recommended Upgrade: Keep current workload and sync status visible, add a final "Location / floor / rack" confirmation line, and virtualize session cards if the page grows beyond 20.
- Better Alternatives: Use a split "Resume current" and "Start new" hierarchy, with only one primary CTA in thumb reach.
- Unnecessary Elements: Session cards should avoid extra decorative icons if status, location, count, and issue state already communicate the task.
- Visual Enhancements: Use status badges for `OPEN`, `ACTIVE`, `CLOSED`, and issue states; make numbers tabular.
- Platform-Specific Improvements: Put create-session submit above the iOS home indicator; ensure Android back closes modal before exiting app; tablet can show active and history side by side.
- Performance Optimizations: Memoize session card callbacks and move session rendering to FlashList if pagination expands.

### Staff Scan Rack Screen

Files: `app/staff/scan.screen.tsx`, `src/components/scan/ScanLookupPanel.tsx`, `src/components/scan/ScanStatsCard.tsx`, `src/components/scan/ScanCameraOverlay.tsx`.

- Current Problems: Scan context is good, but search results previously rendered all inline rows in the scroll surface. Slow searches could create heavy render bursts during a high-frequency scan workflow.
- Severity: High.
- Recommended Upgrade: Limit inline search results, show a narrowing prompt, keep scan/local-save/sync feedback visible, and make scan acknowledgment immediate.
- Better Alternatives: For larger result sets, use a bottom sheet with FlashList and sticky search input.
- Unnecessary Elements: Avoid verbose recent-item lists and decorative scan overlays that compete with the actual scan frame.
- Visual Enhancements: Use a stronger "ready to scan" state, immediate valid/duplicate/invalid labels, and a persistent rack/session chip.
- Platform-Specific Improvements: iOS camera permission should keep manual entry active; Android should minimize overlay opacity and haptic load on low-end devices; web should clearly indicate camera fallback.
- Performance Optimizations: Implemented an inline cap in `ScanLookupPanel` and a visible "showing first N" prompt. Next step: profile scan loop and avoid API-triggered UI blocking.

### Staff Item Detail And Count Entry

Files: `app/staff/item-detail.screen.tsx`, `src/components/scan/CountQuantitySection.tsx`, `ItemSummarySection.tsx`, `BatchVariantsSection.tsx`, `SerializedItemSection.tsx`, `ItemSubmitBar.tsx`, `EvidenceNotesSection.tsx`, `ItemDateFieldsSection.tsx`, `ItemMrpSection.tsx`.

- Current Problems: The screen has strong operational structure but many sections compete vertically. Count entry, batch variants, serial tracking, dates, price, evidence, and notes can overwhelm a fatigued operator.
- Severity: High.
- Recommended Upgrade: Treat `Count Quantity` as the dominant action, collapse low-frequency sections behind explicit accordions, and keep item/rack/session context sticky.
- Better Alternatives: Use a stepper model: Identify -> Count -> Exceptions -> Save, while preserving direct access for power users.
- Unnecessary Elements: Workflow strip text can become redundant once the user is inside a repeated scan loop.
- Visual Enhancements: Increase visual separation between required count inputs and optional evidence/metadata sections; use tabular figures for stock and quantity.
- Platform-Specific Improvements: iOS keyboard avoiding should keep `Save & Verify` visible; Android decimal/number keyboards must match UOM rules; tablet should show item summary left and count/exceptions right.
- Performance Optimizations: Defer expensive batch/variant sections until the first interaction completes; memoize derived batch/serial summaries.

### Serial Scanner

Files: `app/staff/serial-scanner.tsx`, `src/components/modals/SerialScannerModal.tsx`, `src/scanner/useScanGate.ts`, `src/scanner/serialScanRules.ts`.

- Current Problems: Mode chips and manual entry are clear, but the full-screen serial scanner lacks low-light controls, explicit duplicate disposition copy, and a persistent session/item identity strip.
- Severity: High.
- Recommended Upgrade: Add camera torch/brightness affordance where available, show last accepted serial with timestamp, and explain duplicate handling as "already scanned for this item".
- Better Alternatives: Use an operator-focused "Scan next serial" loop with an always-visible manual fallback and recent accepted serial tray.
- Unnecessary Elements: Long comma-separated serial previews are less useful than a compact last-6 list with removable chips.
- Visual Enhancements: Larger mode chips, stronger active state, and non-color state icons.
- Platform-Specific Improvements: iOS should feel like a native scanner sheet; Android should avoid heavy overlays and respect hardware back; web should default to manual entry if camera APIs are unavailable.
- Performance Optimizations: Keep `useScanGate` throttling, avoid `Alert` spam in repeated scan errors, and use non-blocking toast feedback for duplicates.

### Staff History, Settings, Appearance

Files: `app/staff/history.tsx`, `app/staff/settings.tsx`, `app/staff/appearance.tsx`, `src/components/settings/*`.

- Current Problems: History uses FlashList, which is good. Settings and appearance still allow visual-system choices that can conflict with operational consistency.
- Severity: Medium.
- Recommended Upgrade: Make settings operational: scanner sound, haptics, font size, offline mode, sync visibility, and account security first.
- Better Alternatives: Split preference settings from visual demo surfaces.
- Unnecessary Elements: Decorative appearance options should not leak into operational screens.
- Visual Enhancements: Use grouped settings rows with status, helper copy, and clear toggles.
- Platform-Specific Improvements: iOS switches and Android switches should match platform expectations; web should support keyboard navigation through settings.
- Performance Optimizations: Keep settings local and avoid broad theme re-render storms.

### Supervisor Dashboard

Files: `app/supervisor/dashboard.tsx`, `src/components/supervisor/dashboard/*`.

- Current Problems: Dashboard has good triage intent, but recommended actions, stats, recent sessions, activity, and speed dial can create duplicated action surfaces.
- Severity: High.
- Recommended Upgrade: Prioritize exception states first: sync failures, high-risk sessions, overdue recounts, stuck sessions, then ordinary throughput.
- Better Alternatives: On desktop/tablet, use a two-column dashboard with exception queue and live session list; on mobile, one primary action and one exception module above the fold.
- Unnecessary Elements: Speed dial duplicates actions already in overview; keep it only for compact mobile if data proves it speeds work.
- Visual Enhancements: Stronger hierarchy for "needs action" versus "informational".
- Platform-Specific Improvements: Android thumb reach for speed dial is good, but avoid crowding near gesture nav; tablet should expose persistent navigation.
- Performance Optimizations: Replace `getSessions(1, 100)` dashboard aggregation with a dashboard summary endpoint or cached query if data grows.

### Supervisor Sessions List

Files: `app/supervisor/sessions.tsx`.

- Current Problems: FlashList and offline notice are good. Row entrance animation uses index-based delay, which can feel slow on large paginated lists.
- Severity: Medium.
- Recommended Upgrade: Cap or remove staggered row animations on dense operational lists.
- Better Alternatives: Use static rows with press feedback only; reserve animation for state transitions.
- Unnecessary Elements: Excess row animation in session history.
- Visual Enhancements: Add tighter filters for status, warehouse, staff, and variance.
- Platform-Specific Improvements: Android low-end devices benefit from no row stagger; web needs keyboard sorting/filtering.
- Performance Optimizations: Keep FlashList, stable row keys, fixed estimated item size, and avoid animation delay proportional to index.

### Supervisor Session Detail, Review, Recount

Files: `src/screens/supervisor/SessionDetailScreen.tsx`, `src/components/supervisor/RecountAssignmentModal.tsx`.

- Current Problems: Critical controls exist and offline gating is explicit. Approval/reject/verify actions are dense inside each line card and need stronger final-action confirmation semantics.
- Severity: High.
- Recommended Upgrade: Separate approve, reject/recount, verify, and unverify into visually distinct actions with confirmation only for final or destructive outcomes.
- Better Alternatives: Use a bottom action sheet for selected line actions on mobile; use inline action columns on tablet/web.
- Unnecessary Elements: Repeated large line cards reduce scanning speed for supervisors reviewing many lines.
- Visual Enhancements: Show variance amount and reason as the row's primary signal; use semantic badges plus icons.
- Platform-Specific Improvements: iOS modals should preserve focus and return to the selected row; Android back should close modal first; web should support keyboard row navigation.
- Performance Optimizations: FlashList is present. Memoize line rows and avoid recalculating dates/status tone inside render when lists grow.

### Variance, Offline Queue, Sync Conflict, Activity, Workflow Screens

Files: `app/supervisor/variances.tsx`, `variance-details.tsx`, `offline-queue.tsx`, `sync-conflicts.tsx`, `activity-logs.tsx`, `user-workflows.tsx`, `bulk-ops.tsx`.

- Current Problems: FlashList appears in the densest list screens, but governance still reports token and touch advisories. Variance and sync states need consistent non-color cues.
- Severity: High.
- Recommended Upgrade: Build a shared exception-list row primitive for variance, offline queue, sync conflicts, and activity logs.
- Better Alternatives: Use sectioned queues by severity: blocked, failed sync, needs recount, pending, resolved.
- Unnecessary Elements: Avoid general dashboard cards for exception queues; rows need dense operational details.
- Visual Enhancements: Add reason chips, timestamps, retry status, owner, and next action in fixed positions.
- Platform-Specific Improvements: Tablet should show queue and detail side by side; web should support filters and keyboard shortcuts; Android should keep row touch targets 48dp.
- Performance Optimizations: Keep virtualized lists, add stable callbacks, and avoid expensive formatting inside row render.

### Admin Dashboard Web

Files: `app/admin/dashboard-web.screen.tsx`, `src/components/admin/dashboard/*`.

- Current Problems: This is the broadest admin surface and carries the most token debt through `dashboardWebShared.ts`. Some actions had incomplete a11y and animations did not consistently respect reduced motion.
- Severity: High.
- Recommended Upgrade: Keep the dashboard quiet and operations-first: system health, service controls, critical issues, reports, analytics. Add explicit live/offline state and make service actions auditable.
- Better Alternatives: Use a dense admin shell with a persistent left nav and tab panels that retain state.
- Unnecessary Elements: Repeated admin tool cards can be noisy when side navigation already exists.
- Visual Enhancements: Make "critical issues" visually prominent without relying only on warning color.
- Platform-Specific Improvements: Web should support keyboard tab focus, visible focus rings, and table-like data density; tablet should use the same shell scaled down.
- Performance Optimizations: Implemented reduced-motion handling in dashboard panels and added missing labels for dashboard tabs/tools/report generation/auto-fix controls. Next step: tokenize `dashboardWebShared.ts`.

### Admin Realtime Dashboard And Live View

Files: `app/admin/realtime-dashboard.screen.tsx`, `src/components/admin/realtime-dashboard/*`, `app/admin/live-view.tsx`.

- Current Problems: `RealtimeDashboardTable` is one of the better dense-data implementations: horizontal scroll plus FlatList with fixed row layout. The wider live/realtime surfaces still need clear sync freshness and conflict status.
- Severity: Medium.
- Recommended Upgrade: Add last refresh, stale data, backend connection, and failed refresh states near the toolbar.
- Better Alternatives: Use column presets by role: operator health, variance audit, stock movement, sync risk.
- Unnecessary Elements: Avoid too many visible columns by default on mobile.
- Visual Enhancements: Sticky header, stronger sorted-column state, and row status icons.
- Platform-Specific Improvements: Web needs keyboard sort/focus; tablet landscape should expose more columns; mobile should use row cards instead of wide table.
- Performance Optimizations: Keep fixed row height, memoized rows, and `getItemLayout`.

### Admin Users, Permissions, Security, Logs, Reports, SQL Config

Files: `app/admin/users.tsx`, `users.screen.tsx`, `permissions.tsx`, `security.tsx`, `logs.tsx`, `reports.tsx`, `sql-config.tsx`, `settings.tsx`, `unknown-items.tsx`, `metrics.tsx`, `control-panel*.tsx`.

- Current Problems: These admin screens mix forms, dense tables, toggles, security actions, logs, and reports with inconsistent spacing and direct touchable patterns.
- Severity: High.
- Recommended Upgrade: Define admin primitives for filters, table toolbar, status row, destructive confirmation, and report generation.
- Better Alternatives: Use one admin table pattern with filters, pagination, sorting, empty/error/loading states, and export actions.
- Unnecessary Elements: Avoid duplicated control panel variants unless one is explicitly deprecated.
- Visual Enhancements: Use compact enterprise density, left-aligned labels, clear destructive button styling, and persistent unsaved-change state.
- Platform-Specific Improvements: Web should be the first-class admin platform; mobile admin should be read/triage-first, not full configuration-heavy.
- Performance Optimizations: Virtualize logs/users/reports when row count can exceed a page; memoize filters and table rows.

### Shared Navigation And Layout Components

Files: `src/components/navigation/*`, `src/components/layout/*`, `src/components/ui/ScreenContainer.tsx`, `ThemedScreen.tsx`, `ModernHeader.tsx`, `ScreenHeader.tsx`.

- Current Problems: Multiple layout/header systems exist. `ScreenContainer` can still render decorative backgrounds, although operational callers mostly use solid backgrounds.
- Severity: High.
- Recommended Upgrade: Make solid operational surfaces the default and require explicit exception comments for pattern/aurora backgrounds.
- Better Alternatives: One role-aware app shell each for staff, supervisor, admin; one shared header API.
- Unnecessary Elements: Decorative background props and duplicate header variants.
- Visual Enhancements: Consistent header height, status area, back behavior, and right-action labeling.
- Platform-Specific Improvements: Respect safe areas for headers and bottom bars; Android hardware back should route through safe navigation; web should have landmark-like structure.
- Performance Optimizations: Avoid re-rendering whole screens from layout-level animation or theme effects.

### Feedback, Offline, Sync, Toast, Error Components

Files: `src/components/feedback/*`, `src/components/SyncStatusBar.tsx`, `src/components/ui/SyncStatusPill.tsx`, `SyncIndicator.tsx`, `InlineAlert.tsx`, `ErrorState.tsx`, `LoadingState.tsx`, `EmptyState.tsx`.

- Current Problems: Offline and sync components exist, but usage is not uniformly present across every operational screen. Some generic failures remain in local code.
- Severity: High.
- Recommended Upgrade: Every count/recount/review/admin control screen should show online/offline, pending sync, failed sync, last sync, and retry where relevant.
- Better Alternatives: One `OperationalSyncBanner` for scan/count/review surfaces and one compact `SyncStatusPill` for headers.
- Unnecessary Elements: Blocking modals for background sync failures; use inline recoverable states.
- Visual Enhancements: Add icon, label, count, timestamp, and action in a fixed order.
- Platform-Specific Improvements: Screen readers should announce sync failures; Android toasts should not replace persistent failed-sync state; web should expose retry buttons.
- Performance Optimizations: Poll sync status outside heavy screen trees and memoize status props.

### Tables, Charts, And Data Visualization

Files: `src/components/DataTable.tsx`, `src/components/charts/*`, `src/components/admin/realtime-dashboard/RealtimeDashboardTable.tsx`, dashboard panels.

- Current Problems: Realtime table is stronger than generic `DataTable`. Generic `DataTable` is unused and has a hybrid ScrollView/FlashList setup with vertical scrolling disabled, making it risky if reused for large data.
- Severity: Medium.
- Recommended Upgrade: Deprecate or refactor generic `DataTable` before production reuse; make realtime table the reference pattern.
- Better Alternatives: Use FlashList/FlatList vertically, horizontal scroll only for columns, fixed row heights, accessible sort buttons, and row status text.
- Unnecessary Elements: Decorative charts where an exception table would drive action faster.
- Visual Enhancements: Add legends, units, and accessible labels to charts; do not rely on color alone.
- Platform-Specific Improvements: Web dashboards need keyboard sorting and focus. Mobile should prefer card lists over wide tables.
- Performance Optimizations: Keep data derivation in `useMemo`, avoid SVG/chart recalculation per render, and virtualize all dense rows.

### Forms, Modals, And Settings Components

Files: `src/components/forms/*`, `src/components/modals/*`, `src/components/settings/*`, `src/components/admin/users/UserFormModal.tsx`, `CreateSessionModal.tsx`.

- Current Problems: Form primitives exist, but feature-local modals still use direct `TouchableOpacity` and raw modal overlay styling in places.
- Severity: Medium.
- Recommended Upgrade: Route new forms through shared input/button/modal primitives and require visible labels, inline errors, loading/disabled states, and keyboard-safe footers.
- Better Alternatives: Use one modal shell with title, body, footer, close control, focus restoration, and reduced-motion entry.
- Unnecessary Elements: Feature-local close buttons and ad hoc overlay colors.
- Visual Enhancements: Consistent label weight, helper/error placement, and destructive confirmation styling.
- Platform-Specific Improvements: iOS sheets need correct presentation style; Android keyboard resize must keep submit visible; web modals need focus trap and Escape close.
- Performance Optimizations: Avoid rebuilding validation schemas and option lists during every render.

### Shared Scan Component Family

Files: `src/components/scan/*`, `src/domains/inventory/hooks/scan/*`, `src/services/scanDeduplicationService.ts`, `src/services/scanSoundService.ts`, `src/services/hapticService.ts`.

- Current Problems: The scan system has the right pieces: scan gate, dedupe, haptics, manual fallback, batch/serial support. The issue is operational density and inconsistent placement of ready/saved/pending/error state across components.
- Severity: High.
- Recommended Upgrade: Define a scanner state contract: ready, scanning, found, duplicate, invalid, saved-local, pending-sync, failed-sync, conflict.
- Better Alternatives: One scan feedback component used by camera overlay, manual lookup, serial scanner, and item submit.
- Unnecessary Elements: Repeated local alert copy; move to reusable operational messages.
- Visual Enhancements: Distinct scan feedback with text, icon, and haptic/audio mapping; no color-only status.
- Platform-Specific Improvements: iOS haptics should be subtle; Android haptics should respect settings and low-end devices; web should not promise haptics/camera parity.
- Performance Optimizations: Keep scan loop input responsive by acknowledging locally before network work; keep heavy item detail rendering outside scanner overlay.

## Implemented Optimization In This Pass

- `src/components/scan/ScanLookupPanel.tsx`
  - Added an inline cap for search results (`MAX_INLINE_SEARCH_RESULTS = 8`).
  - Added a visible narrowing prompt when results exceed the inline cap.
  - This reduces render bursts in the scan screen while preserving the operator path: keep typing or scan directly.
- `src/components/admin/dashboard/DashboardPanels.tsx`
  - Dashboard tabs now expose tablist/tab roles and selected state.
  - Admin tool cards, report generation, and auto-fix actions now expose accessible labels/hints.
  - Dashboard panels now respect reduced motion instead of always running `FadeInDown`.
- `src/components/feedback/OperationalSyncBanner.tsx`
  - Added a token-based operational sync/offline banner with semantic tone, non-color state labels, pending-count metadata, accessible action support, and minimum touch targets.
  - Reused it in staff scan, item detail, supervisor sessions, supervisor session detail, admin dashboard, and the older network status banner.
  - This turns repeated local offline cards into one reusable operational primitive.
- `src/domains/inventory/hooks/scan/useDeferredItemSubmission.ts`
  - Removed a stale dependency from the validation callback.
- `src/domains/inventory/hooks/scan/useItemDetailData.ts`
  - Added the missing barcode dependency to batch-variant loading, preventing stale fallback searches when the scanned item changes.
- `app/supervisor/sessions.tsx`
  - Capped row entrance stagger to the first few rows so long paginated lists do not accumulate delayed animations.

## Prioritized Roadmap

1. High: Extend `OperationalSyncBanner` to variance, offline queue, sync conflicts, recount assignment, and remaining admin control screens.
2. High: Tokenize `dashboardWebShared.ts`, staff home styles, scan component styles, and admin table controls to reduce the 734 spacing/radius advisories.
3. High: Define one `OperationalListRow` primitive for variance, sessions, logs, sync conflicts, and offline queue rows.
4. High: Establish scanner feedback states for valid, duplicate, invalid, saved local, pending sync, failed sync, and conflict.
5. Medium: Cap or remove staggered list animations on dense operational lists.
6. Medium: Refactor or deprecate unused generic `DataTable` before it is used in production.
7. Medium: Expand screen-reader test coverage for admin tabs, scan search, item submit, serial scanner, and recount modal.
8. Medium: Add tablet two-pane layouts for session review and admin realtime dashboards.
9. Low: Retire quarantined visual systems after all production imports are gone for a stable release cycle.

## Validation Notes And Limits

- Static, lint, TypeScript, governance, and headless web smoke validation passed.
- The protected admin and staff routes stopped at authentication checks during smoke testing because no authenticated browser session was provided.
- The in-app Playwright browser plugin could not run because the local Chrome Playwright extension is missing; CLI Playwright screenshots were used instead.
- Full native iOS/Android device validation was not run in this pass, so native claims remain code-inferred.
- No database, deployment, migration, or external persistent system actions were run.
- The worktree already contained many modified frontend and backend files before this pass. This pass touched only the frontend UI/sync files named above, refreshed the governance report, and generated smoke screenshots.
