#!/usr/bin/env bash
set -u

status=0

echo "🔎 Dependency vulnerability checks"

# Frontend npm audit
if [ -f frontend/package-lock.json ]; then
  echo ""
  echo "📦 Frontend: npm audit"
  npm_output_file="$(mktemp)"
  if (cd frontend && npm audit --audit-level=moderate >"$npm_output_file" 2>&1); then
    cat "$npm_output_file"
    echo "✅ npm audit passed"
  else
    rc=$?
    cat "$npm_output_file"
    if grep -Eq "audit endpoint returned an error|403 Forbidden|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT" "$npm_output_file"; then
      echo "⚠️  npm audit could not complete (registry/proxy/network/auth issue)."
      if [ "$status" -eq 0 ]; then
        status=2
      fi
    else
      echo "❌ npm audit found vulnerabilities or returned an actionable failure"
      status=1
    fi
    echo "   Exit code: $rc"
  fi
  rm -f "$npm_output_file"
else
  echo "⚠️  frontend/package-lock.json not found; skipping npm audit"
fi

# Backend pip-audit
if ./scripts/python.sh -m pip_audit --version >/dev/null 2>&1; then
  echo ""
  echo "🐍 Backend: pip-audit"
  if ./scripts/python.sh -m pip_audit \
    -r backend/requirements.txt \
    -r backend/requirements.dev.txt \
    -r backend/requirements.production.txt; then
    echo "✅ pip-audit passed"
  else
    rc=$?
    if [ "$rc" -eq 1 ]; then
      echo "❌ pip-audit found vulnerabilities"
      status=1
    else
      echo "⚠️  pip-audit could not complete"
      echo "   Exit code: $rc"
      if [ "$status" -eq 0 ]; then
        status=2
      fi
    fi
  fi
else
  echo "⚠️  pip-audit is not installed in this Python environment; skipping backend vulnerability scan"
  if [ "$status" -eq 0 ]; then
    status=2
  fi
fi

exit $status
