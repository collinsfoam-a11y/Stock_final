## 2026-10-10 - Adding accessibility props to native Input
**Learning:** React Native's `TextInput` does not inherit accessibility context from its visual surroundings like `<Text>` labels. Missing explicit `accessibilityLabel` and `accessibilityState` causes screen readers to announce inputs generically (e.g. "text field"), creating friction for visually impaired users.
**Action:** Always map standard form label and placeholder props to `accessibilityLabel`, and dynamically sync `editable` prop to `accessibilityState={{ disabled }}`.
