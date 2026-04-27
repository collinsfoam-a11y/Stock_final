#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON_RUNNER="$PROJECT_ROOT/scripts/python.sh"
APPROVAL_CLI="$PROJECT_ROOT/scripts/agent_approval_log.py"
LOG_FILE_DEFAULT="$PROJECT_ROOT/.agent/approval-log.jsonl"

usage() {
    cat <<'EOF'
Usage:
  ./scripts/run_with_approval.sh [--run-id <id>] [--confirm] [--log-file <path>] "<command>"

Behavior:
  - validates approval before execution
  - exports wrapper context for guarded scripts
  - records executed and completed/failed states
EOF
}

RUN_ID=""
CONFIRM=0
LOG_FILE="$LOG_FILE_DEFAULT"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --run-id)
            RUN_ID="${2:-}"
            shift 2
            ;;
        --confirm)
            CONFIRM=1
            shift
            ;;
        --log-file)
            LOG_FILE="${2:-}"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        -*)
            printf 'Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 1
            ;;
        *)
            break
            ;;
    esac
done

if [[ $# -ne 1 ]]; then
    usage >&2
    exit 1
fi

COMMAND="$1"
CONFIRM_ARGS=()
if [[ "$CONFIRM" -eq 1 ]]; then
    CONFIRM_ARGS+=(--confirm)
fi

VALIDATE_ARGS=(
    "$PYTHON_RUNNER" "$APPROVAL_CLI" validate
    --command "$COMMAND"
    --format shell
    --log-file "$LOG_FILE"
)
if [[ -n "$RUN_ID" ]]; then
    VALIDATE_ARGS+=(--run-id "$RUN_ID")
fi
if [[ "$CONFIRM" -eq 1 ]]; then
    VALIDATE_ARGS+=(--confirm)
fi

VALIDATION_OUTPUT="$("${VALIDATE_ARGS[@]}")"

eval "$VALIDATION_OUTPUT"

if [[ "${APPROVAL_REQUIRED}" != "True" && "${APPROVAL_REQUIRED}" != "true" ]]; then
    cd "$PROJECT_ROOT"
    exec bash -lc "$COMMAND"
fi

export SV_APPROVAL_WRAPPER_ACTIVE=1
export SV_APPROVAL_RUN_ID="$RUN_ID"
export SV_APPROVAL_CALL_ID="$CALL_ID"
export SV_APPROVAL_COMMAND="$COMMAND"
export SV_APPROVAL_EXECUTION_HASH="$EXECUTION_HASH"
export SV_APPROVAL_CONFIRM="$CONFIRM"
export SV_APPROVAL_LOG_FILE="$LOG_FILE"

"$PYTHON_RUNNER" "$APPROVAL_CLI" executed --run-id "$RUN_ID" --log-file "$LOG_FILE" >/dev/null

OUTPUT_FILE="$(mktemp "${TMPDIR:-/tmp}/approval-run.XXXXXX.log")"
cleanup() {
    rm -f "$OUTPUT_FILE"
}
trap cleanup EXIT

set +e
(
    cd "$PROJECT_ROOT"
    bash -lc "$COMMAND"
) 2>&1 | tee "$OUTPUT_FILE"
COMMAND_EXIT="${PIPESTATUS[0]}"
set -e

FINALIZE_ARGS=(
    "$PYTHON_RUNNER" "$APPROVAL_CLI" finalize
    --run-id "$RUN_ID"
    --command "$COMMAND"
    --execution-hash "$EXECUTION_HASH"
    --exit-code "$COMMAND_EXIT"
    --output-file "$OUTPUT_FILE"
    --log-file "$LOG_FILE"
)
if [[ "$CONFIRM" -eq 1 ]]; then
    FINALIZE_ARGS+=(--confirm)
fi

set +e
"${FINALIZE_ARGS[@]}"
FINALIZE_EXIT="$?"
set -e

if [[ "$COMMAND_EXIT" -ne 0 ]]; then
    exit "$COMMAND_EXIT"
fi

exit "$FINALIZE_EXIT"
