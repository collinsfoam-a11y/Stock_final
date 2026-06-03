## 2026-05-25 - Accessible Icon Buttons
**Learning:** Icon-only buttons in React Native lack semantic meaning for screen readers, rendering them inaccessible by default.
**Action:** Always apply `getAccessibleButtonProps` to the touchable wrapper and `getDecorativeIconProps` to the icon from `src/utils/accessibility.ts`, while also adding light haptics for primary interactions.

## 2026-05-26 - Web Verification Constraints
**Learning:** The `secureStorage` service on web utilizes a memory-only store for sensitive authentication keys (`auth_token`, `auth_user`, etc.), which makes standard Playwright `localStorage` seeding ineffective for bypassing the login screen in E2E tests.
**Action:** Use actual login flows or mock the login API when performing visual verification on the web platform.
## 2026-06-03 - Adding Accessible Props to Icon-only Close Button
**Learning:** The custom `getAccessibleButtonProps` utility from `@/utils/accessibility` was used to provide the missing `accessibilityRole` and `accessibilityLabel` properties to a `TouchableOpacity` component representing an icon-only close button. The icon itself (`Ionicons`) received `getDecorativeIconProps()` so that screen readers hide the decorative visual element.
**Action:** Always verify custom utility imports using terminal commands before modifying files. Add screen reader labels to icon-only buttons to improve UI accessibility.
