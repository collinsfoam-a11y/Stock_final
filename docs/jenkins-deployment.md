# Jenkins Deployment Guide

This repository can be orchestrated by Jenkins without using GitHub Actions. The recommended Jenkins path mirrors the existing canonical runtime:

- verify with `./scripts/agent_ci.sh ci`
- build backend and nginx Docker images
- push them to GHCR
- deploy to the remote Docker host with `./scripts/deploy_remote_compose.sh`
- verify the live environment with `./scripts/post_deploy_smoke.sh`

## Jenkins Agent Requirements

Use a Linux Jenkins agent with:

- Docker CLI and daemon access
- Bash
- Git
- SSH client

The agent should satisfy the `linux && docker` label used by [Jenkinsfile](/D:/stk/Stock_final/Jenkinsfile).

## Required Jenkins Plugins

- Pipeline
- Git
- Credentials Binding
- SSH Agent
- ANSI Color

## Required Jenkins Credentials

Create these credentials in Jenkins:

- `ghcr-stock-verify`
  - Type: `Username with password`
  - Purpose: GHCR username/token for image push and remote host registry login
- `stock-verify-staging-ssh`
  - Type: `SSH Username with private key`
  - Purpose: SSH access to the staging Docker host
- `stock-verify-production-ssh`
  - Type: `SSH Username with private key`
  - Purpose: SSH access to the production Docker host
- `stock-verify-staging-env`
  - Type: `Secret text`
  - Purpose: full rendered `.env.prod` content for staging
- `stock-verify-production-env`
  - Type: `Secret text`
  - Purpose: full rendered `.env.prod` content for production
- `stock-verify-staging-smoke`
  - Type: `Username with password`
  - Purpose: optional authenticated smoke credentials for staging
- `stock-verify-production-smoke`
  - Type: `Username with password`
  - Purpose: optional authenticated smoke credentials for production

If you do not want authenticated smoke checks, create low-privilege smoke users instead of reusing operator accounts.

## Credential Value Matrix

Use these exact Jenkins credential IDs because the pipeline refers to them directly:

| Credential ID | Jenkins Type | What to enter | Notes |
| --- | --- | --- | --- |
| `ghcr-stock-verify` | Username with password | Username: your GHCR username or service account. Password: GHCR token with package read/write. | Used both by Jenkins image push and remote `docker login ghcr.io`. |
| `stock-verify-staging-ssh` | SSH Username with private key | SSH username and private key for the staging Docker host. | The username here does not have to match `DEPLOY_USER_STAGING`, but keeping them the same reduces mistakes. |
| `stock-verify-production-ssh` | SSH Username with private key | SSH username and private key for the production Docker host. | Keep production isolated from staging. |
| `stock-verify-staging-env` | Secret text | Full staging `.env.prod` file content. | Do not paste only individual keys. Paste the entire rendered file body. |
| `stock-verify-production-env` | Secret text | Full production `.env.prod` file content. | This is what `DEPLOY_ENV_FILE` becomes inside the deploy script. |
| `stock-verify-staging-smoke` | Username with password | Low-privilege app login for authenticated smoke checks. | Optional in operations, but required by the current Jenkinsfile when `RUN_SMOKE=true`. |
| `stock-verify-production-smoke` | Username with password | Low-privilege production app login for authenticated smoke checks. | Use a dedicated smoke account, not an operator account. |

## Environment Variable Matrix

Set these at the Jenkins folder level, multibranch job level, or pipeline job level:

