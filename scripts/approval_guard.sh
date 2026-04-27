#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

require_approval_context() {
    if [[ "${SV_APPROVAL_WRAPPER_ACTIVE:-}" != "1" ]]; then
        printf 'High-risk operation blocked. Re-run through ./scripts/run_with_approval.sh.\n' >&2
        exit 1
    fi

    "$PROJECT_ROOT/scripts/python.sh" "$PROJECT_ROOT/scripts/agent_approval_log.py" guard
}
