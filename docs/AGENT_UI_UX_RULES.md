# Stock Verify UI/UX Governance Framework

## 1. Executive Summary

Stock Verify is an operational inventory platform, not a consumer application. The user interface exists to help warehouse operators, supervisors, and administrators complete stock counting work quickly, accurately, and recoverably under fatigue, time pressure, unstable connectivity, and mid-range Android device constraints.

This document is the repo-level source of truth for UI/UX governance. It applies to React Native, Expo, web preview surfaces, role dashboards, scan workflows, settings, feedback surfaces, and any AI-generated UI work.

The governance priorities are:

1. Operational speed
2. Accuracy
3. Error prevention
4. Recoverability
5. Consistency
6. Accessibility
7. Low cognitive load
8. Multi-device scalability

Decorative aesthetics are never a valid reason to reduce task speed, readability, recoverability, accessibility, or runtime performance.

External skills are supporting references only:

- Use `mobile-app-design` for mobile conventions, touch targets, safe areas, contrast, and React Native accessibility checks.
- Use `ux-heuristics` for usability audits, navigation clarity, form friction, error prevention, and severity-ranked UX findings.
- Use `ui-ux-pro-max` only for pattern lookup and token ideas. Filter out decorative styles that do not fit this app.
- Use `vercel-react-native-skills` for React Native performance, list rendering, animation, and technical UI quality.
- If any external skill conflicts with this document, this document wins.

### 1.1 Quick Reference
- Prefer the existing unified design system and shared primitives over feature-local styling.
- Verify offline visibility, pending sync count, failed sync count, last sync timestamp, and retry path before merge.
- Treat accessibility as operational reliability: touch targets, labels, focus order, contrast, text scaling, and reduced motion must all be preserved.
- Do not introduce new visual systems, arbitrary spacing/colors, or duplicate component families in operational workflows.
- Run typecheck, lint, governance checks, and build preview for affected UI surfaces.

### 1.2 Glossary
- `semantic token`: a named token representing product meaning, such as `error`, `success`, `info`, or `surfaceElevated`.
- `shared primitive`: an approved reusable UI component exported from canonical entry points such as `frontend/src/components/ui`.
- `operational surface`: any screen or workflow used for stock counting, scanning, review, sync, or admin triage.
- `legacy visual system`: an older component/style family kept only for migration and not to be expanded in new work.
- `recoverability`: the ability for users to return to a valid state after interruption, failure, or navigation.
- `offline visibility`: UI that clearly communicates online/offline state, queue status, and sync health.
- `high-frequency scan path`: the scan-and-count workflow that must remain fast, low-friction, and thumb-friendly.

> See also `frontend/src/theme/unified/` for existing project token and governance patterns.

## 2. Governance Philosophy

The design system is a production dependency. It must be managed with the same discipline as API contracts, database schemas, and authentication boundaries.

Every UI decision must answer:

- Does this reduce counting mistakes?
- Does this preserve operator flow during high-frequency scans?
- Does this make offline and sync state visible?
- Does this reduce ambiguity for staff, supervisor, or admin roles?
- Does this work on mid-range Android devices and web preview?
- Does this remain usable with larger text, reduced motion, and screen readers?

UI changes must be small, reviewable, token-driven, and grounded in existing components. New visual languages, new token scales, new navigation models, or duplicate component families require architecture approval.

## 3. Design Principles

### 3.1 Operational Utility First

- Prioritize completion of stock counting, recount, variance, and review tasks.
- Keep primary actions close to the user's current work area.
- Avoid layouts that require repeated scrolling during scanning or counting.
- Keep dense information scannable through hierarchy, spacing, and semantic status, not decoration.

### 3.2 Accuracy Before Speed, Speed After Clarity

- Prevent wrong rack, wrong item, wrong quantity, and duplicate scan errors before submission.
- Make scan acknowledgment immediate and unambiguous.
- Never hide validation or sync failures behind generic messages.
- Preserve user input during failures, retries, navigation, and reconnects.

