# Repository Merge Strategy

Audit date: 2026-07-27
Execution: 2026-07-27 through 2026-07-28
Main branch HEAD at audit: `dba33d8` (Merge PR #273 — Radio accessibility and tests)

## Executive Summary

The repository had 22 open PRs spanning accessibility, performance, session
management, offline sync, and a large feature branch. This document defined
the merge order, required repairs, consolidation plan, and business-logic
gap list. Phases 1–5 are complete; Phase 6 items remain on hold.

**Results:** 6 PRs merged, 13 PRs closed as superseded, 3 PRs on hold.

---

## Phase 1 — Immediate Merges ✓ COMPLETE

### PR #283 — Badge accessibility fallback → MERGED

Merged first to unblock downstream PRs. Fixed the Badge component's
fallback label bug (`5` instead of `Badge: 5`).

### PR #284 — System report query optimization → MERGED

Merged with asyncio.gather concurrency optimization. PR #270's unique
`flag_resolver.py` change was already present on main; #270 closed.

### PR #282 — Session access and offline sync recovery → MERGED

LAN-safe offline sync fix, session access hardening, token preservation.
Repaired and merged after #283 landed.

### PR #285 — CreateSessionModal accessibility and haptics → MERGED

CreateSessionModal accessibility props. Merged after #283 resolved
Badge conflicts.

---

## Phase 2 — Repair and Merge ✓ COMPLETE

### PR #281 — SessionCard accessibility + Badge empty-string fix → MERGED

Rebased onto latest main, resolved `.jules/palette.md` conflict.
Also included the Badge `??` → `||` fix for empty-string
accessibilityLabel fallback.

### PR #235 — Batch sync N+1 query fix → MERGED

Rebased onto latest main, resolved `.jules/bolt.md` conflict (fixed
shell-expansion date). Replaced per-record `find_one` with bulk `$in`
query in `sync_batch_api.py`.

---

## Phase 3 — Closed as Superseded ✓ COMPLETE

| PR | Reason | Status |
|----|--------|--------|
| #257 | ProgressBar/ProgressRing a11y — superseded by merged PR #226/#280 | Closed |
| #254 | CreateSessionModal close button — superseded by #285 | Closed |
| #270 | System report optimization — duplicated by #284 | Closed |
| #243 | Analytics asyncio.gather — already on main (commit `9945d06`) | Closed |

---

## Phase 4 — Do Not Merge ✓ COMPLETE (comments posted)

### PR #220 — Large advanced branch

| Branch | `codex/protect-web-sync-variance-reporting` |
|--------|---------------------------------------------|
| Status | Not mergeable, substantially diverged |
| Action | **Do not merge wholesale** — comment posted with assessment |

**Critical problems remain:**
- Serialized tracking staff-editable (should be ERP-controlled)
- Serial duplicate validation regresses
- Zero count prohibited (incorrect for physical verification)
- Remarks optional (should be mandatory)
- Silent submission on screen exit (operationally unsafe)

**Useful work to extract into fresh PRs:**
1. Backend-controlled serial tracking
2. Stale-master-data approval acknowledgement
3. Event-driven ERP synchronization
4. Variance assistant
5. ERPNext export subsystem
6. HSN/GST validation subsystem
7. Duplicate-identity controls

---

## Phase 5 — Consolidated Accessibility PR ✓ COMPLETE

Created PR #288 (`fix/consolidated-accessibility-cleanup`) consolidating
unique changes from 10 stale accessibility PRs into a single clean PR.
All 104 test suites pass (401 tests). 127 insertions, 27 deletions across
11 modified files + 5 new test files.

| Source PR | Component | Status |
|-----------|-----------|--------|
| #255 | Tabs — haptics.selection(), decorative icon props | Consolidated → Closed |
| #241 | Switch — OPERATIONAL_HIT_SLOP | Consolidated → Closed |
| #223 | ThemePicker — centralized haptics migration | Consolidated → Closed |
| #217 | QuantityStepper — descriptive labels | Consolidated → Closed |
| #212 | Avatar — image role, dynamic label | Consolidated → Closed |
| #205 | InlineAlert — accessible grouping | Consolidated → Closed |
| #269 | item-detail refresh button — busy/disabled state | Consolidated → Closed |
| #242 | ScanLookupPanel — accessible button props | Consolidated → Closed |
| #248 | PhotoCaptureModal — accessible button props (CreateSessionModal skipped, already on main) | Consolidated → Closed |
| #228 | DataTable — sort header and pagination a11y | Consolidated → Closed |

---

## Phase 6 — Hold

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
