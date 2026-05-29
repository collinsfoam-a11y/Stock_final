## 2026-04-30 - Standardizing Header Accessibility and Tactile Feedback
**Learning:** Icon-only buttons in the application header were missing both screen reader descriptions and tactile confirmation, which are essential for an inclusive and responsive mobile experience.
**Action:** Always implement `accessibilityRole="button"`, `accessibilityLabel`, and `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` for header-level icon actions to ensure they are both discoverable and satisfying to use.

## 2025-05-15 - [Clear Button for Form Inputs]
**Learning:** Adding a clear button to form inputs is a high-impact micro-UX improvement that reduces friction during data correction. When implemented with haptic feedback and automatic refocusing, it creates a "delightful" and efficient interaction. In PNPM-based React Native/Expo environments, Jest transformation configurations must specifically account for the `.pnpm` symlink structure to ensure components with ES modules are correctly transformed.
**Action:** Use the `showClearButton` prop in `ModernInput` for any searchable or high-correction fields. Ensure `transformIgnorePatterns` in `jest.config.js` is updated if new ES-only dependencies are added.

## 2026-05-06 - Standardizing Core Button Micro-Interactions
**Learning:** Incorporating haptic feedback and dynamic accessibility labels (e.g., prefixing "Loading, " to the label) directly into the foundational button component ensures consistent UX across the entire application without requiring manual implementation in every screen. When wrapping `onPress` events, it is critical to preserve the `GestureResponderEvent` argument to avoid breaking event-dependent logic in calling components.
**Action:** Always use the centralized `haptics` service for tactile feedback and ensure core components handle accessibility state changes (like loading) transparently.

## 2025-05-18 - Standardizing Tactile Feedback across Design System Components
**Learning:** For a consistent mobile "feel," all interactive primitive components (Switch, Checkbox, Radio, etc.) should provide subtle haptic feedback on state change. Centralizing this logic in a `haptics` service that respects feature flags and platform constraints (e.g., disabling on web) ensures a robust and unified user experience.
**Action:** Use `haptics.light()` from the centralized haptics service for all primary toggle/selection interactions in new UI components.

## 2025-05-20 - Standardizing Feedback for Modals and Headers
**Learning:** Significant UI actions like confirming a destructive operation, closing a modal, or navigating via header buttons benefit greatly from tactile feedback. Using `haptics.medium()` for high-stakes/danger actions and `haptics.light()` for routine ones creates a clear sensory hierarchy that aids the user in understanding the weight of their interactions.
**Action:** Always implement haptic feedback in core container components (Modals, Headers) to ensure a consistent "premium" feel across all screens.

## 2025-05-22 - Enhancing Empty States with Accessible Grouping and Animations
**Learning:** Empty states benefit from entrance animations (like `FadeIn`) to feel less "stark." For accessibility, grouping the icon, title, and message into a single accessible unit with a descriptive `accessibilityLabel` provides a better experience for screen reader users. However, interactive elements (like action buttons) MUST remain outside this grouping to prevent them from becoming unreachable.
**Action:** Wrap non-interactive empty state content in a single `accessible={true}` container, but keep action buttons as separate siblings to maintain accessibility tree depth.
