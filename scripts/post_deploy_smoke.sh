#!/bin/bash
set -euo pipefail

HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1:8001/api/health}"

echo "Running post-deploy smoke check against $HEALTHCHECK_URL..."

for i in $(seq 1 30); do
    if curl -fsS "$HEALTHCHECK_URL" >/dev/null; then
        echo "✅ Health check passed"
        exit 0
    fi
    echo "Attempt $i: waiting for health check..."
    sleep 10
done

echo "❌ Health check failed after 30 attempts"
exit 1
