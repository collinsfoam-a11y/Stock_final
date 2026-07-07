#!/usr/bin/env bash

set -euo pipefail

if ! command -v mongosh >/dev/null 2>&1; then
  echo "mongosh is required to verify backup/restore." >&2
  echo "Install: brew install mongosh (macOS) | https://www.mongodb.com/docs/mongodb-shell/install/" >&2
  exit 1
fi

TEMP_DB="${TEMP_DB:-stock_verify_restore_probe_$(date +%s)}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/stock_verify_backup_restore}"
BACKUP_PREFIX="${BACKUP_PREFIX:-stock_verify_restore_probe}"
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USERNAME="${MONGO_USERNAME:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"

cleanup() {
  mongosh "mongodb://${MONGO_HOST}:${MONGO_PORT}/${TEMP_DB}" --quiet --eval "db.dropDatabase()" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "${BACKUP_DIR}"

echo "Seeding probe document into ${TEMP_DB}"
mongosh "mongodb://${MONGO_HOST}:${MONGO_PORT}/${TEMP_DB}" --quiet --eval \
  'db.restore_probe.insertOne({ marker: "stock-verify-backup-restore", created_at: new Date() })' >/dev/null

echo "Running backup"
BACKUP_OUTPUT="$(MONGO_DATABASE="${TEMP_DB}" \
BACKUP_DIR="${BACKUP_DIR}" \
BACKUP_PREFIX="${BACKUP_PREFIX}" \
MONGO_HOST="${MONGO_HOST}" \
MONGO_PORT="${MONGO_PORT}" \
MONGO_USERNAME="${MONGO_USERNAME}" \
MONGO_PASSWORD="${MONGO_PASSWORD}" \
bash ./scripts/backup.sh)"
echo "${BACKUP_OUTPUT}"

# Read the exact archive name backup.sh just created instead of globbing the
# directory with `ls -t`, which picks the wrong file if two backups race.
BACKUP_FILE_NAME="$(echo "${BACKUP_OUTPUT}" | sed -n 's/^Backup compressed: //p' | tail -n 1)"
if [ -z "${BACKUP_FILE_NAME}" ]; then
  echo "Backup verification failed: no backup artifact was created." >&2
  exit 1
fi
BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE_NAME}"
if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Backup verification failed: expected artifact ${BACKUP_FILE} not found." >&2
  exit 1
fi

echo "Dropping probe database"
mongosh "mongodb://${MONGO_HOST}:${MONGO_PORT}/${TEMP_DB}" --quiet --eval "db.dropDatabase()" >/dev/null

echo "Running restore from ${BACKUP_FILE}"
RESTORE_CONFIRM="yes" \
MONGO_DATABASE="${TEMP_DB}" \
MONGO_HOST="${MONGO_HOST}" \
MONGO_PORT="${MONGO_PORT}" \
MONGO_USERNAME="${MONGO_USERNAME}" \
MONGO_PASSWORD="${MONGO_PASSWORD}" \
bash ./scripts/restore.sh "${BACKUP_FILE}"

RESTORED_COUNT="$(mongosh "mongodb://${MONGO_HOST}:${MONGO_PORT}/${TEMP_DB}" --quiet --eval \
  'db.restore_probe.countDocuments({ marker: "stock-verify-backup-restore" })')"

if [ "${RESTORED_COUNT}" != "1" ]; then
  echo "Backup/restore verification failed: expected 1 probe document, found ${RESTORED_COUNT}." >&2
  exit 1
fi

echo "Backup/restore verification passed."
