#!/bin/bash
set -euo pipefail

TARGET="${1:-staging}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${DEPLOY_HOST:-}" ] || [ -z "${DEPLOY_USER:-}" ]; then
    echo "❌ DEPLOY_HOST and DEPLOY_USER must be set"
    exit 1
fi

SSH_OPTS="-o StrictHostKeyChecking=no"
if [ -n "${DEPLOY_KNOWN_HOSTS:-}" ]; then
    SSH_OPTS="-o StrictHostKeyChecking=yes -o UserKnownHostsFile=/dev/null"
fi

ssh $SSH_OPTS "${DEPLOY_USER}@${DEPLOY_HOST}" "mkdir -p ${DEPLOY_PATH:-/opt/stock-verify}"

scp $SSH_OPTS "$REPO_ROOT/docker-compose.production.yml" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH:-/opt/stock-verify}/docker-compose.production.yml"
scp $SSH_OPTS "$REPO_ROOT/.env.prod" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH:-/opt/stock-verify}/.env.prod"

ssh $SSH_OPTS "${DEPLOY_USER}@${DEPLOY_HOST}" "cd ${DEPLOY_PATH:-/opt/stock-verify} && docker compose --env-file .env.prod -f docker-compose.production.yml up -d --remove-orphans"

echo "✅ Deployed to $TARGET"
