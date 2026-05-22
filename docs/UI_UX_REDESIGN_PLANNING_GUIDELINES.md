# Code-Derived UI/UX Redesign Planning Guidelines

Generated on 2026-05-19 by inspecting the current frontend code. This guide
intentionally uses live implementation as the evidence source, not older design
documents.

## Why This Guide Exists

The current app is an Expo and React Native operational stock verification
tool. Its UI is not a generic dashboard or marketing surface. The redesign must
protect fast stock counting, offline work, variance review, sync conflict
resolution, admin control, and role-gated navigation.

The code already contains a strong operational UI direction, but adoption is
mixed. Supervisor queues and admin logs use newer operational primitives.
Staff scan flows use specialized scan components. Several admin and settings
screens still use older `Modern*`, legacy token bridges, and custom card or form
layouts. A good redesign should consolidate around the newer primitives without
breaking the stock verification workflow.

## Code Areas Inspected

Use these files as the current implementation baseline when planning redesign
work:

| Area                       | Current code inspected                                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App stack                  | `frontend/package.json`                                                                                                                                                                                                                                                                 |
| Route shells               | `frontend/app/_layout.tsx`, `frontend/app/staff/_layout.tsx`, `frontend/app/supervisor/_layout.tsx`, `frontend/app/admin/_layout.tsx`                                                                                                                                                   |
| Staff workflows            | `frontend/src/screens/staff/StaffHomeScreen.tsx`, `frontend/app/staff/scan.screen.tsx`, `frontend/app/staff/item-detail.screen.tsx`, `frontend/app/staff/serial-scanner.tsx`                                                                                                            |
| Scan components            | `frontend/src/components/scan/*`, `frontend/src/components/feedback/ScannerFeedbackState.tsx`                                                                                                                                                                                           |
| Scan domain hooks          | `frontend/src/domains/inventory/hooks/scan/*`                                                                                                                                                                                                                                           |
| Supervisor workflows       | `frontend/app/supervisor/sessions.tsx`, `frontend/app/supervisor/variances.tsx`, `frontend/app/supervisor/sync-conflicts.tsx`, `frontend/app/supervisor/offline-queue.tsx`, `frontend/src/screens/supervisor/SessionDetailScreen.tsx`                                                   |
| Admin workflows            | `frontend/app/admin/dashboard-web.screen.tsx`, `frontend/app/admin/logs.tsx`, `frontend/app/admin/users.screen.tsx`, `frontend/app/admin/settings.tsx`, `frontend/app/admin/sql-config.tsx`, `frontend/app/admin/unknown-items.tsx`, `frontend/app/admin/realtime-dashboard.screen.tsx` |
| Admin components           | `frontend/src/components/admin/users/*`, `frontend/src/components/admin/dashboard/*`, `frontend/src/components/admin/realtime-dashboard/*`                                                                                                                                              |
| Navigation                 | `frontend/src/components/navigation/AdminSidebar.tsx`, `frontend/src/components/navigation/SupervisorSidebar.tsx`, `frontend/src/components/navigation/adminNavShared.ts`                                                                                                               |
| UI primitives              | `frontend/src/components/ui/AppButton.tsx`, `AppCard.tsx`, `AppInput.tsx`, `ScreenContainer.tsx`, `OperationalListRow.tsx`, `OperationalListSection.tsx`, `OperationalSplitView.tsx`, `OperationalCommandBar.tsx`                                                                       |
| Feedback and offline state | `frontend/src/components/feedback/OperationalSyncBanner.tsx`, `frontend/src/components/feedback/ScannerFeedbackState.tsx`                                                                                                                                                               |
| Tokens and helpers         | `frontend/src/hooks/useUiTokens.ts`, `frontend/src/theme/themeTokens.ts`, `frontend/src/theme/unified/*`, `frontend/src/utils/accessibility.ts`, `frontend/src/utils/motion.ts`                                                                                                         |
| Governance code            | `frontend/scripts/check-ui-governance.cjs`, `frontend/src/components/ui/legacyVisualSystem.ts`                                                                                                                                                                                          |

