# Release Readiness

Status: Ready pending deploy verification

## Repository / CI

- Release workflow (`.github/workflows/release.yml`) startup failure fixed
  (duplicate top-level `env:` key removed). The workflow now parses and runs
  on `v*` tags and `workflow_dispatch`.
- Open pull-request backlog triaged and burned down: clean changes merged,
  duplicates/superseded closed, and conflicting branches that needed a
  deps-enabled environment closed with notes for re-cut.
- `main` CI/CD pipeline is green on every merge.

## Verified (most recent full local run)

### 1. Frontend Typecheck

- `npm run typecheck`
- Result: passed

### 2. Frontend Lint

- `npm run lint`
- Result: passed

### 3. Frontend Tests

- `npm test -- --runInBand`
- Result: `55/55` suites passed, `199/199` tests passed
  (network-status utility tests added on top of this baseline)

### 4. Backend Tests

- `python -m pytest backend/tests/ -q`
- Result: `787 passed`, `11 skipped`, `1 deselected`
  (user-permission modifier tests added on top of this baseline)

### 5. Validation Scripts

- `bash ./scripts/python.sh scripts/health_check_summary.py` — passed
- `bash ./scripts/final_system_validation.sh` — passed

### 6. Android Release Build

- Release APK rebuilt from the latest frontend state
- Output: `frontend/android/app/build/outputs/apk/release/app-release.apk`

## Outstanding before "shipped"

- [ ] Review and merge the dashboard WebSocket path-token hardening
      (removes the legacy `/dashboard/ws/{token}` endpoint; keeps the
      admin/supervisor role check).
- [ ] Run the Release workflow (`workflow_dispatch`) to prove the GHCR
      image build + GitHub Release path end-to-end. Requires GHCR package
      write permission and `EXPO_TOKEN`.
- [ ] Validate the production deploy path: `make deploy-check`, pull the
      GHCR images on the host, and `./scripts/verify_backup_restore.sh`
      against a reachable MongoDB.
- [ ] Confirm deploy secrets/vars are configured: `DEPLOY_*`,
      `DEPLOY_SSH_KEY`, `DEPLOY_ENV_FILE`, `DEPLOY_REGISTRY_*`,
      `EXPO_TOKEN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
- [ ] Tag a release (`v*`) once the above are green.

## Notes

- `backend/.env` exists locally and is gitignored.
- `final_system_validation.sh` warns when optional tools/credentials are
  missing (`mongosh`, `redis-cli`, `AUTH_USERNAME` / `AUTH_PASSWORD`); these
  warnings do not block validation.
