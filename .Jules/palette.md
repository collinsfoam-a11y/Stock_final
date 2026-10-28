## 2025-01-31 - DataTable AppTouchable Haptics and A11y
**Learning:** Found that custom AppTouchable elements in DataTable lacked expected haptic feedback on interactions (sorting, pagination, row selection) and proper accessibility prop spreading.
**Action:** Always ensure custom touchable implementations utilize `haptics.light()` or appropriate haptics and spread `getAccessibleButtonProps` for robust UX and accessibility.