## Current UI Architecture

The app runs on Expo `~55`, React `19`, React Native `0.83`, Expo Router, and
React Native Web. UI code must work on handheld devices, tablets, and web.
Important libraries already present include:

- `@shopify/flash-list` for large lists.
- `@tanstack/react-query` for server state.
- `zustand` for local state.
- `react-hook-form` and `zod` for form patterns.
- `expo-camera` and `expo-haptics` for scanner workflows.
- `react-native-reanimated` for motion.
- `react-native-safe-area-context` for safe areas.
- `@expo/vector-icons` for iconography.

The route model is role-based:

- Public/auth routes: welcome, login, register, password reset, OTP,
  notifications, help, security.
- Staff routes: home, scan, item detail, serial scanner, history, settings,
  appearance.
- Supervisor routes: dashboard, sessions, session detail, variances, variance
  detail, sync conflicts, offline queue, items, bulk ops, activity logs,
  user workflows, settings.
- Admin routes: dashboard, logs, metrics, reports, permissions, security, SQL
  config, unknown items, users, realtime dashboard, settings.

The active route shells are the files under `frontend/app/**/_layout.tsx`.
Do not redesign around older wrapper layouts without first checking whether
they are still used.

## Redesign Direction

The current code points to a functional mobile utility style:

- Fast first action on staff devices.
- Dense, scannable rows for supervisor and admin queues.
- Solid semantic surfaces for operational screens.
- Blue as the primary action color, with success, warning, error, and info
  tones for status.
- Low decoration, stable spacing, clear hierarchy, and consistent icon usage.
- Split list-detail layouts on tablet and web where queue review matters.
- Explicit offline, sync, permission, and failure states.

The redesign should not turn operational screens into hero pages, glass panels,
gradient showcases, or decorative dashboards. The product value is speed,
clarity, auditability, and confidence during stock verification.

## Design System State Found In Code

The current design system is partly consolidated and partly transitional.

### Prefer These Primitives

Use these as the default for new redesign work:

- `ScreenContainer` for screen shell, safe area, loading, refresh, solid
  background, keyboard dismissal, and headers.
- `AppButton`, `AppCard`, and `AppInput` for new generic feature UI.
- `OperationalListRow` for dense queue, audit, variance, session, sync, and
  admin rows.
- `OperationalListSection` for grouped operational lists.
- `OperationalSplitView` for tablet and web list-detail experiences.
- `OperationalCommandBar` for approval, refresh, export, resolve, reject,
  and retry commands.
- `ScannerFeedbackState` for scan status, duplicate, offline, invalid,
  blocked, queued, and success feedback.
- `OperationalSyncBanner` for ready, info, offline, pending, syncing,
  warning, and failed sync states.
- `AnimatedPressable` only when it is paired with accessibility props and
  minimum touch target styles.

### Treat These As Migration Debt

The current code still contains many older visual systems:

- `ModernCard`, `ModernButton`, and `ModernInput` are widely used.
- `legacyCompat` appears in many files as a bridge.
- Decorative components still exist: `GlassCard`, `AuroraBackground`,
  `PatternBackground`, and `ParticleField`.
- Older wrappers such as `PremiumButton`, `EnhancedButton`, and related
  families still exist.

The code registry in `frontend/src/components/ui/legacyVisualSystem.ts` marks
many of these as wrapper-only, migration-required, or restricted to appearance
and demo surfaces. New operational redesign work should not add fresh usages of
decorative or legacy systems.

Observed code counts from `frontend/app` and `frontend/src`:

| Pattern                 | Files currently referencing it |
| ----------------------- | -----------------------------: |
| `useUiTokens`           |                            104 |
| `legacyCompat`          |                            126 |
| `ModernCard`            |                             54 |
| `ModernButton`          |                             23 |
| `ModernInput`           |                             17 |
| `FlashList`             |                             16 |
| `OperationalListRow`    |                             14 |
| `OperationalSplitView`  |                              9 |
| `OperationalCommandBar` |                              9 |
| `ScannerFeedbackState`  |                              8 |
| `OperationalSyncBanner` |                              8 |
| `GlassCard`             |                              6 |
| `AuroraBackground`      |                              5 |
| `PatternBackground`     |                              5 |
| `ParticleField`         |                              4 |

