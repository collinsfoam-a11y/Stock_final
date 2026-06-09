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
## 2024-10-27 - [A11y Standard for Icon-Only Buttons]
**Learning:** Found an explicit codebase standard for how icon-only buttons need to be made accessible.
**Action:** Use standard built-in React Native accessibility properties directly on the elements (`accessibilityRole`, `accessibilityLabel` on the button wrapper, and `accessibilityElementsHidden={true}`, `importantForAccessibility="no"`, `aria-hidden={true}` on the icon) rather than using custom utility wrappers.
