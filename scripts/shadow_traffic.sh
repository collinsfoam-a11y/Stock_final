#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8001}"
ITERATIONS="${ITERATIONS:-100}"
SLEEP_SECONDS="${SLEEP_SECONDS:-0.05}"

make_token() {
  local username="$1"
  PYTHONPATH="$ROOT_DIR" "$ROOT_DIR/scripts/python.sh" - <<PY
from backend.utils.auth_utils import create_access_token
print(create_access_token({"sub": "$username"}))
PY
}

request_get() {
  local token="$1"
  local request_path="$2"
  curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${token}" \
    "${BASE_URL}${request_path}"
}

request_report() {
  local token="$1"
  local report_type="$2"
  curl -sS -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data "{\"report_type\":\"${report_type}\",\"filters\":{},\"format\":\"json\",\"include_summary\":true}" \
    "${BASE_URL}/api/reports/generate"
}

echo "Generating shadow traffic against ${BASE_URL}"

ADMIN_TOKEN="$(make_token admin)"
STAFF_TOKEN="$(make_token staff1)"
failures=0
requests=0

for ((i = 1; i <= ITERATIONS; i++)); do
  for request_path in \
    "/api/dashboard/stats" \
    "/api/dashboard/filters/options"; do
    code="$(request_get "$STAFF_TOKEN" "$request_path")"
    requests=$((requests + 1))
    if [[ ! "$code" =~ ^2 ]]; then
      failures=$((failures + 1))
      printf 'non_2xx path=%s code=%s iteration=%s\n' "$request_path" "$code" "$i" >&2
    fi
  done

  code="$(request_get "$ADMIN_TOKEN" "/api/admin/dashboard/kpis")"
  requests=$((requests + 1))
  if [[ ! "$code" =~ ^2 ]]; then
    failures=$((failures + 1))
    printf 'non_2xx path=%s code=%s iteration=%s\n' "/api/admin/dashboard/kpis" "$code" "$i" >&2
  fi

  for report_type in stock_summary variance_report session_history; do
    code="$(request_report "$ADMIN_TOKEN" "$report_type")"
    requests=$((requests + 1))
    if [[ ! "$code" =~ ^2 ]]; then
      failures=$((failures + 1))
      printf 'non_2xx report=%s code=%s iteration=%s\n' "$report_type" "$code" "$i" >&2
    fi
  done

  sleep "$SLEEP_SECONDS"
done

printf 'Shadow traffic complete: requests=%s failures=%s iterations=%s\n' \
  "$requests" "$failures" "$ITERATIONS"

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi
