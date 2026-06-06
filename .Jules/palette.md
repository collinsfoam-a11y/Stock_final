## 2026-05-25 - Accessible Icon Buttons
**Learning:** Icon-only buttons in React Native lack semantic meaning for screen readers, rendering them inaccessible by default.
**Action:** Always apply `getAccessibleButtonProps` to the touchable wrapper and `getDecorativeIconProps` to the icon from `src/utils/accessibility.ts`, while also adding light haptics for primary interactions.

## 2026-05-26 - Web Verification Constraints
**Learning:** The `secureStorage` service on web utilizes a memory-only store for sensitive authentication keys (`auth_token`, `auth_user`, etc.), which makes standard Playwright `localStorage` seeding ineffective for bypassing the login screen in E2E tests.
**Action:** Use actual login flows or mock the login API when performing visual verification on the web platform.
## $(date +%Y-%m-%d) - Forms and Inputs Accessibility Optimization
**Learning:** Found that custom Radio, Checkbox, and Stepper form components in React Native need explicit `accessibilityRole` and manually mapped `accessibilityState` attributes. Also discovered that raw `<Ionicons>` often need to be explicitly hidden from screen readers using a utility `getDecorativeIconProps()` function to avoid redundant and confusing readouts. Wait, it is crucial to remember that modifying components using ad-hoc python scripts might leave automation artifacts behind - always delete temp files before wrapping up!
**Action:** When creating or updating custom interactive components (like switches, checkboxes, or steppers), actively map internal state to `accessibilityState={{ disabled, checked, etc }}` and wrap decorative icons properly to enhance the screen reader experience.
