# Repository Standards

## Source of Truth

- CI: GitHub Actions workflows in `.github/workflows/` define the canonical checks.
- Tooling: `Makefile` targets are the local equivalents of CI checks.
- Additional CI systems (GitLab/Jenkins) should stay aligned with these versions and commands.

## Runtime Versions

- Python: 3.11
- Node.js: 20.19.4 (see `frontend/package.json` engines)
- Package manager: pnpm (used by CI)

## Quality Gates

- Repository hygiene: `bash scripts/check_repo_hygiene.sh`
- Backend:
  - Lint/format check: `make python-lint`
  - Format: `make python-format`
  - Typecheck: `make python-typecheck` (non-blocking) / `make python-typecheck-strict`
  - Tests: `make python-test`
- Frontend:
  - Lint: `pnpm -C frontend run lint`
  - Typecheck: `pnpm -C frontend run typecheck`
  - Tests: `pnpm -C frontend run test`
  - Format: `pnpm -C frontend run format:check`

## Secrets

- Use `.env.example` templates and keep real environment files untracked.
- Pre-commit runs `detect-secrets` locally. CI additionally runs TruffleHog.

## Ownership

Update `.github/CODEOWNERS` with the correct GitHub users/teams for your organization.