### 3.3 Recoverability Is Mandatory

- Every destructive or session-impacting action must have a clear confirmation, undo, cancel, or recovery path.
- Back navigation must preserve operational context.
- Interrupted workflows must resume at the last meaningful step.
- Failed sync must expose the failed item count and retry path.

### 3.4 One Consistent System

- Use centralized tokens and shared components.
- Do not create feature-local visual systems.
- Do not mix old and new component styles on the same screen.
- New work must move toward token-based components, not expand legacy visual surfaces.

### 3.5 Accessibility Is Part Of Reliability

- Accessibility regressions are operational regressions.
- Touch targets, contrast, screen-reader labels, focus order, text scaling, safe areas, and reduced motion are mandatory.
- Do not rely on color alone to communicate operational state.

## 4. Token Architecture

### 4.1 Canonical Token Sources

Canonical token work must route through:

- `frontend/src/theme/themeTokens.ts`
- `frontend/src/theme/unified/*`
- `frontend/src/theme/index.ts`
- `frontend/src/theme/legacyCompat.ts` only as a migration bridge

New UI code must prefer token-driven APIs such as `useUiTokens`, `ThemeTokens`, `ScreenContainer`, `UnifiedText`, and `UnifiedView` where available. New code must not import directly from `theme/modernDesign` or `theme/unified` outside theme infrastructure unless the local component pattern already requires it.

### 4.2 Token Layers

Primitive tokens define raw values:

- color palettes
- spacing scale
- typography scale
- radius scale
- shadow/elevation scale
- z-index scale
- motion durations and easing
- touch target sizes

Semantic tokens define product meaning:

- `background`
- `surface`
- `surfaceElevated`
- `border`
- `textPrimary`
- `textSecondary`
- `textMuted`
- `accent`
- `success`
- `warning`
- `error`
- `info`
- `overlay`

Component tokens define component-specific usage:

- button height, padding, radius, text, icon gap, disabled opacity
- input height, border, label, helper, error, focus ring
- card padding, border, surface, elevation
- badge color, icon, text, density
- dialog width, padding, title, action row
- scan feedback color, haptic/audio state, duplicate state
- sync banner color, count, retry, timestamp

### 4.3 Mandatory Token Rules

- Do not introduce arbitrary numeric values for spacing, radius, typography, shadow, z-index, opacity, or animation timing.
- Do not hardcode new hex colors in feature components.
- Do not redefine semantic colors in screens.
- Do not create new gradient, shadow, or radius scales without architecture approval.
- Do not use token names that describe appearance only when a semantic name is available.
- Use token aliases for operational meaning: success, warning, error, info, pending, offline, synced, failed, active, disabled.
- If a token is missing, add it centrally with a clear use case and migration note.

### 4.4 Standard Scales

Spacing must follow the centralized 4px-based scale:

- `none`: 0
- `xxs`: 2
- `xs`: 4
- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `2xl`: 24
- `3xl`: 32
- `4xl`: 40
- `5xl`: 48
- `6xl`: 64

Touch target tokens:

- minimum: 44
- comfortable: 48
- large: 56
- adjacent target spacing: 8 minimum

Motion timings:

- instant: 100ms
- fast: 150ms
- normal: 200ms
- slow: 300ms
- maximum routine UI motion: 350ms unless approved

Typography must use the central type scale and platform font families. Operational numeric values, counts, rack IDs, and quantities should use tabular or monospace presentation where supported.

### 4.5 Prohibited Token Patterns

- Hardcoded `#0655A5`, `#EF4444`, or other known token colors in components.
- Random `padding: 13`, `borderRadius: 14`, `zIndex: 9999`, or ad hoc `shadow*` values.
- New AI-purple, pink-heavy, glass-heavy, or decorative gradient palettes.
- Using `success` for neutral completion where `info` or `synced` is semantically correct.
- Using `error` for warnings or variance states that are not failures.

