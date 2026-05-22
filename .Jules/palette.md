## 2024-05-15 - [ARIA labels for icon-only buttons]
**Learning:** Icon-only buttons using `TouchableOpacity` and `Ionicons` lack screen reader context.
**Action:** Add accessibility props directly to wrapper components around icon-only buttons.

## 2026-05-22 - [Icon-only buttons missing haptics and accessibility states]
**Learning:** Icon-only buttons, such as RefreshButton, lack crucial accessibility roles, labels, and state tracking (like busy or disabled). They also lack tactile feedback, reducing mobile UX quality.
**Action:** Ensure all icon-only interactive elements receive `accessibilityRole="button"`, descriptive `accessibilityLabel`, and dynamic `accessibilityState` props. Additionally, integrate `haptics.light()` on press to provide subtle user feedback.
