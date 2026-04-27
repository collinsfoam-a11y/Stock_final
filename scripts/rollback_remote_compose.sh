#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "${ROOT_DIR}/scripts/approval_guard.sh"
require_approval_context

if [ -z "${BACKEND_IMAGE:-}" ] || [ -z "${NGINX_IMAGE:-}" ]; then
  echo "Set BACKEND_IMAGE and NGINX_IMAGE to the rollback image tags before running this script." >&2
  exit 1
fi

exec "${ROOT_DIR}/scripts/deploy_remote_compose.sh"