## 5. Component Standards

### 5.1 Reuse-First Workflow
- Inspect the existing shared component first. The component paths under `frontend/src/components/ui`, `frontend/src/components/feedback`, and `frontend/src/components/navigation` are the default assets.
- Extend an approved variant only when the existing primitive does not cover the operational use case.
- Create a new component only when no approved primitive fits and the new component is documented with purpose, token usage, accessibility behavior, and test expectations.
- Export new shared primitives from the canonical component entry points and avoid feature-local duplicates.

### 5.2 Canonical Component Entry Points

Reusable UI must be exported from:

- `frontend/src/components/ui/index.ts`
- `frontend/src/components/feedback/index.ts`
- `frontend/src/components/navigation/index.ts`

Feature components may compose shared primitives, but they must not fork button, input, card, badge, dialog, loading, sync, or offline behavior.

### 5.3 Mandatory Reusable Primitives

The following primitives must exist as shared components and be reused before feature-local variants are considered:

- Buttons: primary, secondary, tertiary, destructive, icon-only, loading, disabled
- Inputs: text, password, number, quantity, date, search, validation
- Scan inputs: barcode entry, camera scan, manual fallback, duplicate feedback, invalid scan feedback
- Cards: operational summary, session, rack, item, stats, alert, review
- Status badges: synced, pending, failed, offline, active, completed, variance, recount
- Dialogs: confirmation, destructive confirmation, variance reason, retry, session exit
- Loading states: skeleton list, skeleton card, inline progress, blocking progress
- Empty states: no sessions, no items, no search results, no pending sync
- Offline banners: offline, reconnecting, sync paused, sync failed
- Sync indicators: pending count, last sync time, retry action, failed queue count
- Retry components: inline retry, full-screen retry, queued retry, idempotent action retry

### 5.4 Component Governance Rules

- Use `Pressable`-based shared primitives where possible.
- All interactive components must support disabled, loading, pressed, focused, error, and success states where applicable.
- Icon-only controls must include accessible labels.
- Components must expose semantic variants, not arbitrary color props.
- Component props must preserve event shapes. Follow existing `RippleButton`, `Modal`, and `ModernButton` patterns before inventing new handler types.
- Feature components must not duplicate shared primitive logic.
- New components must document purpose, variants, accessibility behavior, token usage, and test expectations.

### 5.5 Prohibited Component Patterns

- Feature-local `PrimaryButton`, `Card`, `Badge`, `Modal`, `Toast`, `OfflineBanner`, or `SyncPill` duplicates.
- Components that hardcode spacing, color, elevation, or typography.
- Visual-only state indicators without text or icon support.
- Cards nested inside cards unless the inner element is a true repeated item or modal content block.
- New decorative-only components such as particle backgrounds, aurora backgrounds, animated blobs, ornamental gradients, or non-operational glass surfaces on workflow screens.

### 5.6 Deprecation Direction

Legacy visual components may remain while migration is in progress, but new work must not expand their usage unless explicitly approved. Components with names implying decorative systems, such as glass, aurora, particle, premium, or purely aesthetic animation, require justification before use on operational screens.

Deprecated visual systems must be registered in `frontend/src/components/ui/legacyVisualSystem.ts` with classification, replacement guidance, and a development warning. Legacy components must be thin adapters over approved primitives or explicitly documented exceptions. Do not add feature-level styling logic to deprecated facades.

## 6. Operational UX Standards

### 6.1 Barcode Workflows

- The scan loop must preserve speed: scan, acknowledge, update state, return to ready state.
- Visual acknowledgment must appear within 100ms of scan recognition when possible.
- Haptic/audio acknowledgment must not block UI update.
- Valid, duplicate, invalid, and failed lookup states must be visually distinct and text-labeled.
- Duplicate scans must explain whether the item was already counted, incremented, ignored, or requires review.
- Manual barcode entry must remain available when camera scanning fails.
- Scan screens must keep the current rack, session, item, and pending sync state visible.
- Operators must never need to leave the scan screen to understand whether the scan was saved locally.

