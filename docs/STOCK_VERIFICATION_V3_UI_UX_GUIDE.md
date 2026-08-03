# Stock Verification V3 UI/UX Guide

This document is the product-specific UI/UX source of truth for Stock Verify.

Use it for:

- Google Stitch screen generation
- frontend implementation and refactors
- design review
- acceptance checks for inventory, variance, recount, offline, and audit flows

This guide extends, but does not replace, [docs/AGENT_UI_UX_RULES.md](/Users/noufi1/stk_final/Stock_final/docs/AGENT_UI_UX_RULES.md).

## Product Goal

Build a mobile-first stock verification system that:

- optimizes for fast warehouse scanning
- preserves backend truth and auditability
- keeps state explicit during offline, retry, and strict-mode conditions
- prevents duplicate or ambiguous actions
- handles batches, serials, variants, damage, and recount correctly

## Design Direction

Use a functional enterprise utility style:

- primary color family: blue
- surfaces: white or near-white
- status colors: green, yellow, red, neutral gray
- dense but readable cards
- minimal decoration
- strong hierarchy
- large touch targets

Do not use:

- glass-heavy surfaces
- purple or pink AI gradients
- ornamental shadows
- mixed icon sets
- low-contrast text on tinted backgrounds

## UX Principles

1. Scan first. Core flows must reduce taps and thinking.
2. No silent failure. Projection gaps, sync issues, and duplicates must be visible.
3. Context stays visible. Always show session, location, user, and sync state.
4. One action path. Users should not have multiple conflicting ways to complete the same stock task.
5. Audit by design. Approval, recount, damage, and override actions must show provenance.

## Control Plane Alignment

Frontend behavior must stay aligned with the backend V3.1 contract.

- Counting flows must behave as command to event to projection, not direct overwrite.
- Reads must prefer projection-aware state where available.
- Strict mode must surface projection gaps instead of hiding them.
- Duplicate serials must block per item.
- Quantity interactions must respect backend UOM and precision rules.
- Offline UX must show queue depth, sync state, retry state, and unresolved conflict state.
- Session UX must preserve one active session per location.

## Global Layout Structure

The app is organized into:

- Auth
- Session Layer
- Scan Layer
- Item Detail
- Variance and Recount
- Approval
- Dashboard
- Reports
- Settings
- Admin Control

## Global Shell Requirements

Every operational screen should expose:

- current user or role
- current location or session context when relevant
- offline or online state
- sync queue status when write actions are possible
- one primary CTA
- clear back or exit path

## Design Tokens

### Color Roles

| Role | Intent |
| --- | --- |
| Primary Blue | Primary CTA, tabs, active progress, selected states |
| Success Green | Verified, synced, healthy, approved |
| Warning Yellow | Pending, caution, attention needed |
| Error Red | Negative stock, variance, duplicate serial, blocking errors |
| Neutral Gray | Secondary labels, dividers, background separation |

### Typography

- large numeric emphasis for quantities, variance, progress, and value metrics
- medium weight headings for sections and item identity
- compact secondary text for timestamps, source, user, and metadata

### Components

- cards for grouped context
- chips for status
- accordions for batch groups and audit history
- sticky bottom action bars for submit, recount, and approval flows
- floating action button only when it is the single dominant action

## Screen Contracts

The following route map captures the actual app surface that should follow this guide.

### Auth And Entry

| Route | Screen | Required UX |
| --- | --- | --- |
| `/welcome` | Welcome and gateway | clear role entry, concise product value, login path |
| `/login` | Login | username, PIN, biometric support, connection status |
| `/forgot-password` | Password recovery | simple single-purpose recovery flow |
| `/register` | Registration | guided onboarding with field validation |
| `/otp-verification` | OTP verification | explicit code state, resend countdown |
| `/reset-password` | Reset password | strength guidance and success confirmation |
| `/help` | Help and documentation | searchable support topics and escalation path |
| `/security` | Personal security | PIN, biometric, device trust, session safety |

### Session Layer

