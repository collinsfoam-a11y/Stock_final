# Staff App Code Quality Improvement Design

**Date:** 2026-07-21
**Owner:** Stock Verify Team
**Status:** Approved
**Priority:** High

## Overview

Improve code quality in the staff app by addressing three main areas: type safety (remove `any` types), accessibility/testing (add testIDs and accessibility labels), and file organization (extract components and hooks).

## Problem Statement

The verification report identified:
1. **8 `any` type usages** across 3 staff files, reducing type safety
2. **0 testIDs** in scan.tsx, settings.tsx, and home.tsx (only history.tsx has 2)
3. **Large files** (816, 663, 576, 256 lines) making maintenance difficult
4. **Self-contradictory claims** in audit report about testIDs

## Goals

1. **Type Safety**: Replace all 8 `any` usages with proper TypeScript types and error handling
2. **Accessibility/Testing**: Add testIDs and accessibility labels to all interactive elements (50+ identifiers)
3. **File Organization**: Extract complex components and hooks while keeping files under 300 lines

## Scope

### Files Affected
- `frontend/app/staff/scan.tsx` (816 lines)
- `frontend/app/staff/item-detail.tsx` (663 lines)
- `frontend/app/staff/history.tsx` (576 lines)
- `frontend/app/staff/settings.tsx` (256 lines)
- `frontend/app/home.tsx` (estimated)

### Deliverables
1. Type safety fixes (8 `any` → proper types)
2. TestIDs and accessibility labels (50+ identifiers)
3. Extracted components and hooks (15-20 new files)

## Design Decisions

### 1. Type Safety Fixes

#### settings.tsx (5 instances) - Router Type Safety
```typescript
// Approach: Add type-safe navigation helpers using `as never`
const navigateToWelcome = () => router.replace("/welcome" as never);
const navigateToSecurity = () => router.push("/security" as never);
const navigateToHelp = () => router.push("/help" as never);
const navigateToNotifications = () => router.push("/notifications" as never);
```

**Rationale:** Expo Router type inference struggles with dynamic routes. Using `as never` provides type safety while allowing dynamic routes.

#### history.tsx (2 instances) - Error Handling
```typescript
// Current
catch (error: any) {
  // handle error
}

// Fixed
catch (error: unknown) {
  if (error instanceof Error) {
    // handle error with error.message
  }
  // fallback for non-Error errors
}
```

**Rationale:** `unknown` is the recommended TypeScript approach for catching all error types safely.

#### scan.tsx (1 instance) - Component Cast Removal
```typescript
// Current
} as any);

// Fixed
const panelProps: ScanLookupPanelProps = { /* ... */ };
<ScanLookupPanel {...panelProps} />
```

**Rationale:** Remove type assertion by using properly typed props interface.

### 2. TestIDs and Accessibility Labels

#### Naming Convention
```
screen-element-action-context
```

Examples:
- `scan-submit-btn` - Submit button in scan screen
- `settings-logout-btn` - Logout button in settings
- `history-load-retry` - Retry button in history load error
- `settings-language-select` - Language selector

#### Scan.tsx (~25 testIDs)
- `scan-camera-overlay`
- `scan-submit-btn`
- `scan-refresh-btn`
- `scan-permission-btn`
- `scan-close-session-btn`
- Scan session stats elements
- Modal controls (close, confirm)
- Navigation buttons

#### Settings.tsx (~15 testIDs)
- `settings-logout-btn`
- `settings-language-select`
- `settings-theme-toggle`
- `settings-notification-settings-btn`
- `settings-security-settings-btn`
- `settings-help-btn`
- `settings-logout-confirmation-btn`
- `settings-logout-cancel-btn`

#### Home.tsx (~10 testIDs)
- Quick action buttons
- Session status cards
- Navigation cards

#### Accessibility Labels
- Every button gets `accessibilityLabel`
- Every input field gets `accessibilityLabel` + `accessibilityHint`
- Cards get `accessibilityRole="button"` for screen readers