### 6.2 Rack Counting

- Current rack identity must be visible above the active counting area.
- Current item, expected state, counted quantity, and remaining action must be visible without deep scrolling.
- Quantity controls must be thumb-zone reachable on small Android devices.
- Finish rack actions must be visually separated from routine scan or quantity actions.
- If a rack has unresolved errors, pending sync, duplicate scans, or variance, finishing must show a specific blocking reason.

### 6.3 Recount Flows

- Recount screens must show why recount is required.
- Recount state must distinguish assigned, in progress, pending sync, submitted, reviewed, and rejected.
- A recount operator must see prior context only when it supports accuracy and does not bias the count.
- Recount submission must preserve local data if connectivity fails.

### 6.4 Variance Review

- Variance lists must prioritize severity, quantity difference, item identity, and rack/session context.
- Variance reason capture must use constrained options where possible.
- Admin or supervisor review must separate approve, reject, request recount, and defer actions.
- Destructive or final review decisions require explicit confirmation and must preserve an audit trail.

### 6.5 Admin And Supervisor Dashboards

- Dashboards are operational triage surfaces, not marketing surfaces.
- Put exception states first: failed sync, high variance, stuck sessions, overdue recounts, rejected submissions.
- Summary metrics must link to the underlying record set.
- Dense tables must support sorting, filtering, and readable row status without horizontal ambiguity.

### 6.6 Audit Sessions

- Long-duration sessions must show elapsed state, saved state, pending sync count, current rack, and last successful sync.
- Session interruption must resume at the last stable local state.
- Session exit must warn only when there is unsaved, failed, or pending work.
- Audit history must expose who did what, when, and with which sync state.

### 6.7 One-Hand And Fatigue Rules

- Place frequent actions in the lower reachable area on phones.
- Keep destructive and final actions away from the primary scan thumb path.
- Avoid tiny adjacent controls in high-frequency flows.
- Avoid requiring precision taps during scanning.
- Do not rely on long instructional text during operational work.

## 7. Accessibility Standards

### 7.1 Mandatory Requirements

- Normal text contrast must meet at least 4.5:1.
- Large text and non-text UI indicators must meet at least 3:1.
- Touch targets must be at least 44x44 points, with 48x48 preferred on Android.
- Adjacent touch targets must have at least 8dp spacing or equivalent hit slop.
- Every interactive element must have a meaningful accessible label.
- Focus order must match visible workflow order.
- Screen titles, dialog titles, and error regions must be announced where platform support allows.
- Text must support scaling without truncating operationally critical values.
- Safe areas must be respected for headers, bottom bars, fixed actions, scanners, and dialogs.
- Reduced motion must be respected.
- Shared interaction work must use `frontend/src/utils/accessibility.ts` for minimum touch targets, hit slop, accessibility state, and button/toggle labels where applicable.

### 7.2 Color And Status

- Do not rely on color alone.
- Every status must include at least one non-color cue: label, icon, shape, position, or description.
- Semantic color meanings are fixed:
  - success: completed or verified
  - warning: attention required or variance
  - error: failure, destructive state, blocked action
  - info: neutral operational context
  - accent: primary navigation or action emphasis
- Do not reuse error color for non-failure emphasis.

### 7.3 Form Accessibility

- Labels must remain visible or recoverable when fields are focused.
- Error messages must be adjacent to the failing field when possible.
- Required and optional state must be clear.
- Validation must preserve entered values.
- Numeric and barcode fields must use appropriate keyboards where platform support allows.

### 7.4 Screen Reader Requirements

- Icon-only buttons need labels such as `Scan barcode`, `Retry sync`, or `Close dialog`.
- Status badges need labels that include status and context, for example `Sync failed, 3 items pending retry`.
- Quantity steppers must announce current value and available action.
- Dialogs must announce title, purpose, and available actions.

