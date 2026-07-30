## 2024-07-30 - Abstracting Haptics and Accessibility in React Native

**Learning:** Direct usage of `expo-haptics` and manual accessibility props (like `accessibilityRole="button"`) in complex Animated components often leads to inconsistent cross-platform behavior and redundant screen reader announcements for decorative icons.

**Action:** Consistently use the centralized `haptics` service (`@/services/haptics`) to safely abstract platform checks (e.g., bypassing web safely) and utilize `@/utils/accessibility` helpers (`getAccessibleButtonProps`, `getDecorativeIconProps`) to ensure uniform accessibility states across all interactive elements, particularly for icon-only buttons.