### 3. File Refactoring (Hybrid Approach)

#### Component Extraction Strategy

**Scan.tsx (816 lines → ~200 lines main)**
```typescript
// Extracted components
- ScanCameraOverlay (200 lines)
- ScanStatsCard (100 lines)
- ScanLookupPanel (80 lines)
- ScanCameraControls (150 lines)
- ScanHeader (100 lines)
```

**Item-detail.tsx (663 lines → ~93 lines main)**
```typescript
// Extracted components
- ItemDetailsHeader (120 lines)
- ItemDetailsForm (200 lines)
- ItemDetailsLocations (150 lines)
- ItemDetailsHistory (100 lines)
```

**History.tsx (576 lines → ~126 lines main)**
```typescript
// Extracted components
- HistoryList (250 lines)
- HistoryEmptyState (100 lines)
- HistoryErrorState (100 lines)
```

#### Custom Hooks Extraction

**Scan.tsx**
```typescript
// Extracted hooks
- useScanSession (100 lines)
- useCameraScan (150 lines)
- useScanPerformance (80 lines)
```

**Item-detail.tsx**
```typescript
// Extracted hooks
- useItemForm (120 lines)
- useItemLocations (100 lines)
```

### 4. Implementation Order

1. **Phase 1 (Week 1)**: Type safety cleanup (all 8 `any` fixes)
2. **Phase 2 (Week 2)**: TestIDs + accessibility labels (50+ identifiers)
3. **Phase 3 (Week 3)**: File refactoring (extract components + hooks)

## Success Criteria

### Type Safety
- ✅ All 8 `any` usages replaced with proper types
- ✅ TypeScript compilation succeeds with no errors
- ✅ Error handling uses `unknown` pattern where appropriate
- ✅ Router navigation uses `as never` for type safety (Expo Router limitation)

### TestIDs and Accessibility
- ✅ 50+ testIDs added across 3 files
- ✅ All interactive elements have accessibility labels
- ✅ No existing tests broken by testID additions
- ✅ All existing tests still pass after testID additions

### File Refactoring
- ✅ Scan.tsx reduced to <300 lines
- ✅ Item-detail.tsx reduced to <300 lines
- ✅ History.tsx reduced to <300 lines
- ✅ Extracted components are reusable and testable
- ✅ Extracted hooks follow proper React hooks patterns
- ✅ Run full test suite: `npm test` after each phase

## Risks and Mitigations

### Risk 1: Breaking Existing Functionality
**Mitigation:** Run full test suite after each phase before merging

### Risk 2: Breaking TestIDs for Existing Tests
**Mitigation:** Add testIDs gradually, run existing tests to verify no breaking changes

### Risk 3: Over-refactoring Leading to Maintenance Issues
**Mitigation:** Use hybrid approach - extract only complex regions, keep related logic together

### Risk 4: Type Safety Fixes Reveal New Issues
**Mitigation:** Incremental fixes with comprehensive testing between phases

## Rollback Plan

Each phase is independent:
- Phase 1: Only affects type annotations, can be rolled back with git revert
- Phase 2: Only adds testIDs, can be rolled back by removing testID attributes
- Phase 3: Adds new files, can be rolled back by removing extracted files and restoring original structure

## Testing Strategy

### Unit Tests
- Verify type safety fixes don't break type checking
- Test extracted components in isolation

### Integration Tests
- Run full test suite after each phase
- Verify existing tests still pass

### Manual Testing
- Test accessibility in screen reader simulation
- Verify testIDs work in automation scripts

## Implementation Notes

### Type Safety
- Use `unknown` + `instanceof Error` pattern for error handling
- Use `as never` for router navigation (Route type validation)
- Remove `as any` casts by using proper type interfaces

### TestIDs
- Use camelCase for testIDs (React Native convention)
- Group by screen/screen-section
- Follow existing patterns from history.tsx

### File Organization
- Keep imports organized by category
- Use clear component naming
- Maintain single responsibility principle
