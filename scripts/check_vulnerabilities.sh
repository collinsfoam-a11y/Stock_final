#!/bin/bash
set -euo pipefail

echo "🔒 Running vulnerability scans..."

FRONTEND_LOCK="frontend/pnpm-lock.yaml"
BACKEND_REQS="backend/requirements.production.txt"

if [ ! -f "$FRONTEND_LOCK" ]; then
    echo "❌ Missing $FRONTEND_LOCK"
    exit 1
fi

if [ -n "${CI:-}" ]; then
    corepack pnpm audit --audit-level=high --fix || true
else
    corepack pnpm audit --audit-level=high || true
fi

if ! command -v pip-audit >/dev/null 2>&1; then
    echo "⚠️  pip-audit missing; installing..."
    python -m pip install pip-audit
fi

if [ -f "$BACKEND_REQS" ]; then
    python -m pip_audit -r "$BACKEND_REQS" || true
else
    python -m pip_audit backend || true
fi

echo "✅ Vulnerability scan complete"
