# Testing Guide

This repository uses three test layers:

- Frontend unit/integration checks: `cd frontend && npm run ci`
- Backend tests: `./scripts/python.sh -m pytest backend/tests`
- Browser E2E: `cd frontend && npx playwright test`

## Backend Notes

- Install backend dependencies with `./scripts/python.sh -m pip install -r backend/requirements.dev.txt`.
- The default pytest run excludes tests marked `manual`.
- Manual tests are intended for a running local stack and should be invoked explicitly.

## Frontend Notes

- `npm run ci` runs lint, typecheck, and Jest.
- `npm run e2e:recount-smoke` runs the focused recount Playwright smoke suite against a local backend.

## E2E Notes

- Playwright config lives in `frontend/playwright.config.ts`.
- The suite expects the web app on the configured `E2E_BASE_URL`.
- For the local smoke flow, keep the backend available at `http://127.0.0.1:8001`.
