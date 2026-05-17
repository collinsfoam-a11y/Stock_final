#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.production.yml"
PRIMARY_ENV_FILE="${ROOT_DIR}/.env.prod"
FALLBACK_ENV_FILE="${ROOT_DIR}/.env.production.example"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
WARN=0

pass() { echo -e "${GREEN}PASS${NC}: $1"; PASS=$((PASS + 1)); }
fail() { echo -e "${RED}FAIL${NC}: $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "${YELLOW}WARN${NC}: $1"; WARN=$((WARN + 1)); }

check_path() {
  local path="$1"
  local display_path="${path#$ROOT_DIR/}"
  if [ -e "$path" ]; then
    pass "${display_path} exists"
  else
    fail "${display_path} is missing"
  fi
}

echo -e "${BLUE}Stock Verify - Production Readiness Checklist${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

echo -e "${BLUE}Core files${NC}"
check_path "${ROOT_DIR}/README.md"
check_path "${ROOT_DIR}/docs/TESTING_GUIDE.md"
check_path "${ROOT_DIR}/backend/Dockerfile"
check_path "${ROOT_DIR}/nginx/Dockerfile"
check_path "${ROOT_DIR}/nginx/nginx.conf"
check_path "${ROOT_DIR}/backend/.env.example"
check_path "${ROOT_DIR}/.env.production.example"
check_path "${ROOT_DIR}/scripts/init_letsencrypt.sh"
check_path "${ROOT_DIR}/scripts/backup_mongo.sh"
check_path "${ROOT_DIR}/scripts/restore_mongo.sh"
check_path "${ROOT_DIR}/.github/workflows/main.yml"

echo ""
echo -e "${BLUE}Canonical deployment path${NC}"
if [ -f "$COMPOSE_FILE" ]; then
  pass "Canonical compose file exists"
else
  fail "Canonical compose file is missing"
fi

for service in backend mongo redis nginx certbot; do
  if grep -q "^  ${service}:" "$COMPOSE_FILE"; then
    pass "Compose defines ${service} service"
  else
    fail "Compose is missing ${service} service"
  fi
done

echo ""
echo -e "${BLUE}Repository hygiene${NC}"
if bash "${ROOT_DIR}/scripts/check_repo_hygiene.sh" >/dev/null; then
  pass "Repository hygiene check passed"
else
  fail "Repository hygiene check failed"
fi

if [ -f "$PRIMARY_ENV_FILE" ]; then
  pass ".env.prod exists"
  VALIDATION_ENV_FILE="$PRIMARY_ENV_FILE"
  VALIDATION_ALLOW_PLACEHOLDERS=false
else
  warn ".env.prod is missing; falling back to .env.production.example for structural validation only"
  VALIDATION_ENV_FILE="$FALLBACK_ENV_FILE"
  VALIDATION_ALLOW_PLACEHOLDERS=true
fi

echo ""
echo -e "${BLUE}Deployment validation${NC}"
if ENV_FILE="$VALIDATION_ENV_FILE" ALLOW_PLACEHOLDERS="$VALIDATION_ALLOW_PLACEHOLDERS" \
  bash "${ROOT_DIR}/scripts/validate_deploy.sh" >/dev/null; then
  if [ "$VALIDATION_ALLOW_PLACEHOLDERS" = "true" ]; then
    warn "Deployment structure validated with example env only; real secrets still need to be supplied in .env.prod"
  else
    pass "Deployment validation passed with .env.prod"
  fi
else
  fail "Deployment validation failed"
fi

echo ""
echo -e "${BLUE}Summary${NC}"
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "Warnings: $WARN"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}NOT READY${NC}"
  exit 1
fi

echo -e "${GREEN}READY TO COMPLETE OPERATOR SETUP${NC}"
exit 0
