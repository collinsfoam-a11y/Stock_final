#!/usr/bin/env bash
set -Eeuo pipefail

# Read-only active-location preflight. This script never sets APPLY and never
# executes an index drop, backfill, or create operation.
# Usage:
#   ENVIRONMENT=staging MONGO_URL='<MONGO_URI_FROM_SECRET_MANAGER>' \
#     ./scripts/run_active_location_preflight.sh

if [[ "${ENVIRONMENT:-}" != "staging" ]]; then
  printf 'ERROR: set ENVIRONMENT=staging; refusing non-staging target\n' >&2
  exit 2
fi

if [[ -z "${MONGO_URL:-}" ]]; then
  printf 'ERROR: MONGO_URL is required and must be supplied by the secret manager\n' >&2
  exit 2
fi

case "$MONGO_URL" in
  *127.0.0.1*|*localhost*|*0.0.0.0*)
    printf 'ERROR: refusing local MongoDB target; staging preflight requires a staging host\n' >&2
    exit 2
    ;;
esac

if ! command -v mongosh >/dev/null 2>&1; then
  printf 'ERROR: mongosh is required\n' >&2
  exit 2
fi

# The migration file is read-only unless APPLY=true and the explicit approval
# token are supplied. This launcher deliberately supplies neither.
exec mongosh "$MONGO_URL" --quiet --file scripts/active_location_unique_index_migration.js
