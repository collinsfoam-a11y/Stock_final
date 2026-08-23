## 2025-05-18 - Header Button Fallback Accessibility Labels
**Learning:** Icon-only action buttons in header components often fall back to `testID` values (e.g. `back-button`, `settings-button`) for `accessibilityLabel`, resulting in raw internal IDs being announced to screen readers instead of clear, localized human labels.
**Action:** When adding or auditing icon-only header buttons, always specify human-readable `accessibilityLabel` props ("Go back", "Settings", "Logout", etc.), set `accessibilityRole="button"`, and apply `getDecorativeIconProps()` to inner icons.
