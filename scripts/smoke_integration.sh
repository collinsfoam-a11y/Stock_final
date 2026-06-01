#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REQUIRE_MONGO="${REQUIRE_MONGO:-false}"
BASE_URL="${BASE_URL:-http://localhost:8001}"
BACKEND_PID_FILE="${BACKEND_PID_FILE:-$PROJECT_ROOT/backend/.smoke_backend.pid}"
BACKEND_LOG_FILE="${BACKEND_LOG_FILE:-$PROJECT_ROOT/backend/backend_smoke.log}"

have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

mongo_reachable() {
  "$SCRIPT_DIR/python.sh" - <<'PY'
import os
import socket
import sys
from urllib.parse import urlparse

mongo_url = os.getenv("MONGO_URL", "mongodb://localhost:27017")
parsed = urlparse(mongo_url)
host = parsed.hostname or "localhost"
port = parsed.port or 27017
s = socket.socket()
s.settimeout(1.0)
try:
    s.connect((host, port))
    print("ok")
    sys.exit(0)
except Exception:
    sys.exit(1)
finally:
    try:
        s.close()
    except Exception:
        pass
PY
}

start_backend() {
  pkill -f "python.*server.py" 2>/dev/null || true
  pkill -f "uvicorn.*server" 2>/dev/null || true

  export PYTHONPATH="$PROJECT_ROOT:${PYTHONPATH:-}"
  export USE_CONNECTION_POOL=False
  export SQL_SERVER_HOST=""
  export SSL_KEYFILE=""
  export SSL_CERTFILE=""
  export DISABLE_SSL="true"
  unset DEBUG || true

  export AUTO_SEED_DEFAULT_USERS="${AUTO_SEED_DEFAULT_USERS:-true}"
  export AUTO_SEED_MOCK_ERP_DATA="${AUTO_SEED_MOCK_ERP_DATA:-true}"

  if [[ -z "${JWT_SECRET:-}" ]]; then
    export JWT_SECRET="$("$SCRIPT_DIR/python.sh" -c 'import secrets;print(secrets.token_urlsafe(48))')"
  fi
  if [[ -z "${JWT_REFRESH_SECRET:-}" ]]; then
    export JWT_REFRESH_SECRET="$("$SCRIPT_DIR/python.sh" -c 'import secrets;print(secrets.token_urlsafe(48))')"
  fi

  (
    cd "$PROJECT_ROOT/backend"
    "$SCRIPT_DIR/python.sh" server.py >"$BACKEND_LOG_FILE" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )
}

stop_backend() {
  if [[ -f "$BACKEND_PID_FILE" ]]; then
    pid="$(cat "$BACKEND_PID_FILE" 2>/dev/null || true)"
    rm -f "$BACKEND_PID_FILE" || true
    if [[ -n "${pid:-}" ]]; then
      kill "$pid" 2>/dev/null || true
    fi
  fi
  pkill -f "python.*server.py" 2>/dev/null || true
  pkill -f "uvicorn.*server" 2>/dev/null || true
}

wait_for_health() {
  "$SCRIPT_DIR/python.sh" - <<PY
import sys
import time
import httpx

base_url = "${BASE_URL}"
health_urls = [
    base_url.rstrip("/") + "/health",
    base_url.rstrip("/") + "/health/",
    base_url.rstrip("/") + "/api/health",
]

deadline = time.time() + 45
last_error = None
while time.time() < deadline:
    for url in health_urls:
        try:
            r = httpx.get(url, timeout=2.0)
            if r.status_code == 200:
                print("ok")
                sys.exit(0)
        except Exception as exc:
            last_error = exc
    time.sleep(1)

print(f"Backend did not become healthy. Last error: {last_error!r}")
sys.exit(1)
PY
}

run_verifications() {
  "$SCRIPT_DIR/python.sh" "$PROJECT_ROOT/backend/tests/verify_operational.py"
  "$SCRIPT_DIR/python.sh" "$PROJECT_ROOT/backend/tests/verify_security_api.py"
  "$SCRIPT_DIR/python.sh" "$PROJECT_ROOT/backend/tests/verify_integration_flow.py"
}

main() {
  if mongo_reachable; then
    :
  else
    if [[ "$REQUIRE_MONGO" == "true" ]]; then
      echo "MongoDB is not reachable. Set MONGO_URL to a running MongoDB instance or start one locally."
      exit 2
    fi
    echo "Skipping integration smoke: MongoDB is not reachable."
    exit 0
  fi

  trap stop_backend EXIT INT TERM

  start_backend
  wait_for_health
  run_verifications
}

main "$@"

