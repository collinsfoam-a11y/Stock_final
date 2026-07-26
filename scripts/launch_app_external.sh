#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════════
# launch_app_external.sh — Run the Stock Verify app fully OUTSIDE the IDE.
#
# Opens separate macOS Terminal.app windows so you can watch each log live:
#   • Terminal window "MongoDB"  — Mongo via docker compose
#   • Terminal window "Backend"  — FastAPI / uvicorn on :8001
#   • Terminal window "Frontend" — Expo dev server on :8081
#
# Also opens Docker Desktop so the container state is visible while you work.
#
# Usage:
#   bash scripts/launch_app_external.sh          # start everything
#   bash scripts/launch_app_external.sh --no-docker  # skip Docker Desktop + Mongo container
#   bash scripts/launch_app_external.sh --stop       # stop everything
# ════════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_DIR="$PROJECT_ROOT/backend"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.yml"
LOG_DIR="$PROJECT_ROOT/.run-logs"

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info() { printf "${CYAN}ℹ  %s${NC}\n" "$*"; }
ok()   { printf "${GREEN}✅ %s${NC}\n" "$*"; }
warn() { printf "${YELLOW}⚠️  %s${NC}\n" "$*"; }
err()  { printf "${RED}❌ %s${NC}\n" "$*"; }

# ── Argument parsing ─────────────────────────────────────────────────────────
USE_DOCKER=1
ACTION="start"
for arg in "$@"; do
    case "$arg" in
        --no-docker) USE_DOCKER=0 ;;
        --stop)      ACTION="stop" ;;
        -h|--help)
            sed -n '2,18p' "$0"
            exit 0
            ;;
        *) warn "Unknown argument: $arg" ;;
    esac
done

mkdir -p "$LOG_DIR"

# ── Stop mode ────────────────────────────────────────────────────────────────
if [[ "$ACTION" == "stop" ]]; then
    info "Stopping all services..."
    bash "$SCRIPT_DIR/stop_all.sh" 2>/dev/null || true
    if [[ "$USE_DOCKER" -eq 1 ]] && command -v docker >/dev/null 2>&1; then
        docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
    fi
    ok "All services stopped."
    exit 0
fi

# ── 1. Stop anything that may already be running ─────────────────────────────
info "Stopping any running services first..."
bash "$SCRIPT_DIR/stop_all.sh" 2>/dev/null || true
if [[ "$USE_DOCKER" -eq 1 ]] && command -v docker >/dev/null 2>&1; then
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null || true
fi
sleep 2

# ── 2. Open Docker Desktop (if needed) ───────────────────────────────────────
if [[ "$USE_DOCKER" -eq 1 ]]; then
    if pgrep -x "Docker" >/dev/null 2>&1; then
        info "Docker Desktop is already running."
    else
        info "Opening Docker Desktop..."
        if [[ -d "/Applications/Docker.app" ]]; then
            open -a Docker
            # Wait for the Docker daemon to be ready
            info "Waiting for Docker daemon to be ready..."
            for i in {1..40}; do
                if docker info >/dev/null 2>&1; then
                    ok "Docker daemon is ready."
                    break
                fi
                sleep 1
                if [[ "$i" -eq 40 ]]; then
                    warn "Docker daemon did not respond in 40s. Continuing anyway."
                fi
            done
        else
            warn "Docker.app not found in /Applications. Skipping Docker Desktop launch."
        fi
    fi
else
    info "Skipping Docker (--no-docker)."
fi

# ── 3. Decide how to start MongoDB ───────────────────────────────────────────
START_MONGO_VIA_DOCKER=0
if lsof -nP -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then
    info "Port 27017 is already bound (local mongod is running) — skipping docker mongo."
elif [[ "$USE_DOCKER" -eq 1 ]] && command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    START_MONGO_VIA_DOCKER=1
fi

# Helper: launch a command in a new Terminal.app window with a coloured title.
# Writes the body to a temp .sh and invokes it — avoids AppleScript quoting bugs.
launch_in_terminal() {
    local title="$1"
    local body="$2"
    local tmpfile
    tmpfile="$(mktemp -t stockverify_${title}.XXXXXX.sh)"
    printf '%s\n' "$body" > "$tmpfile"
    chmod +x "$tmpfile"
    osascript -e "tell application \"Terminal\" to do script \"bash '$tmpfile'\"" >/dev/null
    sleep 0.4
    osascript -e "tell application \"Terminal\" to set custom title of front window to \"$title\"" >/dev/null 2>&1 || true
}

# ── 4. MongoDB window ───────────────────────────────────────────────────────
if [[ "$START_MONGO_VIA_DOCKER" -eq 1 ]]; then
    info "Starting MongoDB (docker compose) in a new Terminal window..."
    launch_in_terminal "MongoDB" "clear && echo '🍃 ═══ MongoDB (docker) ═══' && cd '$PROJECT_ROOT' && docker compose -f '$COMPOSE_FILE' up mongo"
    sleep 6   # let mongo accept connections
elif lsof -nP -iTCP:27017 -sTCP:LISTEN >/dev/null 2>&1; then
    info "Using already-running local MongoDB on :27017 — no extra window needed."
else
    info "Starting local MongoDB in a new Terminal window..."
    launch_in_terminal "MongoDB" "clear && echo '🍃 ═══ MongoDB (local) ═══' && bash '$SCRIPT_DIR/start_local_db.sh'"
    sleep 3
fi

# ── 5. Backend window ────────────────────────────────────────────────────────
info "Opening Backend in a new Terminal window..."
BACKEND_BODY=$(cat <<EOF
clear
echo '🐍 ═══ Backend (FastAPI) ═══'
cd '$PROJECT_ROOT'
export PYTHONPATH='$PROJECT_ROOT:\$PYTHONPATH'
export PYTHONUTF8=1
unset DEBUG
cd '$BACKEND_DIR'
echo 'Backend logs are streaming below:'
echo '──────────────────────────────────────────'
bash '$SCRIPT_DIR/python.sh' server.py 2>&1 | tee '$LOG_DIR/backend.log'
echo '──────────────────────────────────────────'
echo 'Backend exited. Press Ctrl+C to close this window.'
EOF
)
launch_in_terminal "Backend" "$BACKEND_BODY"
sleep 5   # give backend time to bind :8001

# ── 6. Frontend window ───────────────────────────────────────────────────────
info "Opening Frontend (Expo) in a new Terminal window..."
FRONTEND_BODY=$(cat <<EOF
clear
echo '📱 ═══ Frontend (Expo) ═══'
cd '$FRONTEND_DIR'
if [ -s "\$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="\$HOME/.nvm"
  . "\$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi
echo "📌 Using Node \$(node -v)"
echo 'Updating IP config and clearing caches...'
npm run update-ip --silent || true
rm -rf .metro-cache node_modules/.cache ~/.expo/cache .expo 2>/dev/null || true
echo 'Frontend logs are streaming below:'
echo '──────────────────────────────────────────'
npx expo start --go --clear 2>&1 | tee '$LOG_DIR/frontend.log'
echo '──────────────────────────────────────────'
echo 'Frontend exited. Press Ctrl+C to close this window.'
EOF
)
launch_in_terminal "Frontend" "$FRONTEND_BODY"

# ── 7. Summary ───────────────────────────────────────────────────────────────
cat <<EOF

${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}
${GREEN}✅  All services are launching in separate Terminal.app windows${NC}
${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}
  🍃  MongoDB   — Terminal window titled "MongoDB"
  🐍  Backend   — Terminal window titled "Backend"  (logs: $LOG_DIR/backend.log)
  📱  Frontend  — Terminal window titled "Frontend" (logs: $LOG_DIR/frontend.log)

  Backend URL  : http://localhost:8001
  Health Check : http://localhost:8001/api/health
  Frontend URL : http://localhost:8081  (web)  /  QR code in the Frontend window

  Logs folder  : $LOG_DIR

  ${YELLOW}To stop everything:${NC}
     bash $SCRIPT_DIR/launch_app_external.sh --stop
${BOLD}═══════════════════════════════════════════════════════════════════════════════${NC}
EOF
