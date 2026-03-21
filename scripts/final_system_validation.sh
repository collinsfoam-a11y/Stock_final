#!/bin/bash

# Final validation for the canonical local/compose stack.
# Uses current endpoints and optional operator-provided credentials.

set -euo pipefail
chmod +x "$0" 2>/dev/null || true

BACKEND_URL="${BACKEND_URL:-http://localhost:8001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8081}"
MONGO_HOST="${MONGO_HOST:-localhost:27017}"
REDIS_HOST="${REDIS_HOST:-localhost:6379}"
AUTH_USERNAME="${AUTH_USERNAME:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
VALIDATION_LOG="${VALIDATION_LOG:-/tmp/system_validation.log}"

if command -v curl.exe >/dev/null 2>&1; then
    CURL_BIN="curl.exe"
else
    CURL_BIN="curl"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Stock Verify Final System Validation${NC}"
echo -e "${BLUE}======================================${NC}"
echo "Backend: ${BACKEND_URL}"
echo "Frontend: ${FRONTEND_URL}"
echo "Log file: ${VALIDATION_LOG}"
echo ""

cat > "$VALIDATION_LOG" <<EOF_LOG
Stock Verify Final System Validation
Date: $(date)
Backend: ${BACKEND_URL}
Frontend: ${FRONTEND_URL}
====================================
EOF_LOG

log_message() {
    local level="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" >> "$VALIDATION_LOG"

    case "$level" in
        "INFO") echo -e "${BLUE}[INFO] ${message}${NC}" ;;
        "SUCCESS") echo -e "${GREEN}[OK] ${message}${NC}" ;;
        "WARNING") echo -e "${YELLOW}[WARN] ${message}${NC}" ;;
        "ERROR") echo -e "${RED}[ERR] ${message}${NC}" ;;
    esac
}

assert_http_ok() {
    local name="$1"
    local url="$2"
    local allowed="${3:-200}"
    local code
    code=$("$CURL_BIN" -sS -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null || true)
    code="${code:0:3}"
    if [ -z "$code" ]; then
        code="000"
    fi

    if echo " ${allowed} " | grep -q " ${code} "; then
        log_message "SUCCESS" "${name} responded with HTTP ${code}"
        return 0
    fi

    log_message "ERROR" "${name} responded with HTTP ${code}"
    return 1
}

check_port() {
    local name="$1"
    local port="$2"
    if command -v lsof >/dev/null 2>&1 && lsof -i :"$port" 2>/dev/null | grep -q LISTEN; then
        log_message "SUCCESS" "${name} is listening on port ${port}"
        return 0
    fi
    log_message "WARNING" "${name} is not listening on port ${port}"
    return 1
}

check_database() {
    if command -v mongosh >/dev/null 2>&1; then
        if mongosh "mongodb://${MONGO_HOST}/admin" --quiet --eval "db.adminCommand({ ping: 1 }).ok" >/dev/null 2>&1; then
            log_message "SUCCESS" "MongoDB ping succeeded (${MONGO_HOST})"
            return 0
        fi
        log_message "ERROR" "MongoDB ping failed (${MONGO_HOST})"
        return 1
    fi

    log_message "WARNING" "mongosh not available; skipping MongoDB ping"
    return 0
}

check_redis() {
    if command -v redis-cli >/dev/null 2>&1; then
        if redis-cli -h "${REDIS_HOST%%:*}" -p "${REDIS_HOST##*:}" ping 2>/dev/null | grep -q "PONG"; then
            log_message "SUCCESS" "Redis ping succeeded (${REDIS_HOST})"
            return 0
        fi
        log_message "WARNING" "Redis ping failed (${REDIS_HOST})"
        return 1
    fi

    log_message "WARNING" "redis-cli not available; skipping Redis ping"
    return 0
}

check_auth_flow() {
    if [ -z "$AUTH_USERNAME" ] || [ -z "$AUTH_PASSWORD" ]; then
        log_message "WARNING" "AUTH_USERNAME/AUTH_PASSWORD not set; skipping auth validation"
        return 0
    fi

    local login_response
    local token
    local protected_code

    login_response=$("$CURL_BIN" -fsS -X POST "${BACKEND_URL}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"username\":\"${AUTH_USERNAME}\",\"password\":\"${AUTH_PASSWORD}\"}") || {
        log_message "ERROR" "Login request failed"
        return 1
    }

    token=$(printf "%s" "$login_response" | python3 -c 'import json,sys; data=json.load(sys.stdin); payload=data.get("data", data); print(payload.get("access_token",""))')
    if [ -z "$token" ]; then
        log_message "ERROR" "Login response did not include access_token"
        return 1
    fi
    log_message "SUCCESS" "Login returned an access token"

    protected_code=$("$CURL_BIN" -sS -o /dev/null -w "%{http_code}" \
        -H "Authorization: Bearer ${token}" \
        "${BACKEND_URL}/api/sessions")
    protected_code="${protected_code:0:3}"
    if [ "$protected_code" = "200" ]; then
        log_message "SUCCESS" "Protected session route responded with HTTP 200"
        return 0
    fi

    log_message "ERROR" "Protected session route responded with HTTP ${protected_code}"
    return 1
}

run_local_checks() {
    log_message "INFO" "Checking local listeners"
    check_port "Backend API" "8001" || true
    check_port "Frontend Web" "8081" || true

    log_message "INFO" "Checking HTTP endpoints"
    assert_http_ok "Backend health" "${BACKEND_URL}/api/health" "200" || return 1
    assert_http_ok "Backend docs" "${BACKEND_URL}/docs" "200" || true
    assert_http_ok "Frontend web" "${FRONTEND_URL}" "200 301 302 404" || true

    log_message "INFO" "Checking backing services"
    check_database || return 1
    check_redis || true

    log_message "INFO" "Checking auth flow"
    check_auth_flow || return 1

    return 0
}

main() {
    local overall_status=0
    run_local_checks || overall_status=1

    echo ""
    echo -e "${BLUE}======================================${NC}"
    if [ "$overall_status" -eq 0 ]; then
        log_message "SUCCESS" "Final validation completed successfully"
        echo -e "${GREEN}System validation completed successfully${NC}"
    else
        log_message "ERROR" "Final validation completed with issues"
        echo -e "${YELLOW}System validation completed with issues${NC}"
    fi
    echo -e "${BLUE}Validation Log: ${VALIDATION_LOG}${NC}"
    echo ""
    return "$overall_status"
}

main
