#!/bin/bash

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-archive.gz>"
  exit 1
fi

BACKUP_FILE="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.prod"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${MONGO_ROOT_USER:?MONGO_ROOT_USER is required}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"
: "${DB_NAME:?DB_NAME is required}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring MongoDB database '${DB_NAME}' from ${BACKUP_FILE}..."
gunzip -c "$BACKUP_FILE" | docker exec -i stock-verify-mongo mongorestore \
  --username "$MONGO_ROOT_USER" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --drop \
  --archive \
  --nsInclude "${DB_NAME}.*"

echo "Restore complete."
