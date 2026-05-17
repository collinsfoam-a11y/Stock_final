#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-ci}"
TMP_DIR="${TMPDIR:-/tmp}"
declare -a LOG_FILES=()

cleanup() {
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
    log_file="$(mktemp "${TMP_DIR%/}/agent-ci.${name}.XXXXXX")"
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

run_python_typecheck_non_blocking() {
    local log_file
    log_file="$(mktemp "${TMP_DIR%/}/agent-ci.python-typecheck.XXXXXX")"
    LOG_FILES+=("$log_file")

    if (cd "$ROOT_DIR" && ./scripts/python.sh -m mypy backend --ignore-missing-imports --python-version=3.11) >"$log_file" 2>&1; then
        printf '[ok] python-typecheck\n'
        rm -f "$log_file"
    else
        printf '[warn] python-typecheck (non-blocking): mypy reported issues\n'
        cat "$log_file"
        rm -f "$log_file"
    fi
}

run_python_steps() {
    run_step python-lint ./scripts/python.sh -m ruff check backend
    run_python_typecheck_non_blocking
    run_step python-test ./scripts/python.sh -m pytest backend/tests/ -q --tb=short
}

run_node_steps() {
    run_step node-lint npm --prefix frontend run lint
    run_step node-typecheck npm --prefix frontend run typecheck
    run_step node-test npm --prefix frontend test -- --runInBand
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
