# Stock Verify - Final Release Pack

Generated: 2026-07-08

## 1. Commit Stack

| Commit | Scope |
|---|---|
| `249db587` | ERPNext template acquisition docs + operator handoff bundle |
| `ef90208e` | Backend ERPNext export/template validation + HSN suggestion workflow |
| `71b4b7ad` | Frontend accessibility, dark-mode, haptics, issue-count, RN-Web fixes |
| `6b8be9b6` | Backend performance fix: erpnext_export_previews.export_id index |
| `554b12b8` | Frontend production fixes: nested button, haptics, dark mode, stray text nodes |
| `eaf89f54` | Cleanup: dead files, gitlink hygiene, case-collision fix |
| `347dda65` | Deployment environment contract, operations, backup/restore runbooks |
| `d39faf04` | Docker/proxy config fixes (HSTS, PIN_SALT in compose) |
| `f9342a38` | Deploy smoke script with template-gate awareness |
| `1db3af9f` | PIN_SALT production fail-fast in backend/config.py |
| `aac4e3c1` | Compose logging hardening (max-size/max-file caps) |

## 2. Test Results

- Backend: 1383 passed, 13 skipped, 10 deselected
- Backend domain: 26 passed
- Frontend typecheck: clean
- Frontend lint: exit 0, 16 P2-only warnings
- Frontend tests: 327 passed, 86 suites

## 3. Deployment Commands

```bash
# 1. Clone and enter repo
git clone <repo-url> stock-verify
cd stock-verify

# 2. Copy env template and fill in real values
cp .env.production.example .env.prod
# edit .env.prod: set DOMAIN, JWT_SECRET, PIN_SALT, etc.

# 3. Deploy
docker compose -f docker-compose.production.yml \
  --env-file .env.prod up -d --remove-orphans

# 4. Verify
curl -fsS http://<host>/health
curl -fsS http://<host>/api/health
curl -fsS http://<host>/  # frontend
```

## 4. Environment Variables (Production)

See [docs/DEPLOYMENT_ENVIRONMENT.md](docs/DEPLOYMENT_ENVIRONMENT.md) for the canonical reference. Required minimum set:

```
DOMAIN=stock-verify.example.com
JWT_SECRET=<32+ char random>
JWT_REFRESH_SECRET=<32+ char random, different from JWT_SECRET>
PIN_SALT=<32+ char random>
MONGO_ROOT_USER=stockverify
MONGO_ROOT_PASSWORD=<random>
REDIS_PASSWORD=<random>
SQL_SERVER_HOST=sql-server.example.internal
SQL_SERVER_DATABASE=stock_erp
SQL_SERVER_USER=stockverify_readonly
SQL_SERVER_PASSWORD=<random>
CORS_ALLOW_ORIGINS=https://stock-verify.example.com
ALLOWED_HOSTS=stock-verify.example.com
```

## 5. Backup/Restore Commands

```bash
# Backup (from deploy host)
./scripts/backup_mongo.sh

# Restore
./scripts/restore_mongo.sh /path/to/backup.archive.gz
```

See [docs/BACKUP_RESTORE_RUNBOOK.md](docs/BACKUP_RESTORE_RUNBOOK.md).

## 6. Cloudflare Tunnel Instructions

See [docs/CLOUDFLARE_TUNNEL_DEPLOYMENT.md](docs/CLOUDFLARE_TUNNEL_DEPLOYMENT.md).

Key points:
- Tunnel points at nginx's HTTPS server (port 443) with `noTLSVerify: true`
- Health check: `/healthz` (nginx-only, fast)
- WebSocket: `/ws/` already proxied with correct headers

## 7. ERPNext Operator Instructions

1. Wait for **real** ERPNext templates to arrive from the operator.
2. They must be placed in `docs/erpnext_templates/`:
   - `stock_entry_template.csv` or `.xlsx`
   - `stock_reconciliation_template.csv` or `.xlsx`
   - `serial_no_template.csv` or `.xlsx` (only if classic Serial No path is used)
   - `batch_template.csv` or `.xlsx` (only if classic Batch path is used)
3. Fill in `docs/erpnext_templates/template_manifest.json` with actual values.
4. **Do not** attempt manual import dry-run until `scripts/check_erpnext_template_inputs.py` returns `can_advance_to_manual_import_dry_run=true`.

## 8. Known External Dependencies

| Dependency | Status |
|---|---|
| ERPNext templates/version metadata | **NOT PRESENT** -- operator must supply |
| Real ERPNext instance URL | Unknown |
| `PIN_SALT` | Must be supplied via `.env.prod` |

## 9. Rollback Procedure

```bash
BACKEND_IMAGE=ghcr.io/.../stock_final-backend:<previous-sha> \
NGINX_IMAGE=ghcr.io/.../stock_final-nginx:<previous-sha> \
  ./scripts/rollback_remote_compose.sh
```

## 10. Smoke-Test Checklist

| Check | Command |
|---|---|
| Backend health | `curl https://<host>/health` |
| Backend API health | `curl https://<host>/api/health` |
| Frontend | `curl https://<host>/` |
| Template gate | `python scripts/check_erpnext_template_inputs.py` |
| Full smoke script | `SMOKE_BASE_URL=https://<host> ./scripts/deploy_smoke_check.sh` |

## 11. Current Readiness Verdict

**100_PERCENT_COMPLETE_EXCEPT_OPERATOR_INPUT**

The application is fully tested and hardened for a production deployment (no host has actually been provisioned by this engineering effort -- that is an operator/ops action using the commands in this document). The only unmet requirement is the external ERPNext operator package (templates and metadata), which is explicitly out of engineering scope per business rule #18. Manual CSV/XLSX import into ERPNext cannot proceed until the operator delivers:
- Stock Entry template
- Stock Reconciliation template
- Serial No/Batch templates (if classic path is used)
- Template manifest with real ERPNext version, company, and serial/batch gate settings

---

## 12. Final Verification Results

```
$ docker compose config
name: stock_final
services:
  backend: ...
  mongo: ...
  redis: ...
  nginx: ...
  certbot: ...

$ docker compose -f docker-compose.production.yml --env-file .env.production.example config
name: stock_final
services:
  backend:
    logging:
      driver: json-file
      options:
        max-file: "5"
        max-size: 10m
  mongo:
    logging:
      driver: json-file
      options:
        max-file: "5"
        max-size: 10m
  redis:
    logging: ...
  nginx:
    logging: ...

$ pytest backend/tests -q
1383 passed, 13 skipped, 10 deselected

$ pytest backend/domains/count_lines/tests -q
26 passed

$ python -m ruff check backend/
All checks passed!

$ npm run typecheck (frontend)
(exit 0, no output)

$ npm run lint (frontend)
16 problems (0 errors, 16 warnings) -- exit 0

$ npm test (frontend, via node ./scripts/run-jest.cjs)
Test Suites: 86 passed, 86 total
Tests:       327 passed, 327 total

$ python scripts/check_erpnext_template_inputs.py
ERPNext template input check: NOT READY
can_advance_to_manual_import_dry_run: false
EXIT: 1 (expected)

$ SMOKE_BASE_URL=http://127.0.0.1:<port> ./scripts/deploy_smoke_check.sh
OK: backend /health (HTTP 200)
OK: backend /api/health (HTTP 200)
OK: frontend (HTTP 200)
OK (expected): ERPNext template gate reports NOT READY
Deploy smoke check passed.
EXIT: 0
```

Re-verified fresh on 2026-07-08 as part of the operator-package check pass --
all results identical to the original run above.