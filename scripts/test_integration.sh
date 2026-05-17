#!/bin/bash

# Current integration smoke suite for the canonical backend stack.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8001}"
AUTH_USERNAME="${AUTH_USERNAME:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
TOKEN=""

echo "🧪 StockVerify Integration Smoke"
echo "================================"
echo "Base URL: ${BASE_URL}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

error() {
    echo -e "${RED}✗ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

echo ""
echo "Test 1: Backend Health"
echo "----------------------"
response=$(curl -fsS "${BASE_URL}/api/health")
if echo "$response" | grep -q '"status":"healthy"\|"status": "healthy"\|"status":"degraded"\|"status": "degraded"'; then
    success "Backend responded to /api/health"
else
    error "Backend health check failed"
    exit 1
fi

echo ""
echo "Test 2: API Docs"
echo "----------------"
if curl -fsS -o /dev/null "${BASE_URL}/docs"; then
    success "API docs endpoint responded"
else
    warning "API docs endpoint did not respond"
fi

echo ""
echo "Test 3: Redis Connectivity"
echo "--------------------------"
if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping | grep -q "PONG"; then
        success "Redis is reachable"
    else
        warning "Redis ping failed"
    fi
else
    warning "redis-cli not installed; skipping Redis check"
fi

if [ -n "$AUTH_USERNAME" ] && [ -n "$AUTH_PASSWORD" ]; then
    echo ""
    echo "Test 4: Auth + Protected Route"
    echo "------------------------------"
    login_response=$(curl -fsS -X POST "${BASE_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"${AUTH_USERNAME}\",\"password\":\"${AUTH_PASSWORD}\"}")

    TOKEN=$(printf "%s" "$login_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); payload=data.get("data", data); print(payload.get("access_token",""))')

    if [ -z "$TOKEN" ]; then
        error "Login did not return an access token"
        exit 1
    fi

    success "Login succeeded"

    protected_status=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${TOKEN}" \
        "${BASE_URL}/api/sessions")
    if [ "$protected_status" = "200" ]; then
        success "Protected session route is reachable"
    else
        error "Protected session route returned HTTP ${protected_status}"
        exit 1
    fi
else
    echo ""
    warning "AUTH_USERNAME/AUTH_PASSWORD not provided; skipping authenticated checks"
fi

echo ""
echo "================================"
echo "Integration Smoke Summary"
echo "================================"
success "Smoke suite completed"
