# Logical Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the highest-signal frontend logical mismatches without broad redesign.

**Architecture:** Keep the current architecture intact and tighten the active code paths only. Normalize unsupported operational modes to the routine path, wire update-dismiss behavior into the real settings UI, and align the frontend runtime contract with the environment the repo is already being verified under.

**Tech Stack:** React Native, Expo Router, Zustand, Jest, TypeScript

---

### Task 1: Clamp unsupported operational modes

**Files:**
- Modify: `frontend/src/store/settingsStore.ts`
- Modify: `frontend/src/components/settings/UserSettingsSections.tsx`
- Modify: `frontend/src/components/auth/AuthGuard.tsx`
- Test: `frontend/src/store/__tests__/settingsStore.userScope.test.ts`

**Step 1: Write the failing test**
- Add a settings-store test proving `operational_mode: "live_audit"` loads as `"routine"`.

**Step 2: Run test to verify it fails**
- Run: `cd frontend; node ./scripts/run-jest.cjs --runInBand --watchAll=false src/store/__tests__/settingsStore.userScope.test.ts`

**Step 3: Write minimal implementation**
- Restrict frontend normalization to the supported `"routine"` mode.
- Update settings UI copy so the row no longer implies unsupported behavior profiles.
- Remove the no-op operational-mode branch from `AuthGuard`.

**Step 4: Run test to verify it passes**
- Re-run the same Jest file.

### Task 2: Wire update dismissal into the active settings UI

**Files:**
- Modify: `frontend/src/components/settings/UserSettingsSections.tsx`
- Test: `frontend/src/components/settings/__tests__/UserSettingsSections.test.tsx`

**Step 1: Write the failing test**
- Add a settings component test proving the optional-update `Later` action calls `dismissUpdate`.

**Step 2: Run test to verify it fails**
- Run: `cd frontend; node ./scripts/run-jest.cjs --runInBand --watchAll=false src/components/settings/__tests__/UserSettingsSections.test.tsx`

**Step 3: Write minimal implementation**
- Call `dismissUpdate` from the `Later` alert button.
- Reflect dismissed optional updates in the visible row state so the UI matches the choice.

**Step 4: Run test to verify it passes**
- Re-run the same Jest file.

### Task 3: Align the frontend Node engine contract

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update runtime declaration**
- Widen the supported engine range to include the Node version already used successfully in repo verification.

**Step 2: Verify**
- Run: `cd frontend; npm pkg get engines.node`

### Task 4: Full verification

**Files:**
- Verify only

**Step 1: Run focused frontend tests**
- `cd frontend; node ./scripts/run-jest.cjs --runInBand --watchAll=false src/store/__tests__/settingsStore.userScope.test.ts src/components/settings/__tests__/UserSettingsSections.test.tsx`

**Step 2: Run full repo CI**
- `bash ./scripts/agent_ci.sh ci`
