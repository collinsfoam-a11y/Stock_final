## 2026-05-25 - Accessible Icon Buttons
**Learning:** Icon-only buttons in React Native lack semantic meaning for screen readers, rendering them inaccessible by default.
**Action:** Always apply `getAccessibleButtonProps` to the touchable wrapper and `getDecorativeIconProps` to the icon from `src/utils/accessibility.ts`, while also adding light haptics for primary interactions.

## 2026-05-29 - Session and Header Micro-Interactions
**Learning:** Container components like cards and headers often have critical actions (e.g., SessionCard's Resume button, PremiumHeader's menu/logout actions) that are implemented as icon-only or generic text buttons without sufficient accessibility context or tactile feedback. Adding haptics to these high-frequency actions significantly improves the perception of responsiveness, while explicit ARIA labeling ensures screen reader users understand the context of the action (e.g., "Resume session [Name]" instead of just "Resume").
**Action:** When creating or updating interactive container components, ensure all primary actions use `haptics.light()` on press and include context-aware `getAccessibleButtonProps` to provide clear meaning.