## 8. Motion Standards

### 8.1 Allowed Motion

Allowed motion must clarify state or hierarchy:

- press feedback
- loading transition
- success or failure acknowledgment
- dialog entry or exit
- bottom sheet transition
- list item insertion or removal when it helps maintain context

Use opacity and transform first. Avoid layout-changing animation.

### 8.2 Duration Rules

- Press feedback: 100ms to 150ms
- State transition: 150ms to 200ms
- Dialog or sheet transition: 200ms to 300ms
- Operational scan acknowledgment: immediate visual change, no decorative delay
- Routine UI motion must not exceed 350ms without approval
- Shared motion work must route durations through `frontend/src/utils/motion.ts` or `useUiTokens().motion`; avoid new feature-local timing constants.

### 8.3 Prohibited Motion

- Decorative motion on scan, count, variance, admin, or audit screens.
- Particle effects, ornamental background animation, animated gradients, or scroll-driven decoration.
- Animations that block input.
- Animations of width, height, top, left, margin, or other layout properties in hot paths.
- Motion that does not provide reduced-motion fallback.
- Long success animations that delay the next scan.

## 9. Offline UX Standards

### 9.1 Required Offline Visibility

The UI must expose:

- online/offline state
- reconnecting state
- pending sync count
- failed sync count
- last successful sync timestamp
- retry action
- local save state
- sync conflict state when applicable

Required offline UI elements:
- visible network status badge or banner
- explicit saved-local / pending-sync text
- retry action clearly labeled and actionable
- queue size or failed item count visible without drilling in
- last sync timestamp or status label on every operational screen when sync is relevant

Silent failures are prohibited.

### 9.2 Offline Workflow Rules

- Operators must be able to continue counting when local persistence is available.
- Every locally saved action must show saved-local or pending-sync state.
- Failed sync must never look like completed sync.
- Retry must be idempotent from the user's perspective.
- Sync queues must not require the user to understand backend implementation details.
- If an action cannot proceed offline, the UI must explain the specific reason and next possible action.

### 9.3 Sync Copy Standards

Good:

- `Saved on device. 4 changes waiting to sync.`
- `Sync failed for 2 items. Retry now.`
- `Last synced 10:42 AM.`
- `Offline. Counting is still saved on this device.`

Bad:

- `Something went wrong.`
- `Network error.`
- `Failed.`
- `Unexpected sync state.`

## 10. Performance Standards

### 10.1 React Native Performance Rules

- Use virtualized lists for long item, session, variance, and audit lists.
- Prefer FlashList, FlatList, or SectionList over ScrollView for unbounded data.
- Memoize expensive list rows.
- Stabilize callbacks passed to repeated rows.
- Avoid inline objects and functions in hot list render paths.
- Do not perform expensive filtering, sorting, formatting, or derived calculations inside row render.
- Use skeleton loading for content that affects layout.
- Avoid layout shift during loading or sync refresh.
- Use `expo-image` or optimized image handling for any non-trivial image use.

### 10.2 Low-End Android Requirements

- Screens must remain responsive during scan loops.
- Touch feedback must not wait for network response.
- Avoid heavy shadows, blur, glass, particle, or animated background effects.
- Avoid unnecessary re-renders on scanner input, sync status polling, or list updates.
- Keep bundle impact in mind when adding libraries. New UI libraries require justification.

### 10.3 Performance Prohibitions

- Unbounded `ScrollView` for large operational lists.
- Rendering full session history when only visible rows are needed.
- Recomputing derived stats for every row render.
- Blocking modals for routine background sync.
- Layout thrashing through repeated measurement or dynamic height churn.
- Animation jank from layout-property animation.

## 11. AI-Agent Rules

### 11.1 Mandatory AI-Agent Behavior

AI agents must:

