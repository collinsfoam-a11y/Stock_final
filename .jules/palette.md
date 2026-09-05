## 2025-03-05 - Defensive ternary checks for accessibilityLabel fallbacks
**Learning:** Using simple logical OR fallbacks (e.g. `title + ". " + (message || "")`) for accessibility labels can result in trailing punctuation or "undefined" being announced by screen readers when optional props are omitted.
**Action:** Use defensive ternary checks (e.g., `message ? `${title}. ${message}` : title`) instead of simple logical OR fallbacks to ensure clean, grammatically correct screen reader output.
