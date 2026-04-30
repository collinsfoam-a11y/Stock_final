#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-ci}"
TMP_DIR="${TMPDIR:-/tmp}"

# Disable Expo telemetry to prevent EPERM errors when writing to ~/.expo
export EXPO_NO_TELEMETRY=1

# Use a local home for node steps if needed to avoid permission issues in the user's home
export HOME_ORIG="$HOME"
export HOME="$(mktemp -d "${TMP_DIR%/}/agent-home.XXXXXX")"
declare -a LOG_FILES=()

cleanup() {
    if [[ -d "$HOME" ]]; then
        rm -rf "$HOME"
    fi
    if [[ ${#LOG_FILES[@]} -gt 0 ]]; then
        rm -f "${LOG_FILES[@]}"
    fi
}

trap cleanup EXIT

print_common_failure_hint() {
    local log_file="$1"

    if grep -q "No module named ruff" "$log_file" 2>/dev/null; then
        printf 'Hint: install Python dev dependencies with `make install` or `./scripts/python.sh -m pip install ruff`.\n' >&2
    elif grep -q "No module named pytest" "$log_file" 2>/dev/null; then
        printf 'Hint: install Python dev dependencies with `make install` or `./scripts/python.sh -m pip install pytest`.\n' >&2
    elif grep -q "npm: command not found" "$log_file" 2>/dev/null; then
        printf 'Hint: install Node.js and rerun `make install`.\n' >&2
    fi
}

run_step() {
    local name="$1"
    shift

    local log_file
    log_file="$(mktemp "${TMP_DIR%/}/agent-ci.${name}.XXXXXX.log")"
    LOG_FILES+=("$log_file")

    if (cd "$ROOT_DIR" && "$@") >"$log_file" 2>&1; then
        printf '[ok] %s\n' "$name"
        rm -f "$log_file"
    else
        printf '[fail] %s\n' "$name" >&2
        printf -- '--- %s log ---\n' "$name" >&2
        cat "$log_file" >&2
        print_common_failure_hint "$log_file"
        exit 1
    fi
}

run_python_steps() {
    run_step python-lint ./scripts/python.sh -m ruff check backend
    run_step python-typecheck make --no-print-directory python-typecheck
    run_step python-test make --no-print-directory python-test
}

run_node_steps() {
    run_step node-lint make --no-print-directory node-lint
    run_step node-typecheck make --no-print-directory node-typecheck
    run_step node-test make --no-print-directory node-test
}

case "$MODE" in
    python)
        run_python_steps
        ;;
    node)
        run_node_steps
        ;;
    ci)
        run_python_steps
        run_node_steps
        printf '[ok] agent-ci complete\n'
        ;;
    *)
        printf 'Usage: %s [ci|python|node]\n' "$(basename "$0")" >&2
        exit 1
        ;;
esac
