# Dependency Risk Register & Package Health Audit

This document provides a comprehensive evaluation of the application's third-party dependencies, Expo SDK 55 compatibility, native module duplications, missing peer dependencies, and unused package risks.

---

## 1. Executive Dependency Assessment

- **Expo SDK Version**: `~55.0.28` (Current)
- **React Version**: `19.2.0`
- **React Native Version**: `0.83.10`
- **Dependency Health Rating**: 5.5 / 10
- **Critical Dependency Risks**:
  1. Native module duplication (`@sentry/react-native` v7.11.0 vs v5.5.0 via `sentry-expo`).
  2. Missing peer dependencies (`expo-application`, `expo-device`).
  3. Heavy unused production dependencies (`framer-motion`, `@react-three/fiber`, `@react-three/drei`, `@shopify/react-native-skia`, `lucide-react-native`).

---

## 2. Dependency Risk Table

| Package Name | Current Version | Risk Level | Required Action | Breaking-Change Probability | Validation Needed |
|---|---|---|---|---|---|
| `sentry-expo` | `^7.0.1` | **Critical** | **Remove** | Low | Verify `@sentry/react-native` direct init in `_layout.tsx` |
| `@sentry/react-native` | `^7.11.0` | **High** | **Retain & Configure** | Low | Test crash reporting and Jest mock configuration |
| `expo-application` | *(Missing)* | **High** | **Upgrade immediately** (Install) | Low | Run `npx expo-doctor` |
| `expo-device` | *(Missing)* | **High** | **Upgrade immediately** (Install) | Low | Run `npx expo-doctor` |
| `framer-motion` | `^11.0.0` | **Medium** | **Remove** | Low | Run `knip` to verify clean removal |
| `@react-three/fiber` | `^8.15.0` | **Medium** | **Remove** | Low | Run `knip` to verify clean removal |
| `@react-three/drei` | `^9.112.0` | **Medium** | **Remove** | Low | Run `knip` to verify clean removal |
| `@shopify/react-native-skia` | `^1.5.0` | **Medium** | **Remove** | Low | Check for any Skia Canvas usages |
| `lucide-react-native` | `^0.450.0` | **Medium** | **Remove** | Low | Ensure icon calls use `@expo/vector-icons` |
| `@types/framer-motion` | `^11.0.0` | **Low** | **Remove** | Low | Typecheck verification |
| `@shopify/flash-list` | `^2.0.2` | **Low** | **Retain** | Low | Verify FlatList replacements in large lists |
| `@tanstack/react-query` | `^5.101.4` | **Low** | **Retain** | Low | Verify query client cache clearing on logout |
| `zustand` | `^5.0.14` | **Low** | **Retain** | Low | Test store resets |
| `expo-router` | `~55.0.17` | **Low** | **Retain** | Low | Verify Expo Router file route cleanup |

---

## 3. Detailed Package Action Recommendations

### A. Deprecated Package Removal: `sentry-expo`
- **Context**: `sentry-expo` was deprecated starting in Expo SDK 50 in favor of direct `@sentry/react-native` usage.
- **Issue**: Including `sentry-expo@7.0.1` pulls in an obsolete transitive copy of `@sentry/react-native@5.5.0`, which conflicts with `@sentry/react-native@7.11.0` installed directly in `package.json`.
- **Action**: Uninstall `sentry-expo` via `pnpm remove sentry-expo`.

### B. Missing Native Peer Dependencies
- **Context**: Expo native modules require direct peer dependencies for device fingerprinting and application release metadata.
- **Issue**: `npx expo-doctor` fails due to missing `expo-application` and `expo-device`.
- **Action**: Execute `npx expo install expo-application expo-device`.

### C. Unused Heavy Dependency Cleanup
- **Context**: 5 packages in `dependencies` add ~15MB to `node_modules` and risk bundle inflation without providing active feature code.
- **Action**: Execute `pnpm remove framer-motion @react-three/fiber @react-three/drei @shopify/react-native-skia lucide-react-native @types/framer-motion`.

---

## 4. Package Lock & Overrides Analysis

In `frontend/package.json`, the `pnpm.overrides` configuration contains:
```json
"pnpm": {
  "overrides": {
    "ws@>=8.0.0 <8.21.0": ">=8.21.0",
    "brace-expansion@>=2.0.0 <2.1.3": ">=2.1.3",
    "uuid@<11.1.1": ">=11.1.1",
    "@babel/core": "7.29.7",
    "shell-quote@<=1.8.4": ">=1.9.0",
    "js-yaml": ">=4.3.0",
    "postcss@<=8.5.17": ">=8.5.18"
  }
}
```
**Evaluation**: The overrides successfully mitigate known transitive security vulnerabilities in `ws`, `brace-expansion`, and `shell-quote`. They should be retained.