This means the redesign plan should be incremental. Replace legacy visuals
inside touched screens, but avoid a broad visual rewrite unless it is scheduled
as its own migration.

## Token Rules From Current Code

Use `useUiTokens()` inside feature components. It resolves tokens from current
theme, mode, flags, and animation settings.

Important token concepts already present:

- Colors: `background`, `surface`, `surfaceElevated`, `border`,
  `textPrimary`, `textSecondary`, `textMuted`, `accent`, `accentStrong`,
  `success`, `warning`, `error`, `info`, `overlay`.
- Spacing: `xxs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`.
- Radius: `sm`, `md`, `lg`, `xl`, `full`.
- Motion: tokenized duration values and reduced-motion checks.
- Touch targets: 44 minimum, 48 preferred, 56 for important scanner controls.

Do not introduce raw colors, arbitrary spacing, arbitrary elevation, or manual
shadow stacks in feature UI. If a new value is genuinely needed, add it to the
token layer instead of hardcoding it in a screen.

## Surface And Layout Rules

Operational screens should use:

- `ScreenContainer backgroundType="solid"`.
- Semantic tokens for background, surface, border, and text.
- One primary action region per workflow.
- Clear headers, filters, status banners, list sections, and command bars.
- Virtualized lists for dense admin, supervisor, audit, and queue surfaces.
- Stable row heights and predictable pagination.

Avoid these for operational routes:

- Aurora, particle, pattern, glass, or gradient backgrounds.
- Nested cards inside cards.
- Decorative shadow stacks.
- Marketing hero layouts.
- Hover-only actions.
- Full-page explanatory copy where direct workflow UI is expected.

## Staff Workflow Guidelines

Staff screens are the highest-risk redesign area because they drive live stock
counting. Prioritize speed, scan confidence, offline continuity, and error
recovery.

### Staff Home And Session Selection

Current code:

- `frontend/src/screens/staff/StaffHomeScreen.tsx`
- `frontend/src/components/scan/SessionStartModal.tsx`

Preserve:

- Active and history tabs.
- Active session grouping by warehouse or location.
- Duplicate active-session detection with resume path.
- Start-session modal flow for location, floor, rack, and notes.
- Offline and sync visibility.
- Haptic feedback where available.

Redesign guidance:

- Make the active session resume action visually dominant.
- Show location, floor, rack, and progress in compact cards or rows.
- Keep history secondary and searchable.
- If session counts grow, move from small mapped sections to virtualized lists.
- Do not let decorative dashboard cards compete with the main "resume count"
  action.

### Staff Scan Screen

Current code:

- `frontend/app/staff/scan.screen.tsx`
- `frontend/src/components/scan/ScanCameraOverlay.tsx`
- `frontend/src/components/scan/ScanLookupPanel.tsx`
- `frontend/src/components/scan/ScanStatsCard.tsx`

Preserve:

- Camera permission path and manual search fallback.
- Scan buffer/debounce behavior.
- WebSocket session status updates.
- Offline local lookup path.
- `OperationalSyncBanner` for offline counting.
- `ScannerFeedbackState` for captured, processing, found, queued, duplicate,
  warning, blocked, invalid, and error states.
- Search results capped for inline scan flow.
- Recent items capped so the scan screen stays fast.
- Bottom "Finish Rack" action.
- Debug/performance overlays behind flags only.

Redesign guidance:

- Keep the scanner frame and search panel in the same visual rhythm.
- Show one scan result state at a time.
- Give duplicate, offline, and invalid scans distinct semantic tones.
- Keep manual search reachable without hiding the camera path.
- Avoid animations that delay scan acknowledgement.

### Item Detail And Count Submission

Current code:

