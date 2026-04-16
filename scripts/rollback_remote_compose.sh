#!/usr/bin/env bash

set -euo pipefail

if [ -z "${BACKEND_IMAGE:-}" ] || [ -z "${NGINX_IMAGE:-}" ]; then
  echo "Set BACKEND_IMAGE and NGINX_IMAGE to the rollback image tags before running this script." >&2
  exit 1
fi

exec "$(cd "$(dirname "$0")" && pwd)/deploy_remote_compose.sh"
