# Playwright E2E

The browser E2E suite for this repo lives in this folder and runs with Playwright.

## Common Commands

- Run all E2E tests: `npx playwright test`
- Run a single spec: `npx playwright test e2e/auth.spec.ts`
- Run the recount smoke suite: `npm run e2e:recount-smoke`
- Open the HTML report after a run: `npx playwright show-report`

## Auth State

The suite generates fresh Playwright `storageState` files before every run:

```text
playwright/.auth/
  staff.json
  supervisor.json
  admin.json
```

These files are created by `tests/auth.setup.ts` and are ignored by git.

Required shell environment variables:

- `E2E_AUTH_STAFF_USERNAME`
- `E2E_AUTH_STAFF_PASSWORD`
- `E2E_AUTH_SUPERVISOR_USERNAME`
- `E2E_AUTH_SUPERVISOR_PASSWORD`
- `E2E_AUTH_ADMIN_USERNAME`
- `E2E_AUTH_ADMIN_PASSWORD`

## Local Expectations

- Frontend config is defined in `frontend/playwright.config.ts`.
- The suite starts Expo web automatically. Reuse an existing server only when you explicitly set `E2E_REUSE_EXISTING_SERVER=true`.
- Set `E2E_BACKEND_URL=http://localhost:8001` when you want Playwright to target the local backend.

## Projects

- `setup`
- `public-desktop`
- `staff-desktop`
- `supervisor-desktop`
- `admin-desktop`
- `supervisor-mobile`
