#!/usr/bin/env bash
set -u

status=0

echo "Dependency vulnerability checks"

run_frontend_audit() {
  local audit_output_file
  local audit_cwd="frontend"
  local rc
  local windows_frontend_dir=""
  local -a frontend_audit_cmd=()

  if [ -f frontend/pnpm-lock.yaml ]; then
    echo ""
    echo "Frontend: pnpm audit"
    if command -v pnpm >/dev/null 2>&1 && (cd frontend && pnpm --version >/dev/null 2>&1); then
      frontend_audit_cmd=(pnpm audit --prod --audit-level=moderate)
    elif command -v corepack >/dev/null 2>&1 && (cd frontend && corepack pnpm --version >/dev/null 2>&1); then
      frontend_audit_cmd=(corepack pnpm audit --prod --audit-level=moderate)
    elif command -v powershell.exe >/dev/null 2>&1; then
      if command -v wslpath >/dev/null 2>&1; then
        windows_frontend_dir="$(wslpath -w "$(pwd)/frontend")"
      elif command -v cygpath >/dev/null 2>&1; then
        windows_frontend_dir="$(cygpath -w "$(pwd)/frontend")"
      fi
      if [ -n "$windows_frontend_dir" ]; then
        audit_cwd="."
        frontend_audit_cmd=(
          powershell.exe
          -NoProfile
          -Command
          "& { Set-Location '$windows_frontend_dir'; corepack pnpm audit --prod --audit-level=moderate }"
        )
      else
        echo "WARN: pnpm or corepack is not runnable; frontend vulnerability scan could not run"
        if [ "$status" -eq 0 ]; then
          status=2
        fi
        return
      fi
    else
      echo "WARN: pnpm or corepack is not runnable; frontend vulnerability scan could not run"
      if [ "$status" -eq 0 ]; then
        status=2
      fi
      return
    fi
  elif [ -f frontend/package-lock.json ]; then
    echo ""
    echo "Frontend: npm audit"
    if ! command -v npm >/dev/null 2>&1; then
      echo "ERROR: npm is required for frontend vulnerability scan"
      status=1
      return
    fi
    frontend_audit_cmd=(npm audit --audit-level=moderate)
  else
    echo "ERROR: no supported frontend lockfile found for vulnerability scan"
    status=1
    return
  fi

  audit_output_file="$(mktemp)"
  if (cd "$audit_cwd" && "${frontend_audit_cmd[@]}" >"$audit_output_file" 2>&1); then
    cat "$audit_output_file"
    echo "Frontend audit passed"
  else
    rc=$?
    cat "$audit_output_file"
    if grep -Eq "audit endpoint returned an error|403 Forbidden|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT" "$audit_output_file"; then
      echo "WARN: frontend audit could not complete due to registry/proxy/network/auth issue"
      if [ "$status" -eq 0 ]; then
        status=2
      fi
    else
      echo "ERROR: frontend audit found vulnerabilities or returned an actionable failure"
      status=1
    fi
    echo "Exit code: $rc"
  fi
  rm -f "$audit_output_file"
}

run_backend_audit() {
  local rc

  if ! ./scripts/python.sh -m pip_audit --version >/dev/null 2>&1; then
    echo "ERROR: pip-audit module is required for backend vulnerability scan"
    status=1
    return
  fi

  echo ""
  echo "Backend: pip-audit"
  if ./scripts/python.sh -m pip_audit \
    -r backend/requirements.production.txt; then
    echo "Backend audit passed"
  else
    rc=$?
    if [ "$rc" -eq 1 ]; then
      echo "ERROR: pip-audit found vulnerabilities"
      status=1
    else
      echo "WARN: pip-audit could not complete"
      echo "Exit code: $rc"
      if [ "$status" -eq 0 ]; then
        status=2
      fi
    fi
  fi
}

run_frontend_audit
run_backend_audit

exit "$status"
