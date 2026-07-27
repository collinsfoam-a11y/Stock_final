#!/bin/bash
set -euo pipefail

echo "Running final system validation..."

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8001}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:8081}"

check_url() {
    local url="$1"
    local name="$2"
    if curl -fsS "$url" >/dev/null; then
        echo "OK: $name ($url)"
    else
        echo "FAIL: $name ($url)"
        exit 1
    fi
}

check_url "$BACKEND_URL/api/health" "Backend health"
check_url "$FRONTEND_URL" "Frontend"

echo "Final system validation passed"
