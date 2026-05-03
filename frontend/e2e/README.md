# Playwright E2E

The browser E2E suite for this repo lives in this folder and runs with Playwright.

## Common Commands

- Run all E2E tests: `npx playwright test`
- Run only critical-path E2E: `npm run e2e:critical`
- Run a single spec: `npx playwright test e2e/auth.spec.ts`
- Run the recount smoke suite: `npm run e2e:recount-smoke`
- Open the HTML report after a run: `npx playwright show-report`

## Hybrid Strategy

- Component/unit layer: run `npm test` (includes connectivity and API client behavior tests).
- API/backend layer: run `./scripts/python.sh -m pytest backend/tests/api backend/tests/services`.
- E2E layer: keep only critical user journeys in Playwright (`core-flow`, `supervisor-smoke`, `recount-assignment-ui`).

## Local Expectations

- Frontend config is defined in `frontend/playwright.config.ts`.
- The suite starts Expo web automatically unless `E2E_REUSE_EXISTING_SERVER=true`.
- Set `E2E_BACKEND_URL=http://127.0.0.1:8001` when you want Playwright to target the local backend.

## Projects

- `Desktop Chrome`
- `Mobile Chrome`
- `Mobile Safari`
- `iPad`
