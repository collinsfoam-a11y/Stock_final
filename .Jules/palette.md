## 2026-05-20 - ScreenHeader AnimatedButton Accessibility
**Learning:** Icon-only buttons wrapped in custom animated components (like AnimatedButton using TouchableOpacity) frequently lack accessibility roles and labels by default, making them invisible or confusing to screen readers.
**Action:** When encountering or creating custom wrapper components for touchable elements, ensure properties like accessibilityRole and accessibilityLabel are explicitly passed down to the underlying TouchableOpacity or Pressable component.
