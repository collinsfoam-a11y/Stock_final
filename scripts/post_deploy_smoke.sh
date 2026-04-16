#!/usr/bin/env bash

set -euo pipefail

SMOKE_HEALTH_URL="${SMOKE_HEALTH_URL:-}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-}"
SMOKE_FRONTEND_URL="${SMOKE_FRONTEND_URL:-}"
SMOKE_USERNAME="${SMOKE_USERNAME:-}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"

if [ -z "${SMOKE_HEALTH_URL}" ] && [ -z "${SMOKE_BASE_URL}" ]; then
  echo "Set SMOKE_HEALTH_URL or SMOKE_BASE_URL before running post-deploy smoke checks." >&2
  exit 1
fi

if [ -z "${SMOKE_BASE_URL}" ] && [ -n "${SMOKE_HEALTH_URL}" ]; then
  SMOKE_BASE_URL="$(printf '%s' "${SMOKE_HEALTH_URL}" | sed -E 's#/(api/health|healthz|health)/?$##')"
fi

if [ -z "${SMOKE_HEALTH_URL}" ]; then
  SMOKE_HEALTH_URL="${SMOKE_BASE_URL}/api/health"
fi

if [ -z "${SMOKE_FRONTEND_URL}" ]; then
  SMOKE_FRONTEND_URL="${SMOKE_BASE_URL}"
fi

echo "Running post-deploy smoke checks"
echo "  health:   ${SMOKE_HEALTH_URL}"
echo "  backend:  ${SMOKE_BASE_URL}"
echo "  frontend: ${SMOKE_FRONTEND_URL}"

health_code="$(curl -sS -o /tmp/post_deploy_health.json -w '%{http_code}' "${SMOKE_HEALTH_URL}")"
if [ "${health_code}" != "200" ]; then
  echo "Health check failed with HTTP ${health_code}" >&2
  cat /tmp/post_deploy_health.json >&2 || true
  exit 1
fi

frontend_code="$(curl -sS -o /tmp/post_deploy_frontend.html -w '%{http_code}' "${SMOKE_FRONTEND_URL}")"
case "${frontend_code}" in
  200|301|302) ;;
  *)
    echo "Frontend smoke failed with HTTP ${frontend_code}" >&2
    exit 1
    ;;
esac

docs_code="$(curl -sS -o /tmp/post_deploy_docs.html -w '%{http_code}' "${SMOKE_BASE_URL}/docs")"
if [ "${docs_code}" != "200" ]; then
  echo "Docs smoke failed with HTTP ${docs_code}" >&2
  exit 1
fi

if [ -n "${SMOKE_USERNAME}" ] && [ -n "${SMOKE_PASSWORD}" ]; then
  echo "Running authenticated smoke checks"
  login_code="$(curl -sS -o /tmp/post_deploy_login.json -w '%{http_code}' \
    -X POST "${SMOKE_BASE_URL}/api/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"username\":\"${SMOKE_USERNAME}\",\"password\":\"${SMOKE_PASSWORD}\"}")"
  if [ "${login_code}" != "200" ]; then
    echo "Login smoke failed with HTTP ${login_code}" >&2
    cat /tmp/post_deploy_login.json >&2 || true
    exit 1
  fi

  token="$(python3 -c 'import json,sys; payload=json.load(open("/tmp/post_deploy_login.json")); data=payload.get("data", payload); print(data.get("access_token",""))')"
  if [ -z "${token}" ]; then
    echo "Login smoke did not return access_token" >&2
    exit 1
  fi

  protected_code="$(curl -sS -o /tmp/post_deploy_sessions.json -w '%{http_code}' \
    -H "Authorization: Bearer ${token}" \
    "${SMOKE_BASE_URL}/api/sessions")"
  if [ "${protected_code}" != "200" ]; then
    echo "Protected route smoke failed with HTTP ${protected_code}" >&2
    cat /tmp/post_deploy_sessions.json >&2 || true
    exit 1
  fi
else
  echo "Skipping authenticated smoke checks because SMOKE_USERNAME/SMOKE_PASSWORD are not set."
fi

echo "Post-deploy smoke checks passed."