| Route | Screen | Required UX |
| --- | --- | --- |
| `/staff/home` | Staff home dashboard | active session, progress, quick resume, recent work |
| `/supervisor/dashboard` | Supervisor dashboard | session readiness, progress, alerts, active work |
| `/supervisor/sessions` | Session list | location-based session cards, filters, resume or review |
| `/supervisor/session/[id]` | Session detail | summary, variance counts, review list, approval path |

Rules:

- only one active session per location
- resume must be more prominent than start-new when a location already has an active session
- stale or missing session state must be explicit, never implied

### Scan Layer

| Route | Screen | Required UX |
| --- | --- | --- |
| `/staff/scan` | Core scan screen | barcode input, camera, item panel, qty control, action bar |
| `/staff/serial-scanner` | Serial scanning | serial scan mode, duplicate block, current count, error feedback |

Behavior:

- scanning a new item adds the item to the working set
- scanning the same item updates the same working context, not a duplicate card
- duplicate serials block immediately
- scan feedback must be fast and high contrast
- session and sync context remain visible while scanning

### Staff Review And Settings

| Route | Screen | Required UX |
| --- | --- | --- |
| `/staff/history` | Staff history | previous sessions, filters, clear status states, drilldown |
| `/staff/settings` | Staff settings | security, notifications, sync state, appearance, help path |
| `/staff/appearance` | Staff appearance | text size, theme, reduced motion, utility-first preview |
| `/notifications` | Notifications center | alerts, approvals, sync issues, actionable states |

### Item Detail

| Route | Screen | Required UX |
| --- | --- | --- |
| `/staff/item-detail` | Item verification detail | stock snapshot, batch groups, serials, damage, audit |

Required sections:

- identity: item name, code, barcode, source
- stock snapshot: system qty, counted qty, variance
- pricing: MRP, cost, price
- batch list: grouped by barcode, qty and MRP per batch
- serial section when serialized
- attributes: manufactured date, expiry, unit, flags
- damage handling: qty, reason, photos
- ERP metadata: supplier, last purchase, reference cost
- audit trail: modified by, time, event history

Batch rules:

- negative stock is always visible and red
- positive stock is always visible
- zero stock is hidden by default and revealed with a toggle
- batches must show labels such as current and variant where needed

### Variance And Recount

| Route | Screen | Required UX |
| --- | --- | --- |
| `/supervisor/variances` | Variance center | ranked variance list, thresholds, filter by severity |
| `/supervisor/variance-details` | Variance detail and recount | system vs count, evidence, blind recount, assignment |

Rules:

- recount must support second-user verification
- blind recount must not expose prior counted values to the second user
- threshold and severity must be visible without opening the detail page

### Approval

Approval is currently embedded in supervisor review flows rather than a dedicated top-level route.

Required UX:

- approve and reject states
- supervisor PIN or authenticated confirmation
- reason capture when rejecting or escalating
- audit log for who approved, rejected, or reassigned

### Dashboard And Reports

| Route | Screen | Required UX |
| --- | --- | --- |
| `/admin/dashboard-web` | Admin dashboard and report hub | KPIs, exports, projection health, issue summary |
| `/admin/realtime-dashboard` | Live dashboard | live metrics, filters, alerts, data freshness |
| `/admin/reports` | Reports redirect surface | session, variance, damage, export workflows |

Required metrics:

- verified value
- damage value
- shortage value
- projection health
- sync health

### Supervisor Control

| Route | Screen | Required UX |
| --- | --- | --- |
| `/supervisor/items` | Supervisor inventory and items | search, issue state, item drilldown |
| `/supervisor/offline-queue` | Offline queue monitor | queue depth, retry status, conflict state |
| `/supervisor/sync-conflicts` | Sync conflict resolution | itemized conflict cards, action guidance |
| `/supervisor/user-workflows` | Workflow control | user sessions, approvals, follow-up actions |
| `/supervisor/settings` | Supervisor settings | profile, notifications, appearance, security |
| `/supervisor/appearance` | Supervisor appearance | accessible density, text size, motion, contrast-safe preview |

### Admin Control