- `frontend/app/staff/item-detail.screen.tsx`
- `frontend/src/components/scan/CountQuantitySection.tsx`
- `frontend/src/components/scan/BatchVariantsSection.tsx`
- `frontend/src/components/scan/SerializedItemSection.tsx`
- `frontend/src/components/scan/SerialEntriesSection.tsx`
- `frontend/src/components/scan/EvidenceNotesSection.tsx`
- `frontend/src/components/scan/ItemSubmitBar.tsx`
- `frontend/src/domains/inventory/hooks/scan/useDeferredItemSubmission.ts`
- `frontend/src/domains/inventory/hooks/scan/useQuantityCountManager.ts`
- `frontend/src/domains/inventory/hooks/scan/useSerialEntryManager.ts`

Preserve:

- Item identity hero with item name, item code, barcode, source, system stock,
  unit, MRP, session, floor, and rack.
- Quantity as the dominant interaction.
- Decimal keyboard for weighted or measured UOM and numeric keyboard for
  count-based UOM.
- Frontend precision handling while keeping backend validation authoritative.
- Split-count mode.
- Batch-count mode, batch locking, zero-stock toggle, current batch badge,
  and batch total summary.
- Serialized item toggle, serial list, duplicate detection, manual serial entry,
  and scan serial path.
- Damage condition, damage quantity, notes, photos, and mandatory damage photo
  validation.
- Recount lock and blind recount blockers.
- Five-second submit countdown with undo.
- Specific error states for duplicate scan, validation, and locked workflow.
- Payload shape going through `createCountLine`.

Redesign guidance:

- The submit bar should always tell the user whether the count can be saved and
  why it cannot.
- Quantity, batch, serial, and damage sections should be visually separate but
  not feel like unrelated cards.
- Preserve typed input when showing validation errors.
- Make backend validation messages specific and actionable.
- Do not introduce UI that implies direct stock quantity edits.
- Do not present serial uniqueness as global. UI copy should keep serial
  context tied to the item and count workflow.

### Serial Scanner

Current code:

- `frontend/app/staff/serial-scanner.tsx`
- `frontend/src/domains/inventory/serialScanRules.ts`
- `frontend/src/hooks/useScanGate.ts`
- `frontend/src/utils/scanUtils.ts`

Preserve:

- Modes: `SERIAL`, `ITEM`, and `AUTO`.
- Wrong-code-type feedback.
- Duplicate serial feedback.
- Camera permission fallback.
- Manual serial entry.
- Last-scanned list.
- Scan gate debounce and lock release timing.

Redesign guidance:

- Mode chips must be obvious before scanning starts.
- Wrong item barcode vs serial feedback must be immediate.
- The count of accepted serials should remain visible.
- Keep the screen optimized for one-handed scanning.

## Supervisor Workflow Guidelines

Supervisor screens already use the strongest operational primitives. Redesign
should build on those patterns instead of replacing them.

### Sessions Queue

Current code: `frontend/app/supervisor/sessions.tsx`

Preserve:

- `OperationalListRow`, `OperationalListSection`, `OperationalSplitView`,
  `OperationalCommandBar`, and `FlashList`.
- Status and severity mapping.
- Cached-only offline banner.
- Web/tablet detail panel and mobile navigation to session detail.
- Keyboard navigation through `useOperationalQueueNavigation`.
- Refresh shortcut.
- Pagination and virtualization settings.

Redesign guidance:

- Keep active, reconcile, finalized, and high-variance sessions visually
  distinguishable.
- The selected session detail should summarize status, counts, variance, and
  next action without forcing navigation on wide screens.

### Variance Review

Current code: `frontend/app/supervisor/variances.tsx`

Preserve:

- Variance severity by magnitude.
- Filters and selection mode.
- Bulk approve and reject.
- Export actions.
- Offline blocking for load, actions, and export.
- Keyboard shortcuts for open, approve, reject, and escape.
- Detail panel with system, verified, and variance metrics.

Redesign guidance:

- Variance rows should make risk obvious before the user opens detail.
- Approval and rejection actions must stay clearly separated.
- Recount or rejection reasoning should be visible near the decision point.

### Sync Conflicts

Current code: `frontend/app/supervisor/sync-conflicts.tsx`

Preserve:

