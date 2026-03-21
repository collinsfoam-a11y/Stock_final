#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_python() {
    local -a candidates=()
    local candidate

    if [[ -n "${PYTHON_BIN:-}" ]]; then
        candidates+=("$PYTHON_BIN")
    fi

    candidates+=(
        "$PROJECT_ROOT/.venv/bin/python"
        "$PROJECT_ROOT/.venv/Scripts/python.exe"
        "$PROJECT_ROOT/backend/.venv/bin/python"
        "$PROJECT_ROOT/backend/.venv/Scripts/python.exe"
        "$PROJECT_ROOT/backend/venv/bin/python"
        "$PROJECT_ROOT/backend/venv/Scripts/python.exe"
    )

    for candidate_name in python3.11 python3.10 python3; do
        if command -v "$candidate_name" >/dev/null 2>&1; then
            candidates+=("$(command -v "$candidate_name")")
        fi
    done

    for candidate in "${candidates[@]}"; do
        if [[ ! -x "$candidate" ]]; then
            continue
        fi

        if "$candidate" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
        then
            printf '%s\n' "$candidate"
            return 0
        fi
    done

    printf 'Unable to find a Python 3.10+ interpreter. Set PYTHON_BIN to override.\n' >&2
    return 1
}

PYTHON_EXECUTABLE="$(resolve_python)"
exec "$PYTHON_EXECUTABLE" "$@"