- Read this document before changing UI.
- Prefer existing tokens, components, and navigation patterns.
- Inspect local usage before introducing a new pattern.
- Keep UI changes tightly scoped to the requested workflow.
- Once UI governance work is started, continue through the related enforcement, migration, validation, and reporting steps before calling the work complete.
- Preserve role boundaries and navigation contracts.
- Verify touch targets, labels, loading, empty, error, offline, and success states.
- State any residual UI risk in the final response.

### 11.2 AI-Agent Prohibitions

AI agents must not do any of the following without architecture approval:

- Introduce a new visual system.
- Change token scales.
- Add decorative gradients, glass-heavy layers, particles, animated backgrounds, or ornamental illustrations to operational screens.
- Replace approved shared components with feature-local duplicates.
- Introduce inconsistent navigation.
- Change semantic color meanings.
- Add a new component library.
- Add decorative animation in scan, count, variance, admin, or audit workflows.
- Use arbitrary spacing, color, shadow, radius, typography, z-index, or motion values.
- Hide operational instructions in hover-only UI.
- Remove offline, sync, error, or recovery visibility.

### 11.3 Required AI-Agent Review Questions

Before editing UI, answer internally:

- What operational task is this screen supporting?
- What can go wrong under fatigue or unstable connectivity?
- What state must remain visible during interruption?
- Which shared component already covers this pattern?
- Which token should represent each color, spacing, and state?
- How will this behave with larger text and reduced motion?
- How will this behave on a small Android phone?

## 12. PR Review Standards

### 12.1 Mandatory UI Review Checklist

Every PR that changes UI must confirm:

- Screen goal is explicit.
- Primary action is obvious.
- Navigation and back behavior preserve context.
- Shared components are reused.
- Tokens are used instead of arbitrary values.
- Loading, empty, error, success, disabled, and offline states are covered.
- Destructive actions are separated and confirmed.
- Copy is short, specific, and operational.
- No new decorative visual system was introduced.

### 12.2 Accessibility Checklist

- Contrast meets requirements.
- Touch targets are at least 44x44, with 48x48 preferred on Android.
- Icon-only controls have labels.
- Screen reader order matches visual order.
- Focus states are visible.
- Text scaling does not hide critical operational values.
- Safe areas are respected.
- Reduced motion is supported.
- Color is not the only status indicator.

### 12.3 Offline-State Checklist

- Online/offline state is visible where operationally relevant.
- Pending sync count is visible.
- Failed sync state is visible and recoverable.
- Retry path exists.
- Last sync timestamp is available where users need confidence.
- Local save state is clear.
- Sync failure preserves user input.

### 12.4 Operational Workflow Checklist

- Scan acknowledgment is immediate.
- Duplicate scans are handled explicitly.
- Current session, rack, and item context are visible.
- Recount and variance states are distinguishable.
- Interrupted workflow recovery is supported.
- Admin/supervisor actions are auditable.
- High-frequency controls are reachable and not crowded.

### 12.5 Performance Checklist

- Long lists are virtualized.
- Rows are memoized when needed.
- Callbacks and derived values are stable.
- No expensive work runs inside repeated row render.
- Loading states prevent layout shift.
- Motion uses opacity or transform.
- Low-end Android behavior was considered.
- Bundle size impact was considered for dependencies.

### 12.6 Recommended Validation Commands

Use the narrowest useful validation first, then widen when risk requires.

When to run these:
- For any UI or workflow change: `cd frontend && npm run typecheck` and `cd frontend && npm run lint`
- For changed UI files: `cd frontend && npm run governance:ui:changed`
- For release gating or high-risk UI work: `cd frontend && npm run governance:ui:changed:strict`
- For broader design system or token changes: `cd frontend && npm run governance:ui`
- For behavior or component changes after type/lint pass: `cd frontend && npm test`
- For web preview changes: `cd frontend && npm run build:web`
- For component or bundle impact review: `cd frontend && npm run bundle:web:report`
- For end-to-end repository validation: `make agent-ci`

