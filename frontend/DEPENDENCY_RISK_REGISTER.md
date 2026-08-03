# Dependency Risk Register

**Target:** `frontend/` v2.1.0 · **Date:** 2026-08-02
**Package manager:** pnpm (`pnpm-lock.yaml`, 503 KB) with an npm-compatible script surface
**Node engine:** `>=20.19.4 <26.0.0` · **Runtime observed:** Node 24.18.0

## Method and its limits

Declared versions come from `package.json`. Installed versions were read directly from `node_modules/<pkg>/package.json`. Compatibility conclusions come from `npx expo-doctor`, `npx knip`, and import analysis of `src/` and `app/`.

**`npm install` was not run** — it would mutate `pnpm-lock.yaml` during a read-only audit. This is a documented substitution.

**No upgrade is recommended on the basis of "a newer version exists."** Registry latest-version data was not consulted, and recommending upgrades without compatibility analysis is explicitly out of scope. Every action below is justified by an observed defect (not installed / duplicated / unused / version-mismatched), not by age.

---

## 1. Summary

| Action | Count | Packages |
|---|---:|---|
| **Remove** | 10 | 9 phantom deps + `sentry-expo` |
| **Investigate** | 3 | `jest-environment-jsdom`, `@babel/core`, `@types/node` |
| **Retain** | ~60 | Everything else — no observed defect |
| Upgrade immediately | 0 | — |
| Upgrade after compatibility testing | 0 | — |
| Replace | 0 | — |

**Dependency-health rating: 3.5 / 10.** The core Expo/React Native stack is coherent and current. The rating is dragged down entirely by manifest hygiene: 9 declared-but-absent packages and a duplicated native module.

---

## 2. Critical: declared but not installed and not used (FE-P1-002)

All nine appear in `package.json` but resolve to `NOT INSTALLED`, and **no `.ts`/`.tsx` file imports any of them** — the only references are prose inside `src/docs/*.md`.

| Package | Declared | Installed | Risk | Action | Breaking-change probability | Validation needed |
|---|---|---|---|---|---|---|
| `framer-motion` | `^11.0.0` | ❌ none | A **React DOM** animation library; unusable in React Native. Would add web-only weight | **Remove** | None — zero imports | `npm run build:web` still exits 0 |
| `@react-three/fiber` | `^8.15.0` | ❌ none | 3D renderer; pulls the three.js tree. Very large | **Remove** | None | knip reports 0 unused deps |
| `@react-three/drei` | `^9.112.0` | ❌ none | three.js helper set; depends on the above | **Remove** | None | knip |
| `@shopify/react-native-skia` | `^1.5.0` | ❌ none | **Native module.** Requires a config plugin that is absent from `app.json`. Installing it would change the native build | **Remove** | None | `npx expo-doctor` 19/19; EAS build |
| `lucide-react-native` | `^0.450.0` | ❌ none | Second icon set alongside `@expo/vector-icons` (which **is** used) | **Remove** | None | knip |
| `nativewind` | `^4.0.0` | ❌ none | Not wired into `metro.config.js` or `babel.config.js`; no `withNativeWind`, no preset, no `global.css` | **Remove** | None | Build |
| `tailwindcss` | `^3.4.0` | ❌ none | Only consumed by the orphaned `tailwind.config.js` | **Remove** (+ delete `tailwind.config.js`) | None | Build |
| `daisyui` | `^4.12.0` | ❌ none | Tailwind plugin; same orphan | **Remove** | None | Build |
| `@types/framer-motion` | `^11.0.0` | ❌ none | Deprecated stub — Framer Motion ships its own types | **Remove** | None | `npx tsc --noEmit` exits 0 |

**Why this matters despite being "just manifest entries":** `package.json` and the installed tree currently disagree. Any clean `npm ci` / `pnpm install --frozen-lockfile` on CI or a new developer machine resolves differently from the machine this audit ran on. Skia in particular is a native module whose installation would alter the iOS/Android build without a corresponding Expo config plugin.

`tailwind.config.js` is dead configuration: it `require`s `nativewind/preset` and `daisyui`, neither installed, and nothing loads it. It also defines a **third** brand primary (`#3b82f6`) that conflicts with the design system (see `DESIGN_SYSTEM_AUDIT.md` §3.1).

---

## 3. Critical: duplicate native module (FE-P1-003)

| Package | Declared | Installed | Risk | Action | Breaking-change probability | Validation needed |
|---|---|---|---|---|---|---|
| `sentry-expo` | `^7.0.1` | `7.0.1` | **Duplicate native module + missing peers.** Pulls `@sentry/react-native@5.5.0` alongside the direct `7.11.0`. Registered as a *second* Expo config plugin. Not imported by any application file | **Remove** | **Low** — `app/_layout.tsx:8` imports only `@sentry/react-native`; `sentry-expo` has zero source imports | `npx expo-doctor` → 19/19; EAS build for iOS **and** Android; confirm a test exception reaches Sentry |
| `@sentry/react-native` | `^7.11.0` | `7.11.0` | The actively used SDK. Also the root cause of FE-P1-001 (ships untranspiled ESM) | **Retain** | — | Add to `jest.config.js` `transformIgnorePatterns` |

