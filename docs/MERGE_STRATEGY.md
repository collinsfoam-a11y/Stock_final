# Repository Merge Strategy

Audit date: 2026-07-27
Main branch HEAD: `dba33d8` (Merge PR #273 — Radio accessibility and tests)

## Executive Summary

The repository has 22 open PRs spanning accessibility, performance, session
management, offline sync, and a large feature branch. This document defines
the merge order, required repairs, consolidation plan, and business-logic
gap list that remains after all current PRs are resolved.

---

## Phase 1 — Immediate Merges

### PR #283 — Badge accessibility fallback

| Field | Value |
|-------|-------|
| Branch | `jules-16658110158600998158-52301a3b` |
| Status | CI green, mergeable, 1 commit ahead of main |
| Risk | Low |
| Action | **Merge after routine review** |

Fixes a pre-existing bug where the Badge component's fallback label produces
bare values (`5`) instead of contextual output (`Badge: 5`). This bug also
causes test failures in PRs #282, #284, #281, and #285.

---

## Phase 2 — Repair and Merge

### PR #282 — Session access and offline sync recovery

| Field | Value |
|-------|-------|
| Branch | `agent/session-sync-hardening` |
| Status | Draft, mergeable, backend CI green, frontend CI blocked by Badge bug |
| Risk | High value, medium risk |
| Action | **Repair, then merge** |

**Genuine defects this PR fixes in current main:**

1. Session creation revokes the employee's refresh tokens
2. Active-session endpoint leaks sessions outside staff member's ownership
3. Administrators blocked from session detail/statistics that supervisors can access
4. Offline payloads lost after HTTP 401
5. Idempotency keys mutate across retries

**Required repairs before merge:**

1. **Badge test failure** — resolved by merging PR #283 first, then rebasing
2. **LAN reachability gating** — the change gates sync wakeup on
   `isInternetReachable === true`, but the network store initializes this to
   `null` and it stays `false` on LAN-only networks. Replace with backend
   reachability or revert to `isOnline`-only gating. Add a LAN-only sync test.

---

## Phase 3 — Current-with-main PRs (merge in order)

These PRs are based on current main (`dba33d8`). All have Badge.tsx
one-liner conflicts that auto-resolve once PR #283 merges.

### PR #285 — CreateSessionModal accessibility and haptics

| Action | Merge after #283 |
|--------|------------------|

Supersedes PR #254 (closed). Covers close button accessibility, selection
haptics, screen reader context. Low risk.

### PR #284 — System report query optimization

| Action | Merge; salvage #270's flag_resolver.py change first |
|--------|-----------------------------------------------------|

Duplicates PR #270's `system_report_service.py` refactor. PR #270 also has
a unique `flag_resolver.py` asyncio.gather optimization — cherry-pick that
into #284 before merging. Then close #270.

### PR #281 — SessionCard accessibility and haptics

| Action | Merge after #285 and #284 resolve Badge conflicts |
|--------|---------------------------------------------------|

Unique SessionCard changes. Low risk.

---

## Phase 4 — Stale Performance PRs (rebase and merge)

These target older main commits but touch unique files with no overlap.

| PR | Scope | File | Action |
|----|-------|------|--------|
| #243 | Analytics asyncio.gather | `analytics_service.py` | Rebase, merge |
| #235 | Batch sync N+1 fix | `sync_batch_api.py` | Rebase, merge |

---

## Phase 5 — Consolidated Accessibility PR

Create one fresh branch from current main:
`fix/consolidated-accessibility-cleanup`

Manually reapply only changes not already present on main:

| Source PR | Component | Unique Changes |
|-----------|-----------|---------------|
| #255 | Tabs | Haptic feedback, improved hitSlop, screen reader state |
| #241 | Switch | Operational touch target hitSlop |
| #223 | ThemePicker | Semantic buttons, standardized haptics |
| #217 | QuantityStepper | Clearer increment/decrement labels |
| #212 | Avatar | Semantic image accessibility |
| #205 | InlineAlert | Grouped alert semantics, decorative-icon suppression |
| #269 | Refresh stock button | Accessible button props, haptics |
| #242 | ScanLookupPanel | Accessible search/scan button |
| #248 | PhotoCaptureModal | Icon-only button accessibility (CreateSessionModal part superseded by #285) |
| #228 | DataTable | Sort/pagination accessibility (drop bundled dep changes) |

Close all source PRs after the consolidated PR is validated.

---

## Phase 6 — Hold / Do Not Merge

### PR #220 — Large advanced branch

| Branch | `codex/protect-web-sync-variance-reporting` |
|--------|---------------------------------------------|
| Status | Not mergeable, substantially diverged |
| Action | **Do not merge wholesale** |

**Critical problems:**
- Serialized tracking remains staff-editable (should be ERP-controlled)
- Serial duplicate validation regresses (missing item_code parameter)
- Zero count prohibited (incorrect for physical verification)
- Remarks optional (should be mandatory)
- Silent submission on screen exit (operationally unsafe)
- Event sync doesn't establish SQL submission-time baseline

**Useful work to extract into fresh PRs:**
1. Backend-controlled serial tracking
2. Stale-master-data approval acknowledgement
3. Event-driven ERP synchronization
4. Variance assistant
5. ERPNext export subsystem
6. HSN/GST validation subsystem
7. Duplicate-identity controls

### PR #222 — RecountAssignmentModal optimization

| Action | **Hold — hidden JWT rewrite** |
|--------|-------------------------------|

Bundles a full JWT provider rewrite (authlib to PyJWT) with a 5-line
`useMemo` frontend fix. The memo fix should be extracted into a trivial PR.
The JWT rewrite requires independent security review.

### PR #278 — Format and cleanup (XL)

| Action | **Hold — merge last** |
|--------|----------------------|

Broad formatting changes that will conflict with nearly everything. Review
for silent behavioral changes before merging as the final cleanup step.

---

## Phase 7 — PRs Closed as Superseded

| PR | Reason |
|----|--------|
| #257 | ProgressBar/ProgressRing a11y — superseded by merged PR #226/#280 |
| #254 | CreateSessionModal close button — superseded by #285 |
| #270 | System report optimization — duplicated by #284 (salvage flag_resolver) |

---

## Business-Logic Gaps (not addressed by any merge-ready PR)

| Requirement | Status |
|-------------|--------|
| One active session per staff member | Not implemented |
| One active session per rack | Not implemented |
| Real pause/release semantics (PAUSED state) | Not implemented |
| 60-minute inactivity takeover | Not implemented |
| Ownership-transfer history | Not implemented |
| SQL quantity fetched at submission time | Not implemented |
| Preserve baseline and submission SQL separately | Not implemented |
| Allow physical count of 0 | Not implemented |
| Mandatory item remark | Not implemented |
| True multi-batch physical counting | Not implemented |
| Provisional physical batch | Not implemented |
| Backend-enforced tracking mode (quantity/batch/serial) | Not implemented |
| Serial-specific condition and photos | Not implemented |
| Structured return/repair lifecycle | Not implemented |
| Other-location shortage investigation | Not implemented |
| Strict zero-variance/zero-exception auto-approval | Not implemented |
| Guided non-scroll operational workflow | Not implemented |

### Recommended business-logic PR sequence

| Order | PR | Scope |
|-------|-----|-------|
| A | Session ownership | Rack locking, pause, takeover |
| B | SQL-at-submission | Variance and pending SQL validation |
| C | Zero counts | Zero-quantity counts and mandatory remarks |
| D | Tracking policy | Backend-controlled quantity/batch/serial |
| E | Damage workflow | Structured condition and other-location |
| F | Auto-approval | Strict zero-exception rules |
| G | Staff UX | Guided counting interface |
