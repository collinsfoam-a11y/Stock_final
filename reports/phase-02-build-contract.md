# Phase 02 - Repository Structure & Build Contract Audit

## Objective
Determine whether the repository layout, build system, CI configuration, Docker configuration, dependency contract, and documentation all describe the same project architecture.

## Scope
- Package Manager Discovery
- Lockfile Audit
- CI Consistency Audit
- Repository Structure Contract
- Build Contract Audit
- Environment Contract Audit
- Documentation Consistency Audit

## Commands Executed
- `cat .gitignore frontend/.gitignore | grep -i lock`
- Viewed files: `.env.production.example`, `backend/.env.example`, `ARCHITECTURE.md`, `README.md`, `docs/TESTING_GUIDE.md`, `scripts/start_backend.sh`, `scripts/start_frontend.sh`, `backend/scripts/validate_env.py`, `docker-compose.production.yml`.

## Evidence
- `frontend/pnpm-workspace.yaml` exists.
- Root `.gitignore` explicitly ignores `frontend/package-lock.json` and states `pnpm is the canonical frontend package manager`.
- CI workflows and Dockerfiles use `pnpm install --frozen-lockfile`.
- `frontend/pnpm-lock.yaml` is completely missing.
- `frontend/package.json` internal scripts heavily rely on `npm run` and `npm-run-all`.
- `.github/workflows/main.yml` relies on `npm run build:web` despite installing with `pnpm`.
- `TESTING_GUIDE.md` explicitly lists `npm run ci`.
- `validate_env.py` excludes `PIN_SALT` from `required_keys`, but it is marked as `CRITICAL SECURITY` in `.env.example`.
- `docker-compose.production.yml` strictly enforces `SQL_SERVER_HOST:?is required`, whereas it is optional in `validate_env.py`.

## Findings
- **Missing Lockfile**: `pnpm-lock.yaml` is absent, permanently breaking deterministic installation paths.
- **Toolchain Drift**: Severe mixing of `npm` and `pnpm` across `Makefile`, Bash scripts, and CI runners.
- **Environment Drift**: `validate_env.py` fails to enforce security prerequisites (`PIN_SALT`) and disagrees with Docker Compose regarding backend environment requirements.
- **Documentation Drift**: Developer onboarding documentation directs users towards the wrong package manager (`npm`), further contributing to drift.

## Supporting Quotes
- `.gitignore` L70: `# pnpm is the canonical frontend package manager (see frontend/Dockerfile)`
- `frontend/Dockerfile` L15: `RUN pnpm install --frozen-lockfile`
- `backend/scripts/validate_env.py` L24: `required_keys = ["MONGO_URL", "DB_NAME", "JWT_SECRET", "JWT_REFRESH_SECRET"]` (Missing `PIN_SALT`).
- `docker-compose.production.yml` L85: `SQL_SERVER_HOST: ${SQL_SERVER_HOST:?SQL_SERVER_HOST is required}`

## Tables

### Dependency Contract Matrix
| Area | npm | pnpm | yarn | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **Root** | - | - | - | No root `package.json` or lockfiles exist. |
| **Frontend** | Yes | Yes | No | `package-lock.json` exists on disk. `pnpm-workspace.yaml` exists. |
| **CI** | Yes | Yes | No | Configures `pnpm@10`, runs `pnpm install --frozen-lockfile`, but executes scripts via `npm run`. |
| **Makefile** | No | Yes | No | Defines tasks like `corepack pnpm install --frozen-lockfile`. |

### Environment Contract Matrix
| Variable | Required By | Template | Compose | Validation Script | Match |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `JWT_SECRET` | Auth | Yes | Yes | Yes | Yes |
| `PIN_SALT` | Auth | Yes | Yes | **No** | **No** |
| `SQL_SERVER_HOST` | ERP Sync | Optional | **Strict** | Optional | **No** |

## Diagrams
N/A

## Risks
- **Repository Drift (High):** Missing `pnpm-lock.yaml` ensures that any automated CI, Docker build, or Makefile installation using `--frozen-lockfile` fails immediately.
- **Environment Drift (High):** Backend instances can boot up without `PIN_SALT`, compromising local authentication security hashing guarantees.
- **Toolchain Drift (Medium):** Running `npm` locally vs `pnpm` in CI leads to divergent module resolution paths.

## Confidence
**Low** (Dependency paths are fundamentally broken across all automation boundaries).

## Blockers
- Missing `pnpm-lock.yaml` prevents deterministic installation.
- Environment validation drift prevents secure backend start guarantees.

## Conclusion
The repository explicitly designates `pnpm` as canonical but heavily executes `npm`, resulting in the loss of its actual lockfile (`pnpm-lock.yaml`). CI and `Makefile` operations will fail by default. The environment contract is inconsistent between Python validation and Docker compose specifications.

## Next Phase
Phase 03 - Runtime Governance & Production Evidence Audit

## Change History
- **Time:** 2026-07-25T13:16:14+05:30
- **Branch:** chore/cleanup-stale-artifacts
- **Commit:** 83e49a373837080b7bde01c6ae626ec89b8a18e6
- **Files inspected:** `Makefile`, `Dockerfile`, `main.yml`, `.gitignore`, `validate_env.py`, `.env.example`, `docker-compose.production.yml`
- **Commands executed:** File discovery, `cat` on `.gitignore`
- **Evidence collected:** Toolchain drift, Package Manager contract, Environment variable inconsistencies
- **Report version:** 1.0
