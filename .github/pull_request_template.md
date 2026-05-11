## Summary

-

## Validation

- [ ] Narrow relevant tests/checks were run, or the reason they were not run is documented.
- [ ] No persistent data, live deployment, or hard-to-reverse operation was performed without approval.

## UI/UX Governance

Complete this section for any PR that changes screens, forms, navigation, feedback, spacing, color, motion, or shared UI components.

- [ ] `docs/AGENT_UI_UX_RULES.md` was reviewed.
- [ ] Existing tokens and shared components were reused before adding new UI.
- [ ] No new visual system, token scale, semantic color meaning, navigation pattern, or UI library was introduced without architecture approval.
- [ ] Loading, empty, error, success, disabled, offline, and recovery states were considered.
- [ ] Online/offline state, pending sync, failed sync, retry, and last sync time are visible where operationally relevant.
- [ ] Touch targets are at least `44x44`, with `48x48` preferred for Android-heavy workflows.
- [ ] Icon-only controls have accessible labels.
- [ ] Color is not the only status indicator.
- [ ] Motion uses opacity/transform, respects reduced motion, and does not delay scan/count workflows.
- [ ] Dense operational screens prioritize task, state, exception, and next action over decoration.
- [ ] `cd frontend && npm run governance:ui:changed` was reviewed for changed UI files.
- [ ] `cd frontend && npm run governance:ui:changed:strict` passes or blocking findings are listed below.

## UX Severity Notes

- [ ] No unresolved P0 UI/UX findings.
- [ ] P1 UI/UX findings are fixed or explicitly risk-accepted.
- [ ] Remaining P2/P3 UI/UX findings are listed below.

Remaining findings:

-