Common practice:
- Run typecheck and lint before governance checks.
- Run `build:web` when the change affects web preview or shared style tokens.
- Run `governance:ui:changed:strict` on release branches or when introducing new shared components.

Recommended command list:

- `cd frontend && npm run typecheck`
- `cd frontend && npm run lint`
- `cd frontend && npm run governance:ui:changed`
- `cd frontend && npm run governance:ui:changed:strict`
- `cd frontend && npm run governance:ui`
- `cd frontend && npm test`
- `cd frontend && npm run build:web`
- `cd frontend && npm run bundle:web:report`
- `make agent-ci`

Native certification requires real Android and iOS build/device evidence. Do not claim full native readiness from web checks alone.

## 13. Governance Operations Model

### 13.1 Ownership

The design system must have explicit ownership:

- Product design owns user experience principles and operational workflow fit.
- Frontend engineering owns token implementation, component APIs, and performance.
- QA owns regression coverage for workflow, accessibility, and offline states.
- Accessibility review owns WCAG-aligned checks and assistive technology findings.
- Architecture review owns token scale changes, navigation model changes, and library additions.

### 13.2 Contribution Process

UI contributions must follow this sequence:

1. Identify the operational workflow and user role.
2. Inspect existing tokens and components.
3. Reuse or extend the closest approved primitive.
4. Document any new token, variant, or component need.
5. Implement the smallest coherent change.
6. Run appropriate validation.
7. Record remaining limitations in the PR.

### 13.3 Approval Flow

Architecture approval is required for:

- new token scales
- semantic color changes
- new navigation patterns
- new shared component families
- replacing existing primitives
- new UI libraries
- new motion systems
- major dashboard layout model changes

Product/design approval is required for:

- workflow sequence changes
- role-specific navigation changes
- changes to scan, count, recount, variance, or admin review behavior
- visual hierarchy changes affecting operational priority

### 13.4 Component Deprecation

Deprecation must be explicit:

- Mark the deprecated component or pattern in documentation.
- Identify the replacement component.
- Define migration scope.
- Avoid mixing old and new variants on the same screen.
- Remove or quarantine dead exports after migration.

### 13.5 Versioning Standards

Design system changes must be versioned by impact:

- Patch: new variant, bug fix, documentation clarification, no behavior change.
- Minor: new component, new semantic token, compatible API extension.
- Major: token scale change, component API break, navigation model change, visual system migration.

Every minor or major change must include migration guidance.

### 13.6 Change Impact Categories
- Patch: small fix to an existing style, token, or documentation update that does not alter workflow or API.
- Minor: new reusable component, new semantic token, or added variant that remains backward-compatible.
- Major: changes to token scales, shared component APIs, navigation models, new visual systems, or any workflow order change.

### 13.7 Documentation Requirements

New shared components must document:

- purpose
- allowed use cases
- prohibited use cases
- variants
- token dependencies
- accessibility behavior
- loading/error/disabled behavior
- performance considerations
- test expectations

## 14. Severity Classification

Use severity to classify UI/UX findings in reviews and audits.

### P0: Critical Operational Blocker

Definition: Prevents task completion, causes data loss, creates unrecoverable counting error, hides sync failure, or blocks emergency recovery.

Examples:

- scan appears saved but is not persisted locally
- failed sync is displayed as complete
- operator cannot recover interrupted count
- destructive admin action has no confirmation or audit clarity
- screen unusable on target Android device

Required action: block merge or release.

### P1: High Operational Risk

Definition: Likely to cause counting mistakes, role confusion, duplicate work, failed review, or repeated operator friction.

Examples:

- duplicate scan state is ambiguous
- current rack or session context disappears
- variance review action labels are unclear
- offline state is hidden on a counting screen
- touch targets are too small in high-frequency controls

Required action: fix before release unless explicitly accepted by product and engineering leads.

