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
## 2024-06-12 - Explicit Labeling of Complex Status Readouts
**Learning:** For components with dynamic, complex states (like `SessionCard` with combinations of name, completion status, and dynamic item counts), standard structural markup isn't always enough to create a cohesive screen reader experience. Screen readers often fragment these separate text nodes, leading to disjointed readouts.
**Action:** When constructing `accessibilityLabel` for complex status cards, concatenate the primary identifying information (e.g., Session Name), its current status, and quantitative metrics (e.g., `itemCount` of `totalItems`) into a single, comprehensive template string (e.g., `accessibilityLabel={\`Session: \${name}. Status: \${statusInfo.label}. \${totalItems ? \\\`\${itemCount} of \${totalItems} items\\\` : \\\`\${itemCount} items\\\`}\`}`). This ensures the screen reader provides the full context in one continuous, understandable phrase rather than piecemeal chunks. Apply this pattern to other complex summary cards.