- Permission check for `sync.resolve_conflict`.
- Pending, resolved, and all filters.
- Conflict statistics.
- Local vs server comparison.
- Batch accept server/local actions.
- Resolution note.
- Keyboard shortcuts.
- Modal or split detail behavior.

Redesign guidance:

- Never hide which side of a conflict will win.
- Use direct labels such as "Use server value" and "Use local value".
- Keep conflict resolution disabled or clearly blocked offline.

### Offline Queue

Current code: `frontend/app/supervisor/offline-queue.tsx`

Preserve:

- Queue and conflict sections.
- Selected detail with payload JSON.
- Force sync action and summary.
- Flush disabled in offline mode.
- Feature flag gate for offline queue.
- Refresh and open keyboard commands.

Redesign guidance:

- Separate "waiting to upload" from "requires decision".
- Show retry, conflict, and success states with semantic colors.
- Keep raw payload detail available for supervisors without making it the first
  thing staff must read.

### Session Detail

Current code:

- `frontend/src/screens/supervisor/SessionDetailScreen.tsx`
- `frontend/src/components/supervisor/RecountAssignmentModal.tsx`

Preserve:

- To Verify and Verified tabs.
- Offline blocking for approval, rejection, recount, verify, unverify, status,
  and finalization actions.
- Finalized session locks.
- Recount assignment modal with staff selection and instructions.
- Header metrics for items, variance, and status.
- Row actions for approve, reject, verify, unverify, and recount.

Redesign guidance:

- Finalization should feel like a controlled checkpoint, not a simple button.
- Recount assignment must show who receives the work and why.
- Verified and unverified states should be clear when scanning quickly.

## Admin Workflow Guidelines

Admin screens are mixed. Some already match supervisor operational patterns,
while others need consolidation.

### Admin Dashboard

Current code:

- `frontend/app/admin/dashboard-web.screen.tsx`
- `frontend/src/components/admin/dashboard/DashboardPanels.tsx`
- `frontend/src/components/admin/dashboard/dashboardWebShared.ts`

Preserve:

- Tabs: overview, monitoring, reports, analytics, diagnosis.
- Offline dashboard banner.
- Recommended tools based on issues, service health, variances, and help.
- Service status and start/stop controls for backend/frontend.
- Report generation with format and date range.
- Diagnosis health, auto-fix action, and recommendation list.
- Reduced-motion checks around animated panels.

Redesign guidance:

- Remove references to old "Aurora" mental model from new design work, even if
  comments remain in code.
- Convert dashboard cards gradually toward `AppCard` or operational primitives.
- Service start/stop actions are high-impact. They must keep explicit labels,
  busy states, and confirmation or safe feedback where needed.
- Reports should clearly show format, date range, export availability, and
  offline restrictions.

### Admin Logs

Current code: `frontend/app/admin/logs.tsx`

Preserve:

- `OperationalSplitView` with log stream and detail pane.
- `FlashList`.
- Log level filters.
- Search.
- Severity mapping for info, debug, warning, error, and critical.
- Five-second auto-refresh when online.
- Offline "live logs unavailable" notice.
- Command bar shortcuts.

Redesign guidance:

- Keep log rows dense and readable.
- Put raw JSON in detail, not in the stream row.
- Do not auto-refresh while offline.

### User Management

Current code:

- `frontend/app/admin/users.screen.tsx`
- `frontend/src/components/admin/users/UsersTable.tsx`
- `frontend/src/components/admin/users/UserFiltersBar.tsx`
- `frontend/src/components/admin/users/UserFormModal.tsx`

Preserve:

- Admin role guard.
- Offline blocking for create, edit, delete, activate, deactivate, and bulk
  actions.
- Pagination with page size 20.
- Search, role filter, active filter, and sort.
- Desktop/tablet table layout and mobile card layout.
- Multi-select and bulk actions.
- Confirmation before delete and bulk destructive action.
- Validation for username, email, password, and 4-digit PIN.
- Immutable username on edit.
- Existing test IDs used by tests.

Redesign guidance:

- Prefer converting table rows to `OperationalListRow` or keeping the current
  table only where web density requires it.
