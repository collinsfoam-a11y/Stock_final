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

## 2026-05-21 - Standardizing Accordion Accessibility and Feedback
**Learning:** Accordion components often lack clear state communication for screen readers and tactile feedback for mobile users. Implementing `accessibilityRole="button"` and `accessibilityState={{ expanded: isExpanded }}` on headers, combined with `haptics.light()` on toggle, ensures a more accessible and responsive experience.
**Action:** Always use `getAccessibleButtonProps` with the `expanded` state for accordion headers and trigger light haptic feedback upon state change.
## 2025-05-22 - Enhancing Empty States with Accessible Grouping and Animations
**Learning:** Empty states benefit from entrance animations (like `FadeIn`) to feel less "stark." For accessibility, grouping the icon, title, and message into a single accessible unit with a descriptive `accessibilityLabel` provides a better experience for screen reader users. However, interactive elements (like action buttons) MUST remain outside this grouping to prevent them from becoming unreachable.
**Action:** Wrap non-interactive empty state content in a single `accessible={true}` container, but keep action buttons as separate siblings to maintain accessibility tree depth.
## 2026-05-23 - Standardizing Header Action Accessibility
**Learning:** Icon-only buttons in the premium application header (like menu, logout, and custom actions) were missing screen reader descriptions and decorative icon flags. Applying `getAccessibleButtonProps` to the `TouchableOpacity` wrapper and `getDecorativeIconProps()` to the internal `Ionicons` ensures full screen reader support and eliminates redundant audio clutter. Integrating the centralized `haptics` service in `onPress` further improves tactile feedback for a smoother interaction.
**Action:** Always wrap `onPress` actions with `void haptics.light()` and apply appropriate accessibility props to both the button wrapper (accessible label) and the internal icon (decorative) for core navigation and header elements.
## 2026-05-24 - Standardizing Micro-Interactions in Selection Modals
**Learning:** Selection modals (like `CreateSessionModal`) frequently use `TouchableOpacity` for selecting options (like zones or warehouses). These buttons were often missing essential haptic feedback upon selection, making the interaction feel less responsive. Additionally, dynamic accessibility labels correctly propagating the selected state (e.g., `selected: locationType === zone.zone_name`) are critical for screen reader users to understand their active choices.
**Action:** Always apply `haptics.light()` within the `onPress` of list/grid selection items. Use `getAccessibleButtonProps` to explicitly set the `selected` property to match the active component state, ensuring screen readers announce the selection accurately.
## 2025-02-28 - accessibilityRole collision with getAccessibleButtonProps
**Learning:** The UI governance linter requires using `getAccessibleButtonProps` to enforce proper accessibility labeling and state on interactive elements like touchables. However, this helper inherently sets the `accessibilityRole="button"`. Manually defining `accessibilityRole` on components like `Badge` when `getAccessibleButtonProps` is used elsewhere in tests or typings can lead to type inference collisions or unexpected test failures if not properly synchronized.
**Action:** Always check existing tests and typings for `accessibilityRole` expectations when applying accessibility spread props. Remove redundant manual role assignments if the spread already provides them.