| Variable | Example staging value | Required | Purpose |
| --- | --- | --- | --- |
| `DEPLOY_HOST_STAGING` | `staging.stockverify.internal` | Yes | Remote Docker host for staging. |
| `DEPLOY_USER_STAGING` | `deploy` | Yes | SSH user used by `deploy_remote_compose.sh`. |
| `DEPLOY_PORT_STAGING` | `22` | No | Defaults to `22` if omitted. |
| `DEPLOY_PATH_STAGING` | `/opt/stock-verify` | Yes | Remote directory where the compose bundle and `.env.prod` live. |
| `DEPLOY_HEALTHCHECK_URL_STAGING` | `https://staging.example.com/api/health` | No but recommended | Used for deploy wait loop and smoke health URL. |
| `DEPLOY_APP_BASE_URL_STAGING` | `https://staging.example.com` | No but recommended | Base URL for docs and authenticated smoke. |
| `DEPLOY_FRONTEND_URL_STAGING` | `https://staging.example.com` | No | Separate frontend URL if different from app base URL. |
| `DEPLOY_KNOWN_HOSTS_STAGING` | `staging.stockverify.internal ssh-ed25519 AAAA...` | No but recommended | Avoids dynamic host-key collection. |
| `DEPLOY_HOST_PRODUCTION` | `prod.stockverify.internal` | Yes | Remote Docker host for production. |
| `DEPLOY_USER_PRODUCTION` | `deploy` | Yes | SSH user used by `deploy_remote_compose.sh`. |
| `DEPLOY_PORT_PRODUCTION` | `22` | No | Defaults to `22`. |
| `DEPLOY_PATH_PRODUCTION` | `/opt/stock-verify` | Yes | Remote directory for the production compose stack. |
| `DEPLOY_HEALTHCHECK_URL_PRODUCTION` | `https://stock-verify.example.com/api/health` | No but recommended | Used by the deploy wait loop and smoke checks. |
| `DEPLOY_APP_BASE_URL_PRODUCTION` | `https://stock-verify.example.com` | No but recommended | Base URL for docs and authenticated smoke. |
| `DEPLOY_FRONTEND_URL_PRODUCTION` | `https://stock-verify.example.com` | No | Separate frontend URL only if needed. |
| `DEPLOY_KNOWN_HOSTS_PRODUCTION` | `stock-verify.example.com ssh-ed25519 AAAA...` | No but recommended | Strongly preferred for production. |

## Required Jenkins Environment Variables

Set these as job-level or folder-level environment variables:

- `DEPLOY_HOST_STAGING`
- `DEPLOY_USER_STAGING`
- `DEPLOY_PORT_STAGING`
- `DEPLOY_PATH_STAGING`
- `DEPLOY_HEALTHCHECK_URL_STAGING`
- `DEPLOY_APP_BASE_URL_STAGING`
- `DEPLOY_FRONTEND_URL_STAGING`
- `DEPLOY_KNOWN_HOSTS_STAGING`
- `DEPLOY_HOST_PRODUCTION`
- `DEPLOY_USER_PRODUCTION`
- `DEPLOY_PORT_PRODUCTION`
- `DEPLOY_PATH_PRODUCTION`
- `DEPLOY_HEALTHCHECK_URL_PRODUCTION`
- `DEPLOY_APP_BASE_URL_PRODUCTION`
- `DEPLOY_FRONTEND_URL_PRODUCTION`
- `DEPLOY_KNOWN_HOSTS_PRODUCTION`

`DEPLOY_PORT_*`, `DEPLOY_APP_BASE_URL_*`, `DEPLOY_FRONTEND_URL_*`, and `DEPLOY_KNOWN_HOSTS_*` may be left empty when appropriate. The deploy script falls back to port `22`, and it can use `ssh-keyscan` when known hosts are not supplied.

## Staging `.env.prod` Secret Text Template

The `stock-verify-staging-env` secret should contain the full rendered file body, for example:

```dotenv
DOMAIN=staging.example.com
CERTBOT_EMAIL=ops@example.com
DB_NAME=stock_verification
BACKEND_WORKERS=4
BACKEND_IMAGE=ghcr.io/mknoufi/stock_verify_ui-backend:placeholder
NGINX_IMAGE=ghcr.io/mknoufi/stock_verify_ui-nginx:placeholder
JWT_SECRET=replace-with-long-random-jwt-secret
JWT_REFRESH_SECRET=replace-with-long-random-refresh-secret
LOG_LEVEL=INFO
FORCE_HTTPS=true
ALLOWED_HOSTS=staging.example.com
CORS_ALLOW_ORIGINS=https://staging.example.com
AUTH_COOKIE_DOMAIN=staging.example.com
AUTH_COOKIE_SAMESITE=lax
AUTO_SEED_DEFAULT_USERS=false
AUTO_SEED_MOCK_ERP_DATA=false
MONGO_ROOT_USER=stockverify
MONGO_ROOT_PASSWORD=replace-with-long-random-mongo-password
REDIS_PASSWORD=replace-with-long-random-redis-password
EXPO_PUBLIC_API_TIMEOUT=30000
```