Verbatim `expo-doctor` output:

```
✖ Check that required peer dependencies are installed
  Missing peer dependency: expo-application   (required by sentry-expo)
  Missing peer dependency: expo-device        (required by sentry-expo)
  Your app may crash outside of Expo Go without these dependencies.

✖ Check that no duplicate dependencies are installed
  Found duplicates for @sentry/react-native:
    ├─ @sentry/react-native@7.11.0 (at: node_modules/@sentry/react-native)
    └─ @sentry/react-native@5.5.0  (via sentry-expo@7.0.1)
  Native builds may only contain one version of any given native module.
```

**Removing `sentry-expo` resolves both failing checks at once** — the missing peers are only required *by* `sentry-expo`, and it is the source of the duplicate. Three coordinated edits: `package.json` dependencies, `app.json` `plugins`, `jest.config.js` `transformIgnorePatterns`.

---

## 4. Investigate: version-coherence questions

| Package | Declared | Installed | Risk | Action | Breaking-change probability | Validation needed |
|---|---|---|---|---|---|---|
| `jest-environment-jsdom` | `^30.4.1` | `30.4.1` | **Major mismatch** with `jest@29.7.0`. Jest environments are version-coupled to the Jest core | **Investigate** | Medium if aligned to 29.x | Confirm which suites request `jsdom`; align to `^29` or document why 30 works. Note the suite currently runs `jest-expo`'s default environment, so the mismatch may be inert |
| `@babel/core` | `^8.0.1` (devDep) | `7.29.7` | **Manifest lies.** `pnpm.overrides` pins `"@babel/core": "7.29.7"`, and 7.29.7 is what resolves. The declared `^8.0.1` is never honoured | **Investigate** | High if the override is removed — Babel 8 is a major break for the Expo/Metro toolchain | Change the declaration to `^7.29.7` to match reality, or document the override's intent. Do **not** drop the override without a full build + test cycle |
| `@types/node` | `^25.9.5` | `25.9.5` | Types for a Node major well ahead of the `>=20.19.4 <26` engine range | **Investigate** | Low | Align to the Node version actually used in CI to avoid typing against unavailable APIs |

---

## 5. Retain: no observed defect

The core stack is internally consistent — `expo-doctor` passes 17 of 19 checks, and the two failures both trace to `sentry-expo`.

| Group | Packages | Declared | Installed | Note |
|---|---|---|---|---|
| Core runtime | `expo` | `~55.0.28` | `55.0.28` | ✅ |
| | `react` / `react-dom` | `19.2.0` | `19.2.0` | ✅ Exact pin, correct for RN |
| | `react-native` | `0.83.10` | `0.83.10` | ✅ |
| | `react-native-web` | `^0.21.2` | installed | ✅ |
| Routing | `expo-router` | `~55.0.17` | installed | ✅ `asyncRoutes.web` enabled |
| Animation | `react-native-reanimated` | `4.2.1` | `4.2.1` | ✅ Exact pin. Reanimated 4 requires `react-native-worklets` — correctly declared |
| | `react-native-worklets` | `0.7.4` | installed | ✅ Correct companion |
| | `react-native-gesture-handler` | `~2.30.1` | installed | ✅ |
| State | `zustand` | `^5.0.14` | `5.0.14` | ✅ `metro.config.js:29-42` forces the CJS middleware build to avoid an `import.meta` failure on web — a deliberate, documented workaround |
| Server state | `@tanstack/react-query` | `^5.101.4` | `5.101.4` | ✅ Cleared on logout |
| Networking | `axios` | `^1.19.0` | installed | ✅ Also pinned via `overrides` |
| Lists | `@shopify/flash-list` | `^2.0.2` | installed | ✅ Used in 17 files |
| Validation | `zod` | `^4.4.3` | installed | ✅ |
| Storage | `@react-native-async-storage/async-storage` | `2.2.0` | installed | ✅ Exact pin |
| | `expo-secure-store`, `expo-sqlite` | `~55.0.x` | installed | ✅ |
| Expo modules | 20 × `expo-*` at `~55.0.x` | — | installed | ✅ All aligned to SDK 55 |
| Icons/fonts | `@expo/vector-icons`, `@expo-google-fonts/inter` | — | installed | ✅ Single icon set in use |
| Testing | `jest` `~29.7.0`, `jest-expo` `~55.0.20`, `@testing-library/react-native` `^13.3.3` | — | installed | ✅ except FE-P1-001 config |
| E2E | `@playwright/test` / `playwright` `^1.62.1` | — | installed | ✅ 10 specs |
| Tooling | `typescript` `^5.9.3`, `eslint` `^8.57.1`, `prettier` `^3.9.6`, `knip` `^6.31.0` | — | installed | ✅ |

