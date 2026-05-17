#!/bin/bash

# MongoDB Restore Script
# Usage: ./restore.sh <backup_file.tar.gz>

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_file.tar.gz>"
    echo "Example: $0 /backups/stock_verify_backup_20250107_020000.tar.gz"
    exit 1
fi

BACKUP_FILE=$1

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

# Configuration
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_USERNAME="${MONGO_USERNAME:-admin}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_DB="${MONGO_AUTH_DB:-admin}"
MONGO_DATABASE="${MONGO_DATABASE:-stock_verification}"
RESTORE_DIR="/tmp/restore_$(date +%s)"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"

echo "Starting MongoDB restore from: ${BACKUP_FILE}"
echo "⚠️  WARNING: This will drop the existing database!"
if [ "$RESTORE_CONFIRM" != "yes" ]; then
    read -p "Are you sure you want to continue? (yes/no): " confirm
else
    confirm="yes"
fi

if [ "${confirm}" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

# Create temporary restore directory
mkdir -p "${RESTORE_DIR}"

# Extract backup
echo "Extracting backup..."
tar -xzf "${BACKUP_FILE}" -C "${RESTORE_DIR}"

# Find the database directory
DB_DIR=$(find "${RESTORE_DIR}" -type d -name "${MONGO_DATABASE}")

if [ -z "${DB_DIR}" ]; then
    echo "Error: Database directory not found in backup"
    rm -rf "${RESTORE_DIR}"
    exit 1
fi

SOURCE_DB_NAME="$(basename "${DB_DIR}")"
RESTORE_SOURCE_DIR="$(dirname "${DB_DIR}")"

# Perform mongorestore with drop
echo "Restoring database..."
restore_args=(
    --host="${MONGO_HOST}"
    --port="${MONGO_PORT}"
    --drop
    --gzip
    --dir="${RESTORE_SOURCE_DIR}"
    --nsInclude="${SOURCE_DB_NAME}.*"
)

if [ "${SOURCE_DB_NAME}" != "${MONGO_DATABASE}" ]; then
    restore_args+=(
        --nsFrom="${SOURCE_DB_NAME}.*"
        --nsTo="${MONGO_DATABASE}.*"
    )
fi

if [ -n "${MONGO_PASSWORD}" ]; then
    restore_args=(
        --username="${MONGO_USERNAME}"
        --password="${MONGO_PASSWORD}"
        --authenticationDatabase="${MONGO_AUTH_DB}"
        "${restore_args[@]}"
    )
fi

mongorestore "${restore_args[@]}"

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo "✅ Restore completed successfully"
else
    echo "❌ Restore failed!"
    exit 1
fi

# Cleanup
rm -rf "${RESTORE_DIR}"

echo "Restore process completed"
