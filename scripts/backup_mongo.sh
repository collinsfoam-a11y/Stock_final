#!/bin/bash

set -euo pipefail

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

BACKUP_DIR="${ROOT_DIR}/backups/mongo"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.archive.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up MongoDB database '${DB_NAME}' to ${OUT_FILE}..."
docker exec stock-verify-mongo mongodump \
  --username "$MONGO_ROOT_USER" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --db "$DB_NAME" \
  --archive | gzip > "$OUT_FILE"

echo "Backup complete."
