## 2026-05-25 - Accessible Icon Buttons
**Learning:** Icon-only buttons in React Native lack semantic meaning for screen readers, rendering them inaccessible by default.
**Action:** Always apply `getAccessibleButtonProps` to the touchable wrapper and `getDecorativeIconProps` to the icon from `src/utils/accessibility.ts`, while also adding light haptics for primary interactions.

## 2026-05-26 - Web Verification Constraints
**Learning:** The `secureStorage` service on web utilizes a memory-only store for sensitive authentication keys (`auth_token`, `auth_user`, etc.), which makes standard Playwright `localStorage` seeding ineffective for bypassing the login screen in E2E tests.
**Action:** Use actual login flows or mock the login API when performing visual verification on the web platform.
## 2026-06-03 - Forms and Inputs Accessibility Optimization
**Learning:** Found that custom Radio, Checkbox, and Stepper form components in React Native need explicit `accessibilityRole` and manually mapped `accessibilityState` attributes. Also discovered that raw `<Ionicons>` often need to be explicitly hidden from screen readers using a utility `getDecorativeIconProps()` function to avoid redundant and confusing readouts.
**Action:** When creating or updating custom interactive components (like switches, checkboxes, or steppers), actively map internal state to `accessibilityState={{ disabled, checked, etc }}` and wrap decorative icons properly to enhance the screen reader experience.

## 2026-06-03 - Adding Accessible Props to Icon-only Close Button
**Learning:** The custom `getAccessibleButtonProps` utility from `@/utils/accessibility` was used to provide the missing `accessibilityRole` and `accessibilityLabel` properties to a `TouchableOpacity` component representing an icon-only close button. The icon itself (`Ionicons`) received `getDecorativeIconProps()` so that screen readers hide the decorative visual element.
**Action:** Always verify custom utility imports using terminal commands before modifying files. Add screen reader labels to icon-only buttons to improve UI accessibility.

## 2026-06-03 - Verification of Hidden Decorative Icons in Jest Tests
**Learning:** Checking that decorative icons are hidden from screen readers can be tested in React Native using `@testing-library/react-native` by resolving the components (e.g., `Ionicons` via `UNSAFE_getAllByType`) and verifying properties like `accessibilityElementsHidden: true`, `importantForAccessibility: "no"`, and `"aria-hidden": true`.
**Action:** Include dedicated assertions on icon components in unit tests when applying `getDecorativeIconProps` to guarantee they are completely hidden from accessibility trees.

## 2026-07-26 - Defensive Check on Accessibility Fallback Stringification
**Learning:** When creating default `accessibilityLabel` formats via string interpolation/template literals (e.g., `Badge: ${label}`), optional or nullable props can lead to awkward screen reader output such as "Badge: undefined" if the prop is omitted.
**Action:** Always wrap template literal fallback evaluations in defensive checks (e.g., `defaultLabel ? \`Badge: \${defaultLabel}\` : undefined`) to ensure nullable fields are never stringified into literal "undefined" or empty states for screen readers.

## 2026-07-27 - Consistency of Core UI Toggles
**Learning:** Mixing native `react-native` primitive inputs (like `Switch`) with custom animated design-system `Switch` components leads to visually jarring in-app inconsistencies and uncoordinated touch targets.
**Action:** Ensure settings rows and other layout components use the shared design-system `Switch` component to maintain polished transitions, unified colors, haptic feedback, and minimum 44x44 standard touch targets.

## 2026-07-28 - Screen Reader Optimization for Inline Status and Alerts
**Learning:** Status views and inline alerts with background containers and icon components are often treated as distinct elements by screen readers, causing repetitive, confusing announcements. By setting `accessible={true}` on the parent container, providing a descriptive unified label, and hiding the decorative icon using `getDecorativeIconProps()`, we ensure a single clean announcement for assistive technologies.
**Action:** Always make the parent container of non-interactive status blocks and inline alerts explicitly accessible (`accessible={true}`), declare the appropriate semantic `accessibilityRole`, and hide all inner decorative icon components.
