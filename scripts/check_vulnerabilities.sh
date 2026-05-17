#!/usr/bin/env bash
set -u

status=0

echo "🔎 Dependency vulnerability checks"

# Frontend package audit
if [ -f frontend/pnpm-lock.yaml ]; then
  echo ""
  echo "📦 Frontend: pnpm audit"
  if ! command -v corepack >/dev/null 2>&1; then
    echo "⚠️  corepack is not installed; skipping frontend vulnerability scan"
    if [ "$status" -eq 0 ]; then
      status=2
    fi
  else
    pnpm_output_file="$(mktemp)"
    audit_cmd=(corepack pnpm audit --audit-level moderate --prod)
    if command -v timeout >/dev/null 2>&1; then
      audit_cmd=(timeout 180s "${audit_cmd[@]}")
    fi

    if (cd frontend && "${audit_cmd[@]}" >"$pnpm_output_file" 2>&1); then
      cat "$pnpm_output_file"
      echo "✅ pnpm audit passed"
    else
      rc=$?
      cat "$pnpm_output_file"
      if [ "$rc" -eq 124 ]; then
        echo "⚠️  pnpm audit timed out before completion."
        if [ "$status" -eq 0 ]; then
          status=2
        fi
      elif grep -Eq "audit endpoint returned an error|403 Forbidden|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ERR_PNPM_META_FETCH_FAIL|Response timeout" "$pnpm_output_file"; then
        echo "⚠️  pnpm audit could not complete (registry/proxy/network/auth issue)."
        if [ "$status" -eq 0 ]; then
          status=2
        fi
      else
        echo "❌ pnpm audit found vulnerabilities or returned an actionable failure"
        status=1
      fi
      echo "   Exit code: $rc"
    fi
    rm -f "$pnpm_output_file"
  fi
elif [ -f frontend/package-lock.json ]; then
  echo ""
  echo "📦 Frontend: npm audit"
  if ! command -v npm >/dev/null 2>&1; then
    echo "⚠️  npm is not installed; skipping frontend vulnerability scan"
    if [ "$status" -eq 0 ]; then
      status=2
    fi
  else
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
  fi
else
  echo "⚠️  frontend lockfile not found; skipping frontend vulnerability scan"
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
