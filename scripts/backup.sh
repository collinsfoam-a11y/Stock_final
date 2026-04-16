#!/bin/bash

# MongoDB Backup Script
# Runs daily via cron

set -euo pipefail

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

# Configuration
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USERNAME="${MONGO_USERNAME:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"
MONGO_DATABASE="${MONGO_DATABASE:-stock_verification}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_PREFIX="${BACKUP_PREFIX:-stock_verify_backup}"
BACKUP_CRON_SCHEDULE="${BACKUP_CRON_SCHEDULE:-}"

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Generate backup filename with timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${BACKUP_PREFIX}_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

echo "Starting MongoDB backup: ${BACKUP_NAME}"

# Perform mongodump
if [ -n "${MONGO_PASSWORD}" ]; then
    mongodump \
        --host="${MONGO_HOST}" \
        --port="${MONGO_PORT}" \
        --username="${MONGO_USERNAME}" \
        --password="${MONGO_PASSWORD}" \
        --authenticationDatabase="${MONGO_AUTH_DB}" \
        --db="${MONGO_DATABASE}" \
        --out="${BACKUP_PATH}" \
        --gzip
else
    mongodump \
        --host="${MONGO_HOST}" \
        --port="${MONGO_PORT}" \
        --db="${MONGO_DATABASE}" \
        --out="${BACKUP_PATH}" \
        --gzip
fi

# Check if backup was successful
if [ $? -eq 0 ]; then
    echo "Backup completed successfully: ${BACKUP_PATH}"

    # Create a compressed archive
    cd "${BACKUP_DIR}"
    tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"

    # Remove uncompressed backup
    rm -rf "${BACKUP_NAME}"

    echo "Backup compressed: ${BACKUP_NAME}.tar.gz"
else
    echo "Backup failed!"
    exit 1
fi

# Remove old backups (older than RETENTION_DAYS)
echo "Removing backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "${BACKUP_PREFIX}_*.tar.gz" -type f -mtime +"${RETENTION_DAYS}" -delete

# List recent backups
echo "Recent backups:"
ls -lh "${BACKUP_DIR}" | grep "${BACKUP_PREFIX}_" | tail -10 || true

echo "Backup process completed"

# Optional: Upload to S3 or cloud storage
# if [ -n "${BACKUP_S3_BUCKET}" ]; then
#     echo "Uploading to S3: ${BACKUP_S3_BUCKET}"
#     aws s3 cp "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" "s3://${BACKUP_S3_BUCKET}/backups/"
# fi

# Keep script running if used with cron schedule
if [ -n "${BACKUP_CRON_SCHEDULE}" ]; then
    echo "Setting up cron schedule: ${BACKUP_CRON_SCHEDULE}"
    echo "${BACKUP_CRON_SCHEDULE} ${SCRIPT_PATH} >> /var/log/backup.log 2>&1" | crontab -
    cron -f
fi