- Keep destructive actions visually distinct and confirmation-gated.
- The create/edit modal should use the app form primitives, but preserve all
  validation and test IDs.
- Bulk action state should remain impossible to miss once users are selected.

### Settings

Current code: `frontend/app/admin/settings.tsx`

Preserve:

- Personal app preferences.
- Appearance settings.
- Personal security link.
- Backend system parameters.
- Save action only for backend system settings.
- Offline state where system parameters are unavailable but personal
  preferences still work.
- Specific sections for API, caching, synchronization, sessions, logging,
  database, security, and performance.

Redesign guidance:

- Visually separate personal preferences from backend system parameters.
- Do not imply personal preferences require the page save button.
- Keep system settings save disabled when offline, loading, saving, or not
  loaded.
- Use simple rows, sections, and switches rather than dense card stacks.

### SQL Server Configuration

Current code: `frontend/app/admin/sql-config.tsx`

Preserve:

- Admin role guard.
- Host, port, database, username, and password fields.
- Password is never loaded back into the UI.
- Test connection action.
- Save configuration action.
- Success and failure result states.
- Offline blocking for view, test, and save.
- Backend restart note after save.

Redesign guidance:

- Treat SQL configuration as sensitive operational configuration.
- Keep "test" and "save" separate.
- Avoid showing credentials in summaries.
- Use explicit disabled states when host or database are missing.

### Realtime Dashboard And Unknown Items

Current code:

- `frontend/app/admin/realtime-dashboard.screen.tsx`
- `frontend/src/components/admin/realtime-dashboard/*`
- `frontend/app/admin/unknown-items.tsx`

Preserve:

- Auto-refresh disabled offline.
- Manual refresh and export restrictions.
- Column settings and item detail modal.
- Unknown item mapping and dismissal flows.
- Live connection requirements for mapping and dismissal.

Redesign guidance:

- Realtime tables should remain table-like on web and compact on smaller
  screens.
- Unknown item resolution should show the source barcode, suggested match, and
  target item code clearly.
- Dismissal should remain confirmation-gated.

## Navigation Guidelines

Current code:

- `frontend/app/staff/_layout.tsx`
- `frontend/app/supervisor/_layout.tsx`
- `frontend/app/admin/_layout.tsx`
- `frontend/src/components/navigation/SupervisorSidebar.tsx`
- `frontend/src/components/navigation/AdminSidebar.tsx`
- `frontend/src/components/navigation/adminNavShared.ts`

Preserve:

- Role guards and crash screens.
- Staff stack header hidden for scanner-first flow.
- Supervisor/admin persistent sidebar on web and tablet.
- Mobile stack navigation for supervisor and admin.
- Collapsed sidebar width and expanded sidebar width behavior.
- Admin nav groups: Overview, Operations, Access Control, System.
- Supervisor nav groups: Overview, Operations, Settings.
- Feature-flagged supervisor routes for activity logs, offline queue, and sync
  conflicts.
- Safe back navigation behavior.

Redesign guidance:

- Sidebar active states should use tokens and remain obvious when collapsed.
- Group headers should be collapsible on desktop but not block mobile route
  access.
- Admin routes intentionally include supervisor operations. Keep this shared
  oversight model.
- Do not duplicate navigation concepts between sidebar and dashboard tools
  without a clear reason.

## Offline And Sync State Guidelines

Offline mode is not just a banner. It changes what data can load and which
actions are legal.

Current patterns:

- Staff scan can continue with offline local data and queued updates.
- Supervisor sessions can show cached data.
- Supervisor variances, sync conflicts, exports, and approvals are blocked
  offline.
- Offline queue can inspect pending items, but flush is disabled offline.
- Admin logs, users, SQL config, reports, service controls, unknown item
  mapping, and system settings require live connection.
- Personal settings can remain editable offline.

Redesign rules:

- Every screen must state what is still available offline and what is blocked.
- Use `OperationalSyncBanner` for operational sync states.
- Disable blocked actions, but also explain why.
- Do not let stale online controls appear active during offline mode.
- Keep pending upload counts visible where relevant.
- Conflict resolution must always be explicit and permission-gated.

