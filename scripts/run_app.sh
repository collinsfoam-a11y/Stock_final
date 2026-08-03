#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# run_app.sh — Stop everything & launch each service in its own
#              macOS Terminal window (outside the IDE).
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { printf "${CYAN}ℹ  %s${NC}\n" "$*"; }
ok()    { printf "${GREEN}✅ %s${NC}\n" "$*"; }
warn()  { printf "${YELLOW}⚠️  %s${NC}\n" "$*"; }
err()   { printf "${RED}❌ %s${NC}\n" "$*"; }

# ── 1. Stop any existing services ────────────────────────────
info "Stopping any running services..."
"$SCRIPT_DIR/stop_all.sh" 2>/dev/null || true
sleep 2
ok "All existing services stopped."

# ── 2. Open MongoDB in a new Terminal window ─────────────────
info "Launching MongoDB in a new Terminal window..."
osascript -e "
tell application \"Terminal\"
    activate
    set mongoTab to do script \"clear && echo '🍃 ═══ MongoDB ═══' && bash '$SCRIPT_DIR/start_local_db.sh' && echo '' && echo '🍃 MongoDB is running. Press Ctrl+C to stop.' && tail -f '$PROJECT_ROOT/backend/data/mongod.log'\"
    set custom title of front window to \"MongoDB\"
end tell
"
sleep 3   # Give MongoDB time to initialize

# ── 3. Open Backend in a new Terminal window ─────────────────
info "Launching Backend in a new Terminal window..."
osascript -e "
tell application \"Terminal\"
    activate
    set backendTab to do script \"clear && echo '🐍 ═══ Backend Server ═══' && cd '$PROJECT_ROOT' && export PYTHONPATH='$PROJECT_ROOT:\$PYTHONPATH' && export USE_CONNECTION_POOL=False && export SQL_SERVER_HOST='' && export SSL_KEYFILE='' && export SSL_CERTFILE='' && export DISABLE_SSL=true && unset DEBUG && cd '$PROJECT_ROOT/backend' && '$SCRIPT_DIR/python.sh' server.py 2>&1 | tee backend_startup.log\"
    set custom title of front window to \"Backend\"
end tell
"
sleep 5   # Give backend time to start

# ── 4. Open Frontend in a new Terminal window ────────────────
info "Launching Frontend (Expo) in a new Terminal window..."
osascript -e "
tell application \"Terminal\"
    activate
    set frontendTab to do script \"clear && echo '📱 ═══ Frontend (Expo) ═══' && export NVM_DIR=\\\"\$HOME/.nvm\\\" && [ -s \\\"\$NVM_DIR/nvm.sh\\\" ] && . \\\"\$NVM_DIR/nvm.sh\\\" && nvm use 20 && cd '$PROJECT_ROOT/frontend' && npm run update-ip && rm -rf .metro-cache node_modules/.cache ~/.expo/cache .expo 2>/dev/null || true && npx expo start --go --clear\"
    set custom title of front window to \"Frontend\"
end tell
"

# ── 5. Summary ───────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
ok "All services are launching in separate Terminal windows!"
echo ""
echo "  🍃  MongoDB   — Terminal window 'MongoDB'"
echo "  🐍  Backend   — Terminal window 'Backend'"
echo "  📱  Frontend  — Terminal window 'Frontend'"
echo ""
echo "  Backend URL  : http://localhost:8001"
echo "  Health Check : http://localhost:8001/api/health"
echo "  Frontend URL : http://localhost:8081  (Expo web)"
echo ""
echo "  To stop all  : bash $SCRIPT_DIR/stop_all.sh"
echo "═══════════════════════════════════════════════════════"
