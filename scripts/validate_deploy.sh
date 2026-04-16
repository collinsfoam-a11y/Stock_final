#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env.prod}"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.production.yml"
ALLOW_PLACEHOLDERS="${ALLOW_PLACEHOLDERS:-false}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}PASS${NC}: $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC}: $1"; WARN=$((WARN + 1)); }

read_env_value() {
  local key="$1"
  local value
  value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d'=' -f2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  printf '%s' "$value"
}

echo "============================================"
echo "  Stock Verify - Deployment Validation"
echo "============================================"
echo ""

if [ ! -f "$ENV_FILE" ]; then
  fail "Environment file not found: $ENV_FILE"
  echo ""
  echo "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
  exit 1
fi
pass "Environment file exists: $(basename "$ENV_FILE")"

if [ ! -f "$COMPOSE_FILE" ]; then
  fail "Compose file missing: $(basename "$COMPOSE_FILE")"
  echo ""
  echo "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
  exit 1
fi
pass "Compose file exists: $(basename "$COMPOSE_FILE")"

echo "Phase 1: Required environment values"

required_keys=(
  DOMAIN
  CERTBOT_EMAIL
  DB_NAME
  BACKEND_IMAGE
  NGINX_IMAGE
  JWT_SECRET
  JWT_REFRESH_SECRET
  MONGO_ROOT_USER
  MONGO_ROOT_PASSWORD
  REDIS_PASSWORD
  ALLOWED_HOSTS
  CORS_ALLOW_ORIGINS
)

placeholder_pattern='CHANGE_ME|GENERATE|example\.com|ops@example\.com|yourdomain'

for key in "${required_keys[@]}"; do
  value="$(read_env_value "$key")"
  if [ -z "$value" ]; then
    fail "$key is missing"
    continue
  fi

  if echo "$value" | grep -Eiq "$placeholder_pattern"; then
    if [ "$ALLOW_PLACEHOLDERS" = "true" ]; then
      warn "$key still uses a placeholder value"
    else
      fail "$key still uses a placeholder value"
    fi
    continue
  fi

  pass "$key is configured"
done

for secret_key in JWT_SECRET JWT_REFRESH_SECRET MONGO_ROOT_PASSWORD REDIS_PASSWORD; do
  value="$(read_env_value "$secret_key")"
  if [ -n "$value" ] && [ "${#value}" -lt 24 ]; then
    fail "$secret_key should be at least 24 characters"
  elif [ -n "$value" ]; then
    pass "$secret_key length looks acceptable"
  fi
done

for toggle_key in AUTO_SEED_DEFAULT_USERS AUTO_SEED_MOCK_ERP_DATA; do
  value="$(read_env_value "$toggle_key")"
  if [ "$value" = "true" ]; then
    fail "$toggle_key must be false for production"
  else
    pass "$toggle_key is disabled"
  fi
done

auth_cookie_samesite="$(read_env_value AUTH_COOKIE_SAMESITE)"
force_https="$(read_env_value FORCE_HTTPS)"
auth_cookie_domain="$(read_env_value AUTH_COOKIE_DOMAIN)"

if [ "${auth_cookie_samesite:-lax}" = "none" ] && [ "${force_https:-true}" != "true" ]; then
  fail "AUTH_COOKIE_SAMESITE=none requires FORCE_HTTPS=true"
else
  pass "Cookie transport settings are internally consistent"
fi

if [ -z "$auth_cookie_domain" ]; then
  warn "AUTH_COOKIE_DOMAIN is empty; cookies will be host-only"
else
  pass "AUTH_COOKIE_DOMAIN is configured"
fi

echo ""
echo "Phase 2: Compose stack"

if command -v docker >/dev/null 2>&1; then
  pass "Docker is installed"
  if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null; then
    pass "docker compose config succeeds"
  else
    fail "docker compose config failed"
  fi
else
  warn "Docker is not installed; compose validation skipped"
fi

for required_path in \
  "${ROOT_DIR}/backend/Dockerfile" \
  "${ROOT_DIR}/nginx/Dockerfile" \
  "${ROOT_DIR}/nginx/nginx.conf" \
  "${ROOT_DIR}/scripts/init_letsencrypt.sh"; do
  if [ -f "$required_path" ]; then
    pass "Found $(basename "$required_path")"
  else
    fail "Missing $(basename "$required_path")"
  fi
done

if [ -f "${ROOT_DIR}/nginx/ssl/fullchain.pem" ] && [ -f "${ROOT_DIR}/nginx/ssl/privkey.pem" ]; then
  pass "TLS certificate files are present"
else
  warn "TLS certificate files are missing; run ./scripts/init_letsencrypt.sh before first deploy"
fi

echo ""
echo "============================================"
echo "  Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}, ${YELLOW}${WARN} warnings${NC}"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}NOT READY FOR DEPLOYMENT${NC}"
  exit 1
fi

echo -e "${GREEN}DEPLOYMENT VALIDATION PASSED${NC}"
