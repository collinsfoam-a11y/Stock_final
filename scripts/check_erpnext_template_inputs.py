#!/usr/bin/env python3
"""Checks whether the ERPNext template/version inputs required to move
Stock Verify from READY_FOR_ERP_TEMPLATE_COMPARISON to
READY_FOR_MANUAL_IMPORT_DRY_RUN have actually been received from the
ERPNext operator (see docs/ERP_NEXT_TEMPLATE_REQUEST.md).

Read-only: never talks to ERPNext, never writes to the manifest, never
mutates anything. Safe to run at any time.

Optional checksum verification: if a template's manifest entry has a
"sha256" field set, this script verifies the file on disk still matches it.
A mismatch is blocking (the file has drifted from what was recorded as
received); an absent sha256 is only a warning (most templates won't have
one recorded, especially early on). See docs/erpnext_templates/README.md's
"Checksum recommendation" section.

Usage:
    python scripts/check_erpnext_template_inputs.py
    python scripts/check_erpnext_template_inputs.py --template-dir path/to/dir
    python scripts/check_erpnext_template_inputs.py --json

Exit code 0: all required inputs present.
Exit code 1: at least one blocking input is missing.
Exit code behavior is identical for --json; only the printed output format changes.

Manual verification (no automated test-runner pattern exists for scripts/ in
this repo, so this is verified by direct invocation rather than a pytest
file):
    # Against the real (currently-empty) manifest -- expect NOT READY, exit 1:
    python scripts/check_erpnext_template_inputs.py
    python scripts/check_erpnext_template_inputs.py --json
    # Against a synthetic fully-populated manifest in a temp dir -- expect READY, exit 0:
    #   (see docs/BSR_REMEDIATION_STATUS.md Step 12/13 for the exact fixture used)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEMPLATE_DIR = REPO_ROOT / "docs" / "erpnext_templates"

# Values treated as "not actually provided" -- matches ErpNextTemplateValidationService's
# own "unknown" sentinel plus a couple of additional common placeholders operators
# might use when a field genuinely isn't known yet.
_UNSET_SENTINELS = {"", "unknown", "n/a"}

REQUIRED_TEMPLATES = {
    "stock_entry": "Stock Entry",
    "stock_reconciliation": "Stock Reconciliation",
}
CONDITIONAL_TEMPLATES = {
    "serial_no": "Serial No",
    "batch": "Batch",
}


def _is_unset(value: Any) -> bool:
    if value is None:
        return True
    return str(value).strip().lower() in _UNSET_SENTINELS


def load_manifest(template_dir: Path) -> Optional[dict[str, Any]]:
    manifest_path = template_dir / "template_manifest.json"
    if not manifest_path.exists():
        return None
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def _sha256_of_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _verify_checksum(
    *, key: str, entry: dict[str, Any], template_dir: Path
) -> tuple[Optional[str], Optional[str], dict[str, Any]]:
    """Returns (blocking_message_or_none, warning_message_or_none, checksum_result).

    Optional per Part D: absence of a recorded sha256 is a warning only,
    never blocking (most templates won't have one recorded, especially
    early on) -- a *mismatch* between a recorded sha256 and the file's
    actual current bytes is blocking (the file on disk no longer matches
    what was recorded as received/reviewed)."""
    file_name = entry.get("file")
    recorded_sha256 = entry.get("sha256")
    result = {"template": key, "file": file_name, "status": "not_applicable"}

    if _is_unset(file_name):
        return None, None, result  # No file at all -- already covered by presence checks.

    file_path = template_dir / str(file_name)
    if not file_path.exists():
        return None, None, result  # Missing-file blocking message already covers this.

    if _is_unset(recorded_sha256):
        result["status"] = "not_recorded"
        return None, f"{key} template has no recorded sha256 checksum ({file_name})", result

    actual_sha256 = _sha256_of_file(file_path)
    if actual_sha256 != str(recorded_sha256):
        result["status"] = "mismatch"
        return (
            f"{key} template sha256 mismatch: recorded {recorded_sha256!r} but file on disk is {actual_sha256!r} ({file_name})",
            None,
            result,
        )

    result["status"] = "verified"
    return None, None, result


def check(template_dir: Path) -> tuple[bool, list[str], list[str], list[dict[str, Any]]]:
    """Returns (ready, blocking_messages, warning_messages, checksum_results)."""
    blocking: list[str] = []
    warnings: list[str] = []
    checksums: list[dict[str, Any]] = []

    manifest = load_manifest(template_dir)
    if manifest is None:
        blocking.append("template_manifest.json is missing entirely")
        return False, blocking, warnings, checksums

    if _is_unset(manifest.get("erpnext_version")):
        blocking.append("erpnext_version is unknown")

    if _is_unset(manifest.get("frappe_version")):
        # Frappe version is nice-to-have context (it's implied by the
        # ERPNext version) -- a warning, not a hard blocker, per Part D.
        warnings.append("frappe_version is unknown")

    if _is_unset(manifest.get("company")):
        blocking.append("company is unknown")

    templates = manifest.get("templates") or {}
    gate = manifest.get("serial_batch_gate") or {}

    for key, label in REQUIRED_TEMPLATES.items():
        entry = templates.get(key) or {}
        file_name = entry.get("file")
        if _is_unset(file_name) or not (template_dir / str(file_name)).exists():
            blocking.append(f"{key} template file missing ({label})")
        else:
            checksum_blocking, checksum_warning, checksum_result = _verify_checksum(
                key=key, entry=entry, template_dir=template_dir
            )
            checksums.append(checksum_result)
            if checksum_blocking:
                blocking.append(checksum_blocking)
            if checksum_warning:
                warnings.append(checksum_warning)

    uses_bundle = gate.get("uses_serial_batch_bundle", manifest.get("uses_serial_batch_bundle"))
    if _is_unset(uses_bundle):
        blocking.append("serial_batch_gate.uses_serial_batch_bundle is unknown")

    for key, label in CONDITIONAL_TEMPLATES.items():
        entry = templates.get(key) or {}
        required_if = entry.get("required_if")
        file_name = entry.get("file")
        template_present = not _is_unset(file_name) and (template_dir / str(file_name)).exists()
        if not template_present:
            if required_if:
                # Only a warning: whether this template is actually needed
                # depends on an answer (serial/batch import path) we may not
                # have yet either -- don't hard-block on a template whose
                # necessity itself hasn't been confirmed.
                warnings.append(f"{key} template not present (required only if {required_if})")
        else:
            checksum_blocking, checksum_warning, checksum_result = _verify_checksum(
                key=key, entry=entry, template_dir=template_dir
            )
            checksums.append(checksum_result)
            if checksum_blocking:
                blocking.append(checksum_blocking)
            if checksum_warning:
                warnings.append(checksum_warning)

    negative_allowed = gate.get(
        "negative_serial_batch_stock_allowed", manifest.get("negative_serial_batch_stock_allowed")
    )
    if _is_unset(negative_allowed):
        blocking.append("serial_batch_gate.negative_serial_batch_stock_allowed is unknown")

    serial_import_path = gate.get("serial_import_path")
    if _is_unset(serial_import_path):
        blocking.append("serial_batch_gate.serial_import_path is unknown (can Serial No be bulk imported directly?)")

    batch_import_path = gate.get("batch_import_path")
    if _is_unset(batch_import_path):
        blocking.append("serial_batch_gate.batch_import_path is unknown (can Batch be bulk imported directly?)")

    stock_entry_child_row_behavior = gate.get("stock_entry_child_row_import_behavior")
    if _is_unset(stock_entry_child_row_behavior):
        blocking.append(
            "serial_batch_gate.stock_entry_child_row_import_behavior is unknown "
            "(can Stock Entry child rows be imported through Data Import, or must they be grid-pasted?)"
        )

    stock_reconciliation_child_row_behavior = gate.get("stock_reconciliation_child_row_import_behavior")
    if _is_unset(stock_reconciliation_child_row_behavior):
        blocking.append(
            "serial_batch_gate.stock_reconciliation_child_row_import_behavior is unknown "
            "(can Stock Reconciliation child rows be imported through Data Import, or must they be grid-pasted?)"
        )

    return (len(blocking) == 0), blocking, warnings, checksums


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--template-dir",
        type=Path,
        default=DEFAULT_TEMPLATE_DIR,
        help="Directory containing template_manifest.json and the template files (default: docs/erpnext_templates)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit machine-readable JSON instead of human-readable text (exit code behavior is unchanged)",
    )
    args = parser.parse_args()

    ready, blocking, warnings, checksums = check(args.template_dir)
    # Today this is identical to `ready`: both mean "every blocking presence
    # check passed." Kept as its own named field (per the ERPNext Template
    # Waiting State Gate, see docs/BSR_REMEDIATION_STATUS.md Step 14) since
    # advancing to a real dry-run also requires template comparison to
    # actually pass (or mismatches to be formally accepted) -- a check this
    # standalone, dependency-free script deliberately does not perform
    # itself (that's ErpNextTemplateValidationService's job, per the intake
    # runbook). This field only certifies presence, not comparison success.
    can_advance = ready

    if args.json:
        print(
            json.dumps(
                {
                    "ready": ready,
                    "can_advance_to_manual_import_dry_run": can_advance,
                    "blocking": blocking,
                    "warnings": warnings,
                    "checksums": checksums,
                    "manifest_path": str(args.template_dir / "template_manifest.json"),
                    "template_dir": str(args.template_dir),
                },
                indent=2,
            )
        )
    else:
        print(f"ERPNext template input check: {'READY' if ready else 'NOT READY'}")
        if blocking:
            print("Blocking:")
            for item in blocking:
                print(f"- {item}")
        if warnings:
            print("Warnings:")
            for item in warnings:
                print(f"- {item}")
        if not blocking and not warnings:
            print("All required and optional inputs are present.")
        print(f"Can advance to manual import dry-run: {'YES' if can_advance else 'NO'}")

    return 0 if ready else 1


if __name__ == "__main__":
    sys.exit(main())
