## 2026-04-30 - Standardizing Header Accessibility and Tactile Feedback
**Learning:** Icon-only buttons in the application header were missing both screen reader descriptions and tactile confirmation, which are essential for an inclusive and responsive mobile experience.
**Action:** Always implement `accessibilityRole="button"`, `accessibilityLabel`, and `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` for header-level icon actions to ensure they are both discoverable and satisfying to use.

## 2025-05-15 - [Clear Button for Form Inputs]
**Learning:** Adding a clear button to form inputs is a high-impact micro-UX improvement that reduces friction during data correction. When implemented with haptic feedback and automatic refocusing, it creates a "delightful" and efficient interaction. In PNPM-based React Native/Expo environments, Jest transformation configurations must specifically account for the `.pnpm` symlink structure to ensure components with ES modules are correctly transformed.
**Action:** Use the `showClearButton` prop in `ModernInput` for any searchable or high-correction fields. Ensure `transformIgnorePatterns` in `jest.config.js` is updated if new ES-only dependencies are added.
