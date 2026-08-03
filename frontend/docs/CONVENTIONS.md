# Frontend Conventions

Conventions that keep the Expo Router app maintainable. Several of these encode
lessons from real bugs; the route-hygiene test (`app/__tests__/route-hygiene.test.ts`)
enforces the routing ones automatically.

## Routing: `app/` holds thin route files only

Expo Router turns **every file** under `app/` into a navigable route. That has
sharp edges:

- **No `*.screen.tsx` (or any non-platform second extension).** `screen` is not a
  valid platform, so `users.screen.tsx` registers a phantom `/admin/users.screen`
  route. Put the screen implementation **directly in the route file**, or in
  `src/screens/` and re-export. Do **not** use a `foo.tsx` wrapper that re-exports
  `foo.screen.tsx` — that leaves the phantom route live.
- **No component files under `app/`.** `app/staff/components/SectionLists.tsx`
  becomes `/staff/components/SectionLists`. Components live in `src/components/`.
- **No `*.styles.ts` under `app/`.** Same reason — `scan.styles.ts` becomes
  `/staff/scan.styles`. Screen styles live in `src/styles/screens/`.

Valid second extensions are platform suffixes only: `.ios`, `.android`,
`.native`, `.web` (e.g. `index.web.tsx`).

### Where screen code lives

| Size / role | Location |
|---|---|
| Thin route (redirect, small screen) | `app/**` directly |
| Heavy screen logic | `src/screens/**`, re-exported from the `app/**` route file |
| Screen styles | `src/styles/screens/<Name>.styles.ts` |
| Reusable UI | `src/components/**` |

## Navigation config is single-source

Sidebar/drawer nav items live in shared config, not inline in components:

- `src/components/navigation/adminNavShared.ts` → `ADMIN_NAV_GROUPS`
- `src/components/navigation/supervisorNavShared.ts` → `SUPERVISOR_NAV_GROUPS`

The web sidebars and the mobile `MobileNavDrawer` both consume these, so the two
can never drift. Add a nav item in one place.

## Large files

Target < 800 lines per file. When a screen grows past it:

1. Extract the `StyleSheet`/`createStyles` block to `src/styles/screens/<Name>.styles.ts`.
2. Extract self-contained presentational sections (terminal states, panels) into
   `src/components/<feature>/` — start with the ones **off the hot path** to keep
   risk low.

See `docs/TECH-DEBT.md` for the current list of files over the limit.

## Dead code

Run `npm run knip:check` to find unused files, exports, and dependencies. It runs as an
**advisory** (non-blocking) step in CI. Before adding a new component, check that
an equivalent isn't already present but unwired.

## Verification before pushing

- `npm run typecheck` — 0 errors
- `npm test` — unit suite (also gates in CI)
- `npm run lint` — eslint + UI governance on changed files