### Security-hardening overrides — retain

`package.json` carries deliberate transitive pins in both `overrides` and `pnpm.overrides`:

```jsonc
"ws": ">=8.21.0", "brace-expansion": ">=2.1.3", "uuid": ">=11.1.1",
"tmp": "0.2.7", "shell-quote@<=1.8.4": ">=1.9.0",
"js-yaml": ">=4.3.0", "postcss@<=8.5.17": ">=8.5.18"
```

These are advisory-driven forced upgrades of transitive dependencies. **Retain.** Note that `overrides` (npm) and `pnpm.overrides` (pnpm) are maintained in parallel with slightly different contents — worth consolidating, since only `pnpm.overrides` takes effect under the actual package manager (**P3**).

---

## 6. Upgrade constraints and blockers

| Constraint | Detail | Consequence |
|---|---|---|
| **Expo SDK 55 pins the module range** | 20 `expo-*` packages at `~55.0.x`, plus `react-native@0.83.10` and `react@19.2.0` | None of these may be upgraded independently. Move them together, driven by an Expo SDK release, and validate with `npx expo install --check` |
| **`sentry-expo` blocks Sentry maintenance** | It transitively holds `@sentry/react-native@5.5.0` | Cannot cleanly maintain the v7 SDK until `sentry-expo` is removed |
| **`@babel/core` override masks the declaration** | `pnpm.overrides` pins 7.29.7 against a declared `^8.0.1` | Any future Babel 8 migration must remove the override *and* validate Metro, `jest-expo`, `babel-plugin-module-resolver`, `babel-plugin-transform-import-meta` and the Reanimated plugin together |
| **`react-native-reanimated` 4 ↔ `react-native-worklets`** | Both exact-pinned (`4.2.1`, `0.7.4`) | Must be upgraded as a pair |
| **Zustand ESM/`import.meta`** | `metro.config.js` force-resolves `zustand/middleware` to CJS | A Zustand upgrade must be re-validated on web/Safari, and the workaround re-checked |
| **9 phantom packages** | Manifest ≠ lockfile ≠ installed tree | Any `--frozen-lockfile` install behaves differently from the audited machine. **Fix before any other dependency work.** |

---

## 7. Prioritised dependency actions

| # | Action | Priority | Effort | Risk | Validation |
|---|---|---|---|---|---|
| 1 | Remove the 9 phantom packages from `package.json`; delete `tailwind.config.js` | **P1** | XS | Very low — zero imports | `npx knip` → 0 unused deps; `npm run build:web` exits 0; `npx tsc --noEmit` exits 0 |
| 2 | Remove `sentry-expo` from `package.json` **and** `app.json` `plugins` | **P1** | XS | Low | `npx expo-doctor` → 19/19; EAS build iOS + Android; test exception reaches Sentry |
| 3 | Add `@sentry/react-native` + `@sentry/core` to `jest.config.js` `transformIgnorePatterns`; drop `sentry-expo` from the same pattern | **P1** | XS | None | `npm test` → 0 failed suites |
| 4 | Regenerate `pnpm-lock.yaml` after 1-3 | **P1** | XS | Low | `pnpm install --frozen-lockfile` succeeds on a clean checkout |
| 5 | Align `@babel/core` declaration with the pinned 7.29.7, or document the override | P2 | XS | None if aligned to reality | Build + full test run |
| 6 | Resolve the `jest-environment-jsdom` 30 vs `jest` 29 mismatch | P2 | S | Medium | `npm test` unchanged; confirm which suites use `jsdom` |
| 7 | Align `@types/node` with the CI Node version | P3 | XS | Low | `npx tsc --noEmit` exits 0 |
| 8 | Consolidate `overrides` and `pnpm.overrides` into one source | P3 | XS | Low | `pnpm install` resolves identically |
| 9 | Add `npx expo-doctor` as a hard gate in `npm run ci` | P2 | XS | None | CI fails on any future duplicate native module |

---

## 8. Recommended CI additions

The repository already guards dependency drift with `scripts/check-dependency-regression.cjs` (`deps:baseline` / `deps:guard`). Two gaps remain:

1. **`expo-doctor` is not in `npm run ci`.** The current `ci` script is `lint && typecheck && test && governance:ui:strict && knip:check`. Adding `doctor:expo` would have caught FE-P1-003 automatically.
2. **Nothing verifies manifest ↔ lockfile ↔ installed-tree agreement.** A `pnpm install --frozen-lockfile` step in CI would have caught all 9 phantom packages at the moment they were declared.
