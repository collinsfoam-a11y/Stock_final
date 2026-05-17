# Playwright E2E

The browser E2E suite for this repo lives in this folder and runs with Playwright.

## Common Commands

- Run all E2E tests: `npx playwright test`
- Run a single spec: `npx playwright test e2e/auth.spec.ts`
- Run the recount smoke suite: `npm run e2e:recount-smoke`
- Open the HTML report after a run: `npx playwright show-report`

## Local Expectations

- Frontend config is defined in `frontend/playwright.config.ts`.
- The suite starts Expo web automatically unless `E2E_REUSE_EXISTING_SERVER=true`.
- Set `E2E_BACKEND_URL=http://127.0.0.1:8001` when you want Playwright to target the local backend.

## Projects

- `Desktop Chrome`
- `Mobile Chrome`
- `Mobile Safari`
- `iPad`