| Route | Screen | Required UX |
| --- | --- | --- |
| `/admin/control-panel` | Admin operations dashboard | central operational KPIs, drilldowns, guarded quick actions |
| `/admin/control-panel-v2` | Admin operations dashboard variant | same contract as control panel, no conflicting UX language |
| `/admin/users` | User management | role controls, filters, create and edit flows |
| `/admin/permissions` | Permissions | role matrix, guardrails, clear edit intent |
| `/admin/unknown-items` | Unknown item resolution | unresolved item queue, resolution audit |
| `/admin/logs` | Service log console | filterable logs, severity states, timestamps |
| `/admin/sql-config` | ERP connectivity | read-only connection health, sync diagnostics |
| `/admin/security` | Admin security | protected actions, access review, device and login controls |
| `/admin/settings` | System settings | guarded configuration, explicit save states |

## Offline UX Contract

Offline behavior must be first-class.

Every write-capable screen should show:

- offline badge or banner
- pending queue count
- last sync time or sync freshness
- retry or parked state when sync fails

Offline actions must:

- remain usable when safe
- clearly mark unsynced changes
- avoid language that implies server commit before sync completes

## Error And Exception UX

All blocking or integrity-related errors must use a consistent structure:

```text
[ICON] TITLE
Description
Primary action
```

Required error families:

- duplicate scans
- serial conflicts
- projection missing
- sync conflicts
- session unavailable
- permission blocked
- offline action not allowed

Projection and strict-mode rules:

- never silently fall back when strict mode is active
- show a blocking, audit-safe state when projection data is missing
- give the user a safe recovery path such as retry, refresh, or contact supervisor

## Micro-Interactions

Operational feedback should be minimal and meaningful.

- scan success: short highlight and optional haptic
- scan error: shake or pulse with explicit label
- sync progress: visible progress or active-state indicator
- completed save: immediate confirmation without modal spam

Use reduced-motion safe fallbacks.

## Accessibility And Performance

Minimum quality bar:

- touch targets at least `44x44`
- `8dp` minimum spacing between adjacent touchables
- contrast at least `4.5:1`
- safe-area aware headers and bottom bars
- text scaling without layout breakage
- clear loading, empty, success, error, and disabled states

Performance rules:

- use virtualized lists for large item sets
- debounce scan entry
- avoid rerendering whole pages for one item change
- keep sticky action areas stable while content updates

## Stitch Handoff

### Current Stitch Project

- project: `Stock Verify V3 Operational UI System`
- project id: `4434274765559796851`
- design system: `Lavanya Mart Operations`

### Stitch Direction

Use this guide as the content and behavior source of truth.

Stitch output should be:

- mobile first
- high contrast
- utility driven
- optimized for long operational sessions
- visually consistent across staff, supervisor, and admin roles

### Stitch Master Prompt

Use the following prompt when generating or refreshing screens:

```text
Design a complete mobile UI/UX for an enterprise warehouse stock verification system.

Requirements:

- Scan-first workflow with barcode input
- Session-based inventory counting
- Item details screen with:
  - batch management grouped by barcode
  - quantity and MRP per batch
  - negative stock highlighted
  - optional zero stock visibility
- Serial number management when applicable
- Variance detection and recount workflow
- Supervisor approval system
- Offline-first UX with sync indicators
- Dashboard with financial and operational metrics
- Error handling for:
  - duplicate scans
  - serial conflicts
  - projection data missing
  - sync conflicts

Design must be:

- fast
- minimal
- high contrast
- suitable for warehouse usage
- optimized for continuous scanning

Use clear hierarchy, large touch targets, explicit status messaging, and audit-safe error states.
Avoid decorative glass effects, novelty gradients, or low-contrast styling.
```

## Delivery Checklist

Before closing a UI task, verify:

- the route uses one visual direction only
- scan, sync, and session context are visible where required
- negative stock, zero stock, serial, and variance states are explicit
- offline, loading, empty, error, and success states exist
- the screen respects the V3 stock contract and strict-mode behavior
- touch, contrast, and safe-area requirements are met