### Risk Decision Table
| Finding | Recommended Severity |
|---|---|
| Failed sync shown as complete | P0 |
| Scan appears saved but not persisted locally | P0 |
| Offline status hidden during counting | P1 |
| Duplicate scan state ambiguous | P1 |
| Non-critical icon missing label | P2 |
| Minor spacing inconsistency on low-risk screen | P3 |
| Legacy visual component used in new feature | P1 |
| New token scale or visual system introduced without approval | P0 |

### P2: Medium UX Or Accessibility Defect

Definition: Causes delay, confusion, accessibility friction, or inconsistent behavior but has a workaround.

Examples:

- helper text is verbose
- loading state causes layout shift
- non-critical icon lacks label
- row hierarchy is weak in a dense table
- copy uses inconsistent terminology

Required action: schedule fix and include in PR notes if not fixed immediately.

### P3: Minor Polish Or Documentation Issue

Definition: Low-risk inconsistency that does not affect operational completion.

Examples:

- minor spacing inconsistency
- component documentation missing an example
- low-impact label improvement
- non-critical visual alignment issue

Required action: fix opportunistically or track with a follow-up.

## 15. Enforcement Policy

### 15.1 Merge Gate Expectations

PRs that touch UI must not merge with unresolved P0 findings. P1 findings require explicit risk acceptance if not fixed. P2 and P3 findings may be tracked when release risk is low.

### 15.2 Automated Enforcement

Where practical, enforce with:

- TypeScript type checks
- ESLint rules
- component tests
- Playwright smoke tests
- accessibility-focused tests
- token usage searches
- hardcoded color and arbitrary value scans
- `frontend/scripts/check-ui-governance.cjs --strict` for full UI governance checks
- `npm run governance:ui:changed:strict` for changed-line PR enforcement
- `npm run governance:ui:report` for migration, deprecated-usage, accessibility, motion, token, navigation, and virtualization reporting
- `npm run governance:ui:report:json` for machine-readable governance metrics under `reports/ui-governance-report.json`
- `npm run governance:ui:health` for post-stabilization health checks against `reports/ui-governance-health-baseline.json`
- `npm run codemod:premium-primitives` to dry-run deprecated `Premium*` primitive replacement candidates
- bundle size reports
- release field checks

### 15.3 Manual Enforcement

Manual review is required for:

- operational workflow clarity
- scan interruption risk
- error recoverability
- role and navigation fit
- dense data readability
- fatigue resistance
- semantic color correctness

### 15.4 Sustainability Mode

After blocking governance debt reaches zero, governance work shifts to platform health maintenance.

- Keep hard gates at zero: P0, P1, unsafe navigation, non-virtualized dense rendering, deprecated production imports, and operational aurora usage.
- Treat token, accessibility, reduced-motion, and quarantine counts as health metrics. They should trend down during feature touches and screen decomposition.
- Do not run broad cleanup rewrites only to reduce advisory counts unless there is an operational risk or architectural approval.
- Advisory regression is allowed only with explicit justification and a follow-up path.
- Quarantined systems may be retired only after a stable release cycle with zero downstream production imports and rollback confidence.

### 15.5 Stop Conditions

Stop and request architecture or product approval when a change:

- creates a new visual language
- changes workflow order
- changes semantic status meaning
- changes role navigation
- introduces new shared primitives
- adds a UI dependency
- alters offline/sync user expectations

## 16. Final Governance Principles

- The interface is an operational instrument.
- The design system is a governed product.
- Tokens are contracts, not suggestions.
- Components are shared infrastructure, not feature conveniences.
- Offline and sync states must be visible.
- Errors must be specific and recoverable.
- Motion must clarify, not decorate.
- Dense screens must support fast scanning and fatigue resistance.
- AI-generated UI must obey the existing system.
- Accessibility is required for production reliability.
- No UI change is complete until loading, empty, error, success, offline, and recovery states are considered.
