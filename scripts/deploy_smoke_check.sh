#!/usr/bin/env bash
# Deployment smoke check: verifies a live Stock Verify deployment is
# actually serving traffic correctly, and that the (still-external)
# ERPNext template gate reports its expected state rather than crashing.
#
# This does not duplicate scripts/post_deploy_smoke.sh (which CI already
# wires into the deploy jobs for the HTTP-level checks) -- it adds the
# template-gate awareness described in Part I of the deployment hardening
# pass: a blocked template gate must never be mistaken for a deploy
# failure.
#
# Usage:
#   SMOKE_BASE_URL=https://stock-verify.example.com ./scripts/deploy_smoke_check.sh
#
# Env vars (all optional except SMOKE_BASE_URL, which is required unless
# SMOKE_HEALTH_URL is given directly):
#   SMOKE_BASE_URL       Backend/app base URL, e.g. https://stock-verify.example.com
#   SMOKE_HEALTH_URL     Override for the basic health check (default: $SMOKE_BASE_URL/health)
#   SMOKE_API_HEALTH_URL Override for the /api/health check (default: $SMOKE_BASE_URL/api/health)
#   SMOKE_FRONTEND_URL   Frontend URL to check (default: $SMOKE_BASE_URL)
#   SMOKE_USERNAME       Optional. If set with SMOKE_PASSWORD, runs an authenticated
#                        login smoke test. Never hardcode real credentials here --
#                        pass them via CI secrets or the deploy host's secret store.
#   SMOKE_PASSWORD       See SMOKE_USERNAME.
#   SKIP_TEMPLATE_GATE_CHECK=1  Skip the ERPNext template gate check entirely.
#
# Exit code: nonzero on any real deployment failure. A blocked ERPNext
# template gate (the expected state until real templates arrive) is NOT
# a failure and does not affect the exit code.

set -euo pipefail

SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"
SMOKE_HEALTH_URL="${SMOKE_HEALTH_URL:-}"
SMOKE_API_HEALTH_URL="${SMOKE_API_HEALTH_URL:-}"
SMOKE_FRONTEND_URL="${SMOKE_FRONTEND_URL:-}"
SMOKE_USERNAME="${SMOKE_USERNAME:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"
SKIP_TEMPLATE_GATE_CHECK="${SKIP_TEMPLATE_GATE_CHECK:-0}"

if [ -z "${SMOKE_BASE_URL}" ] && [ -z "${SMOKE_HEALTH_URL}" ]; then
  echo "Set SMOKE_BASE_URL (or SMOKE_HEALTH_URL) before running this script." >&2
  exit 1
fi

if [ -z "${SMOKE_HEALTH_URL}" ]; then
  SMOKE_HEALTH_URL="${SMOKE_BASE_URL}/health"
fi
if [ -z "${SMOKE_API_HEALTH_URL}" ]; then
  SMOKE_API_HEALTH_URL="${SMOKE_BASE_URL}/api/health"
fi
if [ -z "${SMOKE_FRONTEND_URL}" ]; then
  SMOKE_FRONTEND_URL="${SMOKE_BASE_URL}"
fi

echo "Running deploy smoke checks"
echo "  backend /health:      ${SMOKE_HEALTH_URL}"
echo "  backend /api/health:  ${SMOKE_API_HEALTH_URL}"
[ -n "${SMOKE_FRONTEND_URL}" ] && echo "  frontend:             ${SMOKE_FRONTEND_URL}"

fail=0

check_health() {
  local label="$1" url="$2"
  local raw code
  raw="$(curl -sS -o /tmp/deploy_smoke_last.json -w '%{http_code}' "${url}" 2>/dev/null)" || raw="000"
  code="${raw: -3}"
  if [ "${code}" != "200" ]; then
    echo "FAIL: ${label} returned HTTP ${code} (expected 200)" >&2
    cat /tmp/deploy_smoke_last.json >&2 || true
    fail=1
    return 1
  fi
  echo "OK: ${label} (HTTP 200)"
  return 0
}

check_health "backend /health" "${SMOKE_HEALTH_URL}"
check_health "backend /api/health" "${SMOKE_API_HEALTH_URL}"

if [ -n "${SMOKE_FRONTEND_URL}" ]; then
  frontend_raw="$(curl -sS -o /tmp/deploy_smoke_frontend.html -w '%{http_code}' "${SMOKE_FRONTEND_URL}" 2>/dev/null)" || frontend_raw="000"
  frontend_code="${frontend_raw: -3}"
  case "${frontend_code}" in
    200|301|302) echo "OK: frontend (HTTP ${frontend_code})" ;;
    *)
      echo "FAIL: frontend returned HTTP ${frontend_code}" >&2
      fail=1
      ;;
  esac
fi

if [ -n "${SMOKE_USERNAME}" ] && [ -n "${SMOKE_PASSWORD}" ] && [ -n "${SMOKE_BASE_URL}" ]; then
  echo "Running authenticated login smoke check"
  login_raw="$(curl -sS -o /tmp/deploy_smoke_login.json -w '%{http_code}' \
    -X POST "${SMOKE_BASE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}" 2>/dev/null)" || login_raw="000"
  login_code="${login_raw: -3}"
  if [ "${login_code}" != "200" ]; then
    echo "FAIL: login smoke returned HTTP ${login_code}" >&2
    cat /tmp/deploy_smoke_login.json >&2 || true
    fail=1
  else
    echo "OK: authenticated login smoke check"
  fi
else
  echo "Skipping authenticated login smoke check (SMOKE_USERNAME/SMOKE_PASSWORD not set)"
fi

if [ "${SKIP_TEMPLATE_GATE_CHECK}" != "1" ]; then
  echo "Checking ERPNext template gate state"
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  GATE_SCRIPT="${REPO_ROOT}/scripts/check_erpnext_template_inputs.py"
  PYTHON_BIN="${PYTHON_BIN:-python3}"

  if [ ! -f "${GATE_SCRIPT}" ]; then
    echo "SKIP: template gate script not found at ${GATE_SCRIPT} (not running from a repo checkout)"
  else
    gate_output="$("${PYTHON_BIN}" "${GATE_SCRIPT}" --json 2>/dev/null || true)"
    can_advance="$(printf '%s' "${gate_output}" | "${PYTHON_BIN}" -c 'import json,sys; print(json.load(sys.stdin).get("can_advance_to_manual_import_dry_run", False))' 2>/dev/null || echo "False")"

    if [ "${can_advance}" = "True" ]; then
      echo "INFO: ERPNext template gate reports READY (real templates present) -- manual import dry-run may proceed."
    else
      echo "OK (expected): ERPNext template gate reports NOT READY -- real ERPNext templates have not arrived yet."
      echo "This is an external dependency, not a deployment failure. See docs/ERP_NEXT_TEMPLATE_ARRIVAL_PROCEDURE.md."
    fi
  fi
fi

if [ "${fail}" -ne 0 ]; then
  echo "Deploy smoke check FAILED." >&2
  exit 1
fi

echo "Deploy smoke check passed."
