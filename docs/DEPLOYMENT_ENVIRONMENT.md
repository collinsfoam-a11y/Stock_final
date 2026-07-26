# Stock Verify - Production Environment Contract

This is the canonical reference for every environment variable the backend
and frontend read in production. It documents the *actual* variable names
used by the code (which in a few cases differ from generic names), whether
each one fails fast on boot if missing/invalid, and where to set it.

Source of truth for values: [`.env.production.example`](../.env.production.example)
(Docker Compose stack) and [`backend/.env.example`](../backend/.env.example)
(bare backend process). Copy one of these to a real `.env.prod` /
`backend/.env` and fill in real values -- **never commit the filled-in
file**. Both examples only contain placeholders; anything in the repo
containing a real secret is a defect.

## Backend

| Variable | Required in prod? | Fails fast? | Notes |
|---|---|---|---|
| `ENVIRONMENT` | Yes | Yes -- `backend/config.py::_enforce_production_guards` rejects any value outside `development, test, staging, production` | Must be `production` for the guards below to activate |
| `JWT_SECRET` | Yes | Yes -- Pydantic validator, min 32 chars, rejects known placeholder values | Generate with `python backend/utils/secret_generator.py` |
| `JWT_REFRESH_SECRET` | Yes | Yes -- same validator pattern as `JWT_SECRET` | Must differ from `JWT_SECRET` |
| `PIN_SALT` | Yes | Yes -- same fail-fast validator pattern as `JWT_SECRET` (added this pass; previously only checked lazily at first PIN-hash call, which let a broken deployment boot healthy and then 500 on first PIN login) | Used to salt the PIN lookup hash (`backend/utils/crypto_utils.py`) |
| `MONGO_URL` (aliases: `MONGODB_URI`, `MONGODB_URL`) | Yes | Yes -- required, no silent empty default | Full connection string including credentials |
| `DB_NAME` | Yes | Yes | Mongo database name |
| `SQL_SERVER_HOST` / `SQL_SERVER_DATABASE` / `SQL_SERVER_USER` / `SQL_SERVER_PASSWORD` | No (SQL Server is optional/read-only per business rule) | Partial -- if `SQL_SERVER_HOST` is set without `SQL_SERVER_DATABASE`, boot fails; `docker-compose.production.yml` additionally hard-requires all four via `:?` | Read-only ERP source; app runs without it |
| `CORS_ALLOW_ORIGINS` (alias: `CORS_ORIGINS`) | Yes | Partial -- if unset in non-development, the app logs a warning and serves **zero** allowed origins (fails closed, not open) rather than defaulting to `*` | Comma-separated exact origins, e.g. `https://stock-verify.example.com` |
| `ALLOWED_HOSTS` | Yes | Partial -- if unset in non-development, Host-header validation is simply disabled (logged warning), not set to `*` | Comma-separated hostnames for `TrustedHostMiddleware` |
| `PUBLIC_API_BASE_URL` | N/A -- no such variable in this codebase | -- | The frontend calls the backend same-origin through the nginx `/api/` proxy (see `EXPO_PUBLIC_BACKEND_URL` below); there is no separate backend-side "public base URL" setting |
| `LOG_LEVEL` | No (defaults to `INFO`) | Yes -- validator rejects anything outside `DEBUG/INFO/WARNING/ERROR/CRITICAL` | |
| `EXPORT_STORAGE_PATH` | N/A -- no such variable in this codebase | -- | ERPNext export files (CSV/XLSX) are generated in-memory (`io.BytesIO`) and streamed as the HTTP response; nothing is written to a filesystem export directory. See `backend/services/erpnext_export_file_service.py` |
| `UPLOAD_STORAGE_PATH` | N/A -- no such variable in this codebase | -- | Evidence photos are stored as `photo_base64` fields inside MongoDB count-line documents, not on a filesystem upload directory. MongoDB's own volume/backup covers them |
| `BACKUP_STORAGE_PATH` | No (defaults to `<repo>/backups/mongo`) | No | Used by `scripts/backup_mongo.sh`; override by editing the script or redirecting `BACKUP_DIR` if you fork it. See [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md) |
| `DEBUG` | Yes (must be `false`) | Yes -- `_enforce_production_guards` raises if `DEBUG=true` and `ENVIRONMENT=production` | |
| `HOT_RELOAD` | Yes (must be `false`/unset) | Yes -- raises if `true` in production/staging | Set explicitly `false` in the production compose file |
| `DEBUG_ENDPOINTS` | Yes (must be `false`/unset) | Yes -- raises if `true` in production | |
| `AUTO_SEED_DEFAULT_USERS` / `AUTO_SEED_MOCK_ERP_DATA` | Yes (must be `false`) | Yes -- raises if `true` in production/staging | Prevents accidentally seeding default credentials or mock ERP rows in a real deployment |
| `FORCE_HTTPS` | Recommended `true` | No | Enables HSTS response header |
| `AUTH_COOKIE_DOMAIN` / `AUTH_COOKIE_SAMESITE` | Recommended | Validator restricts `SAMESITE` to `lax/strict/none` | |
| `MONGO_ROOT_USER` / `MONGO_ROOT_PASSWORD` | Yes (Docker Compose stack) | Compose interpolation fails if unset | Used by the bundled `mongo` container's own auth, not read by the backend directly |
| `REDIS_PASSWORD` | Yes (Docker Compose stack) | Compose interpolation fails if unset | |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` | No | No | Optional error tracking |
| `METRICS_ENABLED` (alias: `ENABLE_METRICS`) | No (defaults `true`) | No | |

### Backend fail-fast behavior notes

- `backend/config.py` builds a Pydantic `Settings()` object **at import time** on both `python -m backend.server` and the real gunicorn production entrypoint (`gunicorn backend.server:app`), because `backend/server.py` imports `backend.config.settings` unconditionally at module load. This means `JWT_SECRET` / `JWT_REFRESH_SECRET` / `PIN_SALT` validation failures crash the container immediately on startup rather than surfacing as a runtime 500 later.
- The separate `backend/utils/env_validation.py::validate_environment()` function (which also checks `PIN_SALT`) is **not** invoked by gunicorn -- it is only called from `run_server_main()`, which only runs under `python -m backend.server`'s `if __name__ == "__main__"` guard. It is a secondary guard for the direct-run/dev path; do not rely on it as the production fail-fast mechanism.
- `_enforce_production_guards()` (also in `backend/config.py`) additionally rejects `DEBUG=true`, `HOT_RELOAD=true`, `DEBUG_ENDPOINTS=true`, and `AUTO_SEED_*=true` whenever `ENVIRONMENT=production` (or `staging` for the seed flags).

## Frontend (web production build)

| Variable | Required in prod? | Notes |
|---|---|---|
| `EXPO_PUBLIC_BACKEND_URL` | No (recommended to leave unset) | If unset, the web build calls same-origin (`window.location.origin`) so the browser hits nginx, which reverse-proxies `/api/` to the backend container. Only set this if the frontend and backend are on different origins |
| `EXPO_PUBLIC_APP_ENV` | Recommended | Read by `src/services/sentry.ts` for the Sentry environment tag; falls back to `NODE_ENV` |
| `EXPO_PUBLIC_API_TIMEOUT` | No (defaults 10000ms) | Request timeout in milliseconds |

There is no `EXPO_PUBLIC_API_URL` variable in this codebase; the equivalent
is `EXPO_PUBLIC_BACKEND_URL`, and the documented production pattern is to
leave it unset and rely on the nginx same-origin proxy.

## Rules enforced

- No real secrets are committed. Both `.env.production.example` and
  `backend/.env.example` contain only `CHANGE_ME_*` / `GENERATE_*`
  placeholders, which the Pydantic validators explicitly reject if used
  as-is in a real deployment.
- `CORS_ALLOW_ORIGINS` and `ALLOWED_HOSTS` never default to `*` in a
  non-development environment; an unset value fails closed (empty origin
  list / disabled host check with a warning), never open.
- `docker-compose.production.yml` additionally hard-requires
  `SQL_SERVER_HOST`, `SQL_SERVER_DATABASE`, `SQL_SERVER_USER`,
  `SQL_SERVER_PASSWORD` via Compose's `${VAR:?message}` syntax once
  `SQL_SERVER_HOST` is supplied, so a partially-configured SQL Server
  block fails the `docker compose config`/`up` step instead of starting
  with a broken connector.
