from __future__ import annotations

import os
import sys
from typing import Iterable

from scripts.approval_pipeline import classify_command


def enforce_high_risk_entrypoint(
    *,
    trigger_flags: Iterable[str] | None = None,
    always_require: bool = False,
) -> None:
    args = list(sys.argv[1:])
    should_require = always_require
    if trigger_flags is not None:
        should_require = should_require or any(flag in args for flag in trigger_flags)
    if not should_require:
        return

    if os.getenv("SV_APPROVAL_WRAPPER_ACTIVE") != "1":
        raise SystemExit(
            "High-risk operation blocked. Re-run through ./scripts/run_with_approval.sh."
        )

    command = os.getenv("SV_APPROVAL_COMMAND", "")
    if not command:
        raise SystemExit(
            "High-risk operation blocked. Approval context is missing the approved command."
        )

    policy = classify_command(command)
    if not policy.approval_required and not always_require:
        return

    from scripts.agent_approval_log import main as approval_cli_main

    original_argv = sys.argv
    try:
        sys.argv = [
            "agent_approval_log.py",
            "guard",
        ]
        exit_code = approval_cli_main()
    finally:
        sys.argv = original_argv

    if exit_code != 0:
        raise SystemExit(exit_code)