Notes:
- `BACKEND_IMAGE` and `NGINX_IMAGE` will be overwritten by the deploy script at runtime, so placeholder values are acceptable in the secret text.
- Keep `AUTO_SEED_DEFAULT_USERS=false` and `AUTO_SEED_MOCK_ERP_DATA=false` for any real environment.
- Leave `EXPO_PUBLIC_BACKEND_URL` unset when nginx should proxy same-origin `/api`.
- A copy-paste version also lives in [docs/jenkins-staging.env.prod.example](/D:/stk/Stock_final/docs/jenkins-staging.env.prod.example).

## First Jenkins Runs

Use this order for the first bring-up:

1. Create all Jenkins credentials and environment variables.
2. Run the Jenkins job with `DEPLOY_TARGET=none`, `BUILD_AND_PUSH_IMAGES=true`, `RUN_SMOKE=false`.
3. Confirm GHCR push worked and note the generated image tag.
4. Populate the staging env secret with real values.
5. Run the job with `DEPLOY_TARGET=staging`, `BUILD_AND_PUSH_IMAGES=true`, `RUN_SMOKE=true`.
6. If staging is healthy, repeat for production with a human approval gate before the deploy run.

## Pipeline Parameters

The Jenkins pipeline exposes:

- `DEPLOY_TARGET`
  - `none`: verify and optionally build/push only
  - `staging`: deploy to staging after build
  - `production`: deploy to production after build
- `BUILD_AND_PUSH_IMAGES`
  - `true`: build fresh images and push them
  - `false`: skip builds and deploy the tag given in `IMAGE_TAG`
- `PUSH_LATEST_TAG`
  - whether to also publish `:latest`
- `RUN_SMOKE`
  - run post-deploy smoke after deployment
- `IMAGE_REPO`
  - defaults to `ghcr.io/mknoufi/stock_verify_ui`
- `IMAGE_TAG`
  - blank uses the current commit SHA prefix

## Recommended Job Usage

Build-only validation:

- `DEPLOY_TARGET=none`
- `BUILD_AND_PUSH_IMAGES=true`

Deploy a fresh staging release:

- `DEPLOY_TARGET=staging`
- `BUILD_AND_PUSH_IMAGES=true`
- `RUN_SMOKE=true`

Redeploy an existing production image tag:

- `DEPLOY_TARGET=production`
- `BUILD_AND_PUSH_IMAGES=false`
- `IMAGE_TAG=<existing-tag>`
- `RUN_SMOKE=true`

## Rollback

To roll back, run the same Jenkins job with:

- `DEPLOY_TARGET=<staging|production>`
- `BUILD_AND_PUSH_IMAGES=false`
- `IMAGE_TAG=<previous-good-tag>`

The deploy step will render:

- `BACKEND_IMAGE=${IMAGE_REPO}-backend:${IMAGE_TAG}`
- `NGINX_IMAGE=${IMAGE_REPO}-nginx:${IMAGE_TAG}`

If you need a manual rollback outside Jenkins, the repo already provides [scripts/rollback_remote_compose.sh](/D:/stk/Stock_final/scripts/rollback_remote_compose.sh).

## Operator Notes

- The canonical production runtime is still `.env.prod` plus `docker-compose.production.yml`.
- Jenkins should not introduce a second deployment topology.
- Keep `staging` and `production` env content separate.
- Before production cutover, verify backup and restore with [scripts/verify_backup_restore.sh](/D:/stk/Stock_final/scripts/verify_backup_restore.sh).
