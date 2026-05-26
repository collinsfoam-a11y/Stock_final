## 2026-05-25 - Accessible Icon Buttons
**Learning:** Icon-only buttons in React Native lack semantic meaning for screen readers, rendering them inaccessible by default.
**Action:** Always apply `getAccessibleButtonProps` to the touchable wrapper and `getDecorativeIconProps` to the icon from `src/utils/accessibility.ts`, while also adding light haptics for primary interactions.
## 2026-05-26 - Accessible Icon Buttons
**Learning:** Icon-only buttons like RefreshButton need explicit screen reader labels and hidden icons to prevent redundant announcements.
**Action:** Apply `getAccessibleButtonProps` and `getDecorativeIconProps` from `src/utils/accessibility.ts` alongside haptic feedback for primary interactions.
