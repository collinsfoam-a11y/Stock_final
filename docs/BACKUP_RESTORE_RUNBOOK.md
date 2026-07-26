# Backup / Restore Runbook

Scope: MongoDB (the only stateful, non-recreatable store in this stack --
see below for why exports/uploads need no separate backup path).

## What actually needs backing up

- **MongoDB** (`stock-verify-mongo` container, `mongo_data` volume): the
  operational store for sessions, count lines, users, and export previews.
  This is the only thing that needs a backup/restore procedure.
- **Evidence photos**: stored as `photo_base64` fields inside MongoDB
  count-line documents, not on a separate filesystem/object store. A
  MongoDB backup already includes them.
- **Generated ERPNext export files** (CSV/XLSX): generated in-memory on
  download request (`io.BytesIO`, see `backend/services/erpnext_export_file_service.py`)
  and never persisted to disk. Nothing to back up here; the *preview*
  metadata behind each export (which lines were included, hashes, etc.)
  lives in MongoDB's `erpnext_export_previews` collection and is covered
  by the MongoDB backup.
- **SQL Server**: read-only, external ERP system. Not owned or backed up
  by this project (business rule: SQL Server remains read-only).
- **Redis**: pure cache (session/rate-limit state); safe to lose on
  restart, does not need backup.

## Backup

Run from the deploy host, with `.env.prod` present at the repo root
(same file used by `docker-compose.production.yml`):

```bash
./scripts/backup_mongo.sh
```

This runs `mongodump` inside the `stock-verify-mongo` container,
compresses the archive, and writes it to `backups/mongo/<DB_NAME>-<timestamp>.archive.gz`.
Requires `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, and `DB_NAME` to be set
in `.env.prod` (the script fails fast via `:?` if any are missing).

**Schedule this on a cron/systemd timer** (not currently automated in this
repo) -- e.g.:

```cron
0 2 * * * cd /opt/stock-verify && ./scripts/backup_mongo.sh >> /var/log/stock-verify-backup.log 2>&1
```

Retention: the script does not prune old archives. Add a cleanup step
(e.g. `find backups/mongo -name '*.archive.gz' -mtime +30 -delete`) sized
to your available disk and compliance requirements.

Off-host copy: copy `backups/mongo/*.archive.gz` to remote/object storage
after each run (e.g. `rclone`, `aws s3 cp`, `rsync` to a second host) --
a backup that lives only on the same disk as the database is not a real
backup.

## Restore

```bash
./scripts/restore_mongo.sh backups/mongo/stock_verification-20260101_020000.archive.gz
```

This runs `mongorestore --drop` inside the `stock-verify-mongo`
container, **replacing the current database contents** with the archive.
Confirm you're restoring into the intended environment before running --
this is destructive to whatever is currently in `DB_NAME`.

### Restore verification checklist

After restore, before declaring the environment usable again:

1. `curl -fsS https://<domain>/health` -- basic health check.
2. `curl -fsS https://<domain>/health/ready` (if you expose it) or
   `docker exec stock-verify-backend python -c "..."` -- confirms Mongo
   is reachable post-restore, not just that the container is up.
3. Log in as a known test/admin user and confirm an existing session
   from before the backup point is visible.
4. Check `db.erpnext_export_previews.countDocuments({})` matches
   expectations -- confirms the restore isn't a stale/empty archive.

## Rollback (application version, not data)

Data rollback is the restore procedure above. Application/image rollback
(reverting to a previous backend/nginx image after a bad deploy) is
separate and does not touch MongoDB data:

```bash
BACKEND_IMAGE=ghcr.io/<org>/stock_final-backend:<previous-sha> \
NGINX_IMAGE=ghcr.io/<org>/stock_final-nginx:<previous-sha> \
  ./scripts/rollback_remote_compose.sh
```

This re-runs `scripts/deploy_remote_compose.sh` against the previous
image tags recorded from your last known-good CI run; it requires the
same `DEPLOY_*` environment variables as a normal deploy (see
`scripts/deploy_remote_compose.sh`). It does not restore a MongoDB
backup -- if the bad deploy also wrote bad data, run the MongoDB restore
procedure above separately.

## Log retention

`docker-compose.production.yml` caps each long-running service
(`mongo`, `redis`, `backend`, `nginx`) at 10MB per log file with 5 files
retained (50MB max per service):

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "5"
```

`certbot` is a one-shot renewal job (no `restart:` policy), so it is not
capped -- it doesn't run long enough to accumulate meaningful log volume.
If you also want a host-wide default for any container that doesn't set
its own `logging:` block, set the same options at the Docker daemon
level in `/etc/docker/daemon.json`.

The backend process itself also supports `LOG_FILE` / `LOG_MAX_BYTES` /
`LOG_BACKUP_COUNT` (see `backend/utils/logging_config.py` and
`backend/config.py`) for file-based rotation, but the shipped Dockerfile
CMD (`gunicorn ... --access-logfile - --error-logfile -`) sends logs to
stdout/stderr, so the Docker-level rotation above is what actually
applies in the containerized deployment.

## Emergency disable / maintenance mode

There is no built-in application-level maintenance-mode flag in this
codebase. To take the site offline for emergency maintenance without
losing data:

- **Fastest, reversible:** stop just the `nginx` container
  (`docker compose -f docker-compose.production.yml stop nginx`) --
  backend and databases keep running, but nothing is reachable from the
  internet/tunnel. Restart with `docker compose ... start nginx`.
- **With a maintenance page:** replace `nginx/nginx.conf`'s `location /`
  block temporarily with a static `return 503;` plus a custom
  `error_page 503 /maintenance.html;`, rebuild/redeploy the nginx image,
  and revert once maintenance is complete. This requires an image
  rebuild since `nginx.conf` is baked into the image at build time (see
  `nginx/Dockerfile`).

## ERPNext template handoff dependency

None of the above affects the ERPNext operator handoff process. Real
ERPNext templates/version metadata are a separate, external gate (see
`docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md` and
`scripts/check_erpnext_template_inputs.py`) and do not block or depend on
the backup/restore procedures in this document.
