# Stock Verify Application (v2.1)

This repository is available as a GitHub template. Use the template to create a new instance.
Use this README for the repo workflow, `backend/README.md` for backend governance constraints,
and `docs/TESTING_GUIDE.md` for verification commands.

## Start Here

Tracked guides:
- `backend/README.md`
- `docs/TESTING_GUIDE.md`
- `docs/user-wise-running-workflow-diagram.md`

## Documentation

This repository currently keeps a smaller tracked docs set. Keep this section aligned with the
files that actually exist in git so a fresh clone does not point at missing documentation.

## Quick Start

Development:

One-click startup:
```bash
make start
```

Individual services:
- Backend: `make backend` (port 8001)
- Frontend: `make frontend` (port 8081, LAN mode)
- Fix Expo: `make fix-expo` (tunnel mode)
- Stop all: `make stop`

Frontend backend resolution:
- Set `EXPO_PUBLIC_BACKEND_URL` when you want to hard-pin the API origin.
- Otherwise the web app prefers same-origin `/api`, then Expo host detection for local development.

## Local LAN Deployment

1) Backend env:
   - Copy `backend/.env.example` to `backend/.env`.
   - Set `JWT_SECRET` and `JWT_REFRESH_SECRET` (32+ chars).
   - Set `MONGO_URL` and SQL Server settings as needed.
2) Frontend env:
   - Copy `frontend/.env.example` to `frontend/.env`.
   - Optionally set `EXPO_PUBLIC_BACKEND_URL` to your LAN IP.
3) Start services:
   - `make start` or `.\scripts\start_all.ps1` on Windows.
4) Verify:
   - `http://<LAN_IP>:8001/api/health`
   - Expo runs on `http://<LAN_IP>:8081`

## Testing

- Frontend: `cd frontend && npm run ci`
- Backend: `./scripts/python.sh -m pytest backend/tests`
- E2E: `cd frontend && npx playwright test` or `npm run e2e:recount-smoke`

Details: `docs/TESTING_GUIDE.md` and `frontend/e2e/README.md`

## Production Deployment (Canonical)

The supported production path for this repo is root `.env.prod` plus
`docker-compose.production.yml`.

1) Create the production env file:
   - `cp .env.production.example .env.prod`
2) Update `.env.prod` with real values:
   - `DOMAIN`
   - `CERTBOT_EMAIL`
   - `BACKEND_IMAGE`
   - `NGINX_IMAGE`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `MONGO_ROOT_PASSWORD`
   - `REDIS_PASSWORD`
   - `ALLOWED_HOSTS`
   - `CORS_ALLOW_ORIGINS`
   - `AUTH_COOKIE_DOMAIN`
3) Validate the stack definition:
   - `make deploy-check`
4) Provision TLS certificates:
   - `./scripts/init_letsencrypt.sh`
5) Deploy the stack:
   - `make deploy`
6) Verify:
   - `https://<DOMAIN>/healthz`
   - `https://<DOMAIN>/api/health`
   - `https://<DOMAIN>/`

Notes:
- Nginx serves the exported frontend and reverse-proxies `/api` and `/ws`.
- MongoDB and Redis stay on the internal Docker network; only ports `80` and `443` are exposed.
- Production deploys pull prebuilt GHCR images referenced by `BACKEND_IMAGE` and `NGINX_IMAGE`.
- If the GHCR packages are private, run `docker login ghcr.io` on the host before `make deploy`.
- Kubernetes manifests under `k8s/` are reference material and are not the canonical release path.
- `scripts/legacy/` is archived reference material and is not part of the supported runtime or deployment path.

## Jenkins Deployment

If you do not want to use GitHub Actions, this repo can be orchestrated by Jenkins through the root `Jenkinsfile`.

- Jenkins still uses the canonical runtime path: GHCR images plus `docker-compose.production.yml`
- Deploys are executed through `scripts/deploy_remote_compose.sh`
- Live validation runs through `scripts/post_deploy_smoke.sh`

Setup details: `docs/jenkins-deployment.md`

## GitHub Actions Deploy Configuration

The workflow in `.github/workflows/main.yml` now deploys through SSH to a remote Docker host.
Configure `staging` and `production` GitHub Environments with:

- Variables:
  - `DEPLOY_HOST`
  - `DEPLOY_USER`
  - `DEPLOY_PORT`
  - `DEPLOY_PATH`
  - `DEPLOY_HEALTHCHECK_URL`
  - `DEPLOY_APP_BASE_URL` (optional, used by post-deploy smoke)
  - `DEPLOY_FRONTEND_URL` (optional, used by post-deploy smoke)
  - `DEPLOY_KNOWN_HOSTS` (optional but recommended)
- Secrets:
  - `DEPLOY_SSH_KEY`
  - `DEPLOY_ENV_FILE`
  - `DEPLOY_REGISTRY_USERNAME`
  - `DEPLOY_REGISTRY_TOKEN`
  - `SMOKE_USERNAME` (optional, for post-deploy authenticated smoke)
  - `SMOKE_PASSWORD` (optional, for post-deploy authenticated smoke)

Behavior:
- `push` to `main`: build images and deploy `staging`
- `workflow_dispatch` on `main`: build images and deploy `production`
- both deploy environments run a live post-deploy smoke check against the deployed domain

Manual rollback:
- render a previous image pair into the target environment and run:
  - `BACKEND_IMAGE=<old-backend> NGINX_IMAGE=<old-nginx> ./scripts/rollback_remote_compose.sh`
- verify backup/restore on a reachable MongoDB before production cutover:
  - `./scripts/verify_backup_restore.sh`

## Configuration

- Public ports: 80 / 443 via nginx
- Backend port: 8001 (internal container port)
- SQL Server: configured in `backend/config.py` (default `192.168.1.109`)
- Frontend: Expo SDK 54

## Maintenance

Archive old documentation:
```bash
./scripts/python.sh scripts/cleanup_old_docs.py
```

Kill frontend (macOS/Linux):
```bash
lsof -ti :8081,19000,19001,19002,19006 | xargs kill -9
```
