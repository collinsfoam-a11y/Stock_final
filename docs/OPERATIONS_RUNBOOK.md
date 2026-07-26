# Operations Runbook

Day-to-day operational procedures for the Stock Verify production stack.
For backup/restore specifically, see
[BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md). For environment
variables, see [DEPLOYMENT_ENVIRONMENT.md](DEPLOYMENT_ENVIRONMENT.md).
For Cloudflare Tunnel topology, see
[CLOUDFLARE_TUNNEL_DEPLOYMENT.md](CLOUDFLARE_TUNNEL_DEPLOYMENT.md).

## Stack overview

`docker-compose.production.yml` runs five services: `mongo`, `redis`,
`backend`, `nginx`, `certbot`. `backend` and `nginx` both use pre-built
images (`${BACKEND_IMAGE}` / `${NGINX_IMAGE}`) pulled from a registry --
this compose file does not build images itself, so a deploy always
starts with `docker compose pull`.

## Routine deploy

```bash
BACKEND_IMAGE=ghcr.io/<org>/stock_final-backend:<sha> \
NGINX_IMAGE=ghcr.io/<org>/stock_final-nginx:<sha> \
  ./scripts/deploy_remote_compose.sh
```

Requires `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_ENV_FILE`,
`DEPLOY_REGISTRY_USERNAME`, `DEPLOY_REGISTRY_TOKEN` set (see
`scripts/deploy_remote_compose.sh`); CI (`.github/workflows/main.yml`)
sets these from repository secrets/vars automatically on merge to the
deploy branch. The script pushes the compose file + backup/restore/TLS
scripts to the host, logs into the registry, pulls the new images, and
runs `docker compose up -d --remove-orphans`. If `DEPLOY_HEALTHCHECK_URL`
is set, it polls `/health` for up to 5 minutes before declaring success.

After a deploy, run the smoke check (see below) to confirm the
deployment is actually serving traffic correctly, not just that the
containers started.

## Rollback

See [BACKUP_RESTORE_RUNBOOK.md](BACKUP_RESTORE_RUNBOOK.md#rollback-application-version-not-data)
for the image-rollback procedure via `scripts/rollback_remote_compose.sh`.
Rolling back the application image never touches MongoDB data; if the bad
deploy also corrupted data, that's a separate MongoDB restore (same doc).

## Post-deploy / periodic smoke checks

Two complementary scripts:

- `scripts/post_deploy_smoke.sh` -- HTTP-level smoke test (health,
  frontend reachability, confirms `/docs` is blocked, optional
  authenticated login+protected-route check if `SMOKE_USERNAME`/
  `SMOKE_PASSWORD` are set). Already wired into CI's deploy jobs.
- `scripts/deploy_smoke_check.sh` -- adds the ERPNext template-gate
  awareness on top: confirms the gate script itself runs and reports its
  actual state (still correctly `NOT READY` until real templates arrive
  -- see [ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md](ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md)),
  so a blocked template gate is never mistaken for a deploy failure.

Run either manually against a live deployment:

```bash
SMOKE_BASE_URL=https://stock-verify.example.com ./scripts/deploy_smoke_check.sh
```

## Container health

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=200 backend
```

All five services declare a `healthcheck:` (see
`docker-compose.production.yml`); `docker compose ps` reports
`healthy`/`unhealthy`/`starting` per container. `nginx` and `backend`
both have `restart: unless-stopped`, so a crashed process restarts
automatically -- persistent `unhealthy` status past the `start_period`
means the restart loop isn't fixing the underlying problem and needs
manual investigation (check `logs`).

## Log locations

- Container stdout/stderr: `docker compose logs <service>` (see log
  retention note in `BACKUP_RESTORE_RUNBOOK.md` -- `mongo`, `redis`,
  `backend`, and `nginx` each cap `json-file` logs at 10MB x 5 files;
  `certbot` is a one-shot job and is not capped).
- nginx access/error logs: inside the `nginx` container at
  `/var/log/nginx/{access,error}.log` (per `nginx/nginx.conf`'s
  `log_format`/`error_log` directives); surfaced via `docker compose logs nginx`.
- Backend structured logs: JSON via `python-json-logger`
  (`LOG_FORMAT=json`), written to stdout and captured by gunicorn's
  `--access-logfile -` / `--error-logfile -`.

## Scaling

`BACKEND_WORKERS` (gunicorn worker count, default 4) and
`WORKERS` env var are read at container start (see `backend/Dockerfile`'s
CMD: `-w ${WORKERS:-4}`). Increase via `.env.prod`'s `BACKEND_WORKERS` and
redeploy; this is process-level concurrency within one container, not
horizontal container scaling. `docker-compose.production.yml` does not
define `deploy.replicas` (Compose, not Swarm/K8s), so horizontal scaling
of the `backend` service requires either Docker Swarm mode or moving to
an orchestrator -- out of scope for the current single-host Compose
deployment.

## ERPNext operator handoff dependency

Do not treat a blocked ERPNext template gate
(`scripts/check_erpnext_template_inputs.py` reporting `NOT READY`) as an
operational incident. This is expected and external until real ERPNext
templates/version metadata arrive from the operator -- see
[ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md](ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md).
Manual CSV/XLSX import into ERPNext is, and remains, the only supported
integration path; nothing in this runbook should be read as motivation to
add a direct ERPNext API push.