## Accessibility Rules From Code

The current accessibility utilities define:

- `MIN_TOUCH_TARGET = 44`.
- `COMFORTABLE_TOUCH_TARGET = 48`.
- `OPERATIONAL_HIT_SLOP` sizes.
- `getAccessibleButtonProps`.
- `getAccessibleToggleProps`.
- `getMinimumTouchTargetStyle`.
- Decorative icon props.

Redesign requirements:

- All interactive controls need accessibility role, label, state, and disabled
  or busy state when applicable.
- Touch targets must be at least 44x44.
- Prefer 48x48 for normal actions and 56x56 for important scan actions.
- Use icon buttons for compact tool actions, but the accessible label must name
  the action.
- Core actions cannot depend on hover.
- Split-view and command-bar actions need keyboard behavior on web.
- Loading, offline, failed, and destructive states need screen-reader friendly
  copy.

## Motion And Feedback Rules

Current code uses:

- `useReducedMotion`.
- `getOperationalMotionDuration`.
- `AnimatedPressable`.
- Scanner feedback state.
- Haptics in scan and staff flows.

Redesign requirements:

- Routine operational motion should stay short and tokenized.
- Reduced motion must disable nonessential transitions.
- Scan acknowledgement should feel instant.
- Do not animate layout in a way that moves scanner input, submit controls, or
  destructive buttons unexpectedly.
- Haptics should reinforce successful scan, duplicate, warning, and error
  states, not become decorative noise.

## List And Table Rules

Use virtualized rendering for large or dense data:

- `FlashList` is already used in sessions, variances, logs, and other dense
  routes.
- `FlatList` is used in user management and smaller responsive lists.
- Governance code flags dense `ScrollView + map()` patterns in admin,
  supervisor, recount, and audit paths.

Redesign requirements:

- Use `FlashList` or `FlatList` for queues, logs, users, variance rows,
  sessions, count lines, activity, and realtime records.
- Keep stable keys.
- Keep estimated row heights stable.
- Do not put unbounded `.map()` lists inside `ScrollView` on dense screens.
- Keep filters and command bars outside virtualized row rendering.

## Forms And Validation

Current form patterns are mixed. Redesign should standardize without removing
existing validations.

Rules:

- Keep keyboard types aligned to data type.
- Keep validation messages next to the relevant field where possible.
- Preserve disabled and busy states.
- Preserve existing test IDs in admin forms and scanner flows.
- Use semantic rows and sections for settings screens.
- Avoid hiding advanced fields inside decorative accordions when they are
  required for workflow completion.
- Do not clear user input after a validation failure unless the user explicitly
  chooses to reset.

Workflow-specific validation to preserve:

- User create/edit: username length, email format, password length, 4-digit PIN,
  role, active status, immutable username on edit.
- Count detail: quantity required, serial validation, damage quantity,
  mandatory damage photo, recount lock, blind recount blockers, backend error
  handling.
- SQL config: host and database required before test/save, password never
  loaded.
- Unknown items: target item code required before mapping.

## Data Contract Guardrails Visible In UI Code

The UI currently builds count-line payloads through the scan domain hooks and
submits via `createCountLine`.

Do not redesign the UI in a way that:

- Creates direct stock quantity editing controls.
- Bypasses the count-line submission path.
- Removes `session_id`, item code/name, barcode, batch data, quantity, floor,
  rack, condition, damage, serials, MRP, dates, evidence, notes, or
  `recount_of_id` from the save path.
- Hides backend validation errors behind generic copy.
- Removes offline queue or conflict visibility.
- Weakens locked, finalized, or recount workflows.

The UI should communicate the model simply:

- Staff count and submit observations.
- Supervisors verify, approve, reject, recount, and finalize.
- Admins configure, monitor, audit, and manage access.

## Visual Debt To Address During Redesign

The live code reveals these concrete debt areas:

- `legacyCompat` appears broadly and should be reduced where touched.
- `ModernCard`, `ModernButton`, and `ModernInput` remain common. Prefer
  `AppCard`, `AppButton`, and `AppInput` for new work.
