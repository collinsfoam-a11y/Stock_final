#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.production.yml"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

required_vars=(
  DEPLOY_HOST
  DEPLOY_USER
  DEPLOY_PATH
  DEPLOY_ENV_FILE
  DEPLOY_REGISTRY_USERNAME
  DEPLOY_REGISTRY_TOKEN
  BACKEND_IMAGE
  NGINX_IMAGE
)

for required_var in "${required_vars[@]}"; do
  if [ -z "${!required_var:-}" ]; then
    echo "Missing required environment variable: ${required_var}" >&2
    exit 1
  fi
done

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-}"
DEPLOY_KNOWN_HOSTS="${DEPLOY_KNOWN_HOSTS:-}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
REMOTE_TMP_DIR="/tmp/stock-verify-deploy-${GITHUB_SHA:-$(date +%s)}"

SSH_OPTS=(-p "${DEPLOY_PORT}")
SCP_OPTS=(-P "${DEPLOY_PORT}")

if [ -n "${DEPLOY_KNOWN_HOSTS}" ]; then
  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"
  printf '%s\n' "${DEPLOY_KNOWN_HOSTS}" >> "${HOME}/.ssh/known_hosts"
  chmod 600 "${HOME}/.ssh/known_hosts"
else
  mkdir -p "${HOME}/.ssh"
  chmod 700 "${HOME}/.ssh"
  ssh-keyscan -p "${DEPLOY_PORT}" "${DEPLOY_HOST}" >> "${HOME}/.ssh/known_hosts" 2>/dev/null
  chmod 600 "${HOME}/.ssh/known_hosts"
fi

RENDERED_ENV_FILE="${TMP_DIR}/.env.prod"
printf '%s\n' "${DEPLOY_ENV_FILE}" \
  | grep -Ev '^(BACKEND_IMAGE|NGINX_IMAGE|GIT_SHA)=' \
  > "${RENDERED_ENV_FILE}" || true
{
  printf '\nBACKEND_IMAGE=%s\n' "${BACKEND_IMAGE}"
  printf 'NGINX_IMAGE=%s\n' "${NGINX_IMAGE}"
  printf 'GIT_SHA=%s\n' "${GITHUB_SHA:-manual}"
} >> "${RENDERED_ENV_FILE}"

BUNDLE_FILE="${TMP_DIR}/deploy_bundle.tar.gz"
tar -czf "${BUNDLE_FILE}" \
  -C "${ROOT_DIR}" \
  docker-compose.production.yml \
  scripts/init_letsencrypt.sh \
  scripts/backup_mongo.sh \
  scripts/restore_mongo.sh

ssh "${SSH_OPTS[@]}" "${REMOTE}" "mkdir -p '${REMOTE_TMP_DIR}' '${DEPLOY_PATH}/scripts' '${DEPLOY_PATH}/nginx/ssl' '${DEPLOY_PATH}/certbot/www'"
scp "${SCP_OPTS[@]}" "${BUNDLE_FILE}" "${RENDERED_ENV_FILE}" "${REMOTE}:${REMOTE_TMP_DIR}/"

printf '%s' "${DEPLOY_REGISTRY_TOKEN}" \
  | ssh "${SSH_OPTS[@]}" "${REMOTE}" "docker login ghcr.io -u '${DEPLOY_REGISTRY_USERNAME}' --password-stdin >/dev/null"

ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "REMOTE_TMP_DIR='${REMOTE_TMP_DIR}' DEPLOY_PATH='${DEPLOY_PATH}' bash -s" <<'EOF'
set -euo pipefail

cd "${DEPLOY_PATH}"
tar -xzf "${REMOTE_TMP_DIR}/deploy_bundle.tar.gz" -C "${DEPLOY_PATH}"
mv "${REMOTE_TMP_DIR}/.env.prod" "${DEPLOY_PATH}/.env.prod"
chmod +x "${DEPLOY_PATH}/scripts/"*.sh

docker compose --env-file .env.prod -f docker-compose.production.yml pull
docker compose --env-file .env.prod -f docker-compose.production.yml up -d --remove-orphans
docker compose --env-file .env.prod -f docker-compose.production.yml ps

rm -rf "${REMOTE_TMP_DIR}"
EOF

if [ -n "${DEPLOY_HEALTHCHECK_URL}" ]; then
  echo "Waiting for health check: ${DEPLOY_HEALTHCHECK_URL}"
  for attempt in $(seq 1 30); do
    if curl -fsS "${DEPLOY_HEALTHCHECK_URL}" >/dev/null 2>&1; then
      echo "Remote deployment is healthy."
      exit 0
    fi
    sleep 10
  done
  echo "Health check failed after deployment: ${DEPLOY_HEALTHCHECK_URL}" >&2
  exit 1
fi

echo "Remote deployment completed."