- Some comments and style bridges still refer to Aurora or glass concepts.
  Do not carry that language into new operational redesign specs.
- Admin dashboard, settings, SQL config, user modal, and unknown item flows use
  older custom card/form styles.
- Navigation sidebars still use older `useTheme`, global styles, and
  `legacyCompat` tokens.
- Some screens use custom `Alert.alert` flows. Where redesign adds custom
  confirmation UI, preserve the same confirmation gates and destructive
  semantics.

## Redesign Planning Checklist

Before redesigning any screen, capture:

- Route path and role.
- Whether the route is mobile-first, tablet/web-first, or both.
- Online, offline, loading, refreshing, empty, error, permission-denied, and
  busy states.
- Primary action, secondary actions, destructive actions, and disabled rules.
- Existing test IDs.
- Existing keyboard shortcuts.
- Existing accessibility labels and touch targets.
- Existing API calls and mutation gates.
- Whether the data list needs virtualization.
- Whether the screen contains scan, serial, batch, variance, conflict,
  approval, finalization, SQL config, user management, or report generation
  behavior.

During implementation:

- Use `ScreenContainer` and `useUiTokens`.
- Use operational primitives for queue/detail screens.
- Use scanner feedback primitives for scanner workflows.
- Preserve role guards and safe navigation.
- Preserve offline restrictions.
- Preserve exact workflow blockers.
- Replace legacy visuals only inside the touched scope.
- Add or adjust focused tests when changing validation, scanner behavior,
  queue actions, or accessibility behavior.

After implementation:

- Check mobile and web layouts.
- Check text scaling and long values.
- Check contrast for semantic status colors.
- Check reduced motion.
- Check safe area and keyboard behavior.
- Check offline mode.
- Check loading, empty, error, and retry states.
- Check destructive confirmations.
- Check that no new decorative operational surfaces were introduced.

## Suggested Verification Commands

For UI-only redesign slices, start narrow:

```bash
cd frontend
npm run governance:ui:changed:strict
npm run typecheck
```

Add focused tests based on the touched area:

```bash
cd frontend
npm run test -- OperationalListRow
npm run test -- OperationalCommandBar
npm run test -- OperationalSplitView
npm run test -- ScannerFeedbackState
```

For staff scan or recount changes:

```bash
cd frontend
npm run e2e:recount-smoke
```

For settings or notification changes:

```bash
cd frontend
npm run e2e:settings-notifications-smoke
```

For broad UI changes, run:

```bash
make node-test
make lint
```

Use local browser or device smoke checks for:

- Staff scan on mobile width.
- Staff item detail with keyboard open.
- Serial scanner permission denied and manual entry.
- Supervisor sessions on mobile and web split view.
- Supervisor variances with selection mode.
- Sync conflicts with local/server detail.
- Admin dashboard offline and online tabs.
- Admin users mobile card and web table.
- SQL config test/save disabled states.

## Code-Derived Redesign Priorities

1. Standardize new work on `ScreenContainer`, `useUiTokens`, and `App*`
   primitives.
2. Keep staff scanning and item detail workflow behavior unchanged while
   improving hierarchy and touch ergonomics.
3. Keep supervisor queue/detail patterns and use them as the model for admin
   logs, users, unknown items, and realtime operations.
4. Reduce legacy visual imports in touched files, especially `Modern*`,
   `legacyCompat`, and decorative visual systems.
5. Make offline, permission, sync, and destructive action states impossible to
   miss.
6. Preserve virtualization for dense operational data.
7. Preserve all scanner, serial, batch, recount, damage, and submit countdown
   behavior.
8. Keep admin configuration screens clear, cautious, and explicit.

## Final Rule

When in doubt, redesign around the real task the user is trying to complete:

- Staff need to count accurately and quickly.
- Supervisors need to find risk, resolve variance, and finalize safely.
- Admins need to monitor, configure, audit, and manage access without causing
  accidental operational damage.

Anything that makes those jobs slower, less legible, or less auditable should
not enter the redesign.
