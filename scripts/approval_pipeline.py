from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

try:
    import fcntl
except ImportError:  # pragma: no cover - Windows fallback
    fcntl = None  # type: ignore[assignment]

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_LOG_PATH = ROOT_DIR / ".agent/approval-log.jsonl"
GENESIS_HASH = "0" * 64
STATUSES = {"requested", "approved", "rejected", "executed", "completed", "failed"}
RISK_LEVELS = {"L0": 0, "L1": 1, "L2": 2, "L3": 3, "L4": 4}
MUTATING_FLAGS = {"--execute", "--apply", "--write", "--fix"}
PYTHON_BASENAMES = {"python", "python3", "python3.10", "python3.11", "python.sh"}
REQUIRED_ENTRY_FIELDS = {
    "status",
    "action",
    "run_id",
    "call_id",
    "risk_level",
    "command",
    "execution_hash",
    "approved_by",
    "expected_records",
    "query_filter",
    "timestamp",
    "prev_hash",
    "hash",
}


class ApprovalError(RuntimeError):
    """Raised when the approval pipeline blocks an operation."""


@dataclass(frozen=True)
class CommandPolicy:
    action: str
    risk_level: str
    approval_required: bool
    confirmation_required: bool


@contextmanager
def locked_log(log_path: Path) -> Iterator[None]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a+", encoding="utf-8") as handle:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def command_to_tokens(command: str) -> list[str]:
    try:
        tokens = shlex.split(command, posix=True)
    except ValueError as exc:
        raise ApprovalError(f"Unable to parse command: {exc}") from exc

    if not tokens:
        raise ApprovalError("Command is required.")

    return tokens


def normalize_command(command: str) -> str:
    tokens = [_normalize_token(token) for token in command_to_tokens(command)]
    return shlex.join(tokens)


def normalize_query_filter(raw_value: str | None) -> dict[str, Any]:
    if not raw_value:
        return {}

    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ApprovalError(f"Invalid JSON for --query-filter: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ApprovalError("--query-filter must decode to a JSON object.")

    return parsed


def normalize_scope(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [part.strip() for part in raw_value.split(",") if part.strip()]


def classify_command(command: str) -> CommandPolicy:
    normalized = normalize_command(command)
    tokens = command_to_tokens(normalized)
    target = extract_target_script(tokens)
    script_name = Path(target or tokens[0]).name
    action = action_from_target(target or tokens[0])
    flags = {token for token in tokens if token.startswith("--")}

    git_risk = _git_command_risk(tokens)
    if git_risk is not None:
        return CommandPolicy(
            action=action,
            risk_level=git_risk,
            approval_required=requires_approval(git_risk),
            confirmation_required=requires_confirmation(git_risk),
        )

    registry_risk = _registry_risk(target, script_name, flags)
    if registry_risk is not None:
        return CommandPolicy(
            action=action,
            risk_level=registry_risk,
            approval_required=requires_approval(registry_risk),
            confirmation_required=requires_confirmation(registry_risk),
        )

    if target and any(flag in flags for flag in MUTATING_FLAGS):
        return CommandPolicy(
            action=action,
            risk_level="L2",
            approval_required=True,
            confirmation_required=False,
        )

    return CommandPolicy(
        action=action,
        risk_level="L0",
        approval_required=False,
        confirmation_required=False,
    )


def extract_target_script(tokens: list[str]) -> str | None:
    first = Path(tokens[0]).name
    if first in PYTHON_BASENAMES or first.startswith("python"):
        if len(tokens) >= 2 and tokens[1].endswith(".py"):
            return _normalize_token(tokens[1])
        return None

    if tokens[0].endswith(".sh") or tokens[0].endswith(".py"):
        return _normalize_token(tokens[0])

    return None


def action_from_target(target: str) -> str:
    name = Path(target).name
    for suffix in (".py", ".sh"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    return name.replace("_", "-")


def requires_approval(risk_level: str) -> bool:
    return RISK_LEVELS[risk_level] >= RISK_LEVELS["L2"]


def requires_confirmation(risk_level: str) -> bool:
    return RISK_LEVELS[risk_level] >= RISK_LEVELS["L3"]


def coerce_risk_level(classified: str, requested: str | None) -> str:
    if requested is None:
        return classified

    if requested not in RISK_LEVELS:
        raise ApprovalError(f"Unsupported risk level: {requested}")

    if RISK_LEVELS[requested] < RISK_LEVELS[classified]:
        raise ApprovalError(
            f"Risk level downgrade is not allowed: command requires {classified}, not {requested}."
        )

    return requested


def compute_execution_hash(command: str, run_id: str, timestamp: str) -> str:
    normalized = normalize_command(command)
    return sha256_hex(f"{normalized}{run_id}{timestamp}")


def compute_entry_hash(entry: dict[str, Any], prev_hash: str) -> str:
    material = dict(entry)
    material.pop("hash", None)
    return sha256_hex(f"{canonical_json(material)}{prev_hash}")


def read_entries(log_path: Path) -> list[dict[str, Any]]:
    if not log_path.exists():
        return []

    entries: list[dict[str, Any]] = []
    with log_path.open("r", encoding="utf-8") as handle:
        for lineno, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ApprovalError(f"Log entry {lineno} is not valid JSON: {exc}") from exc
            if not isinstance(entry, dict):
                raise ApprovalError(f"Log entry {lineno} must decode to an object.")
            entries.append(entry)
    validate_entries(entries)
    return entries


def _append_entry_locked(
    log_path: Path,
    entries: list[dict[str, Any]],
    entry: dict[str, Any],
) -> dict[str, Any]:
    prev_hash = entries[-1]["hash"] if entries else GENESIS_HASH
    material = dict(entry)
    material["prev_hash"] = prev_hash
    material["hash"] = compute_entry_hash(material, prev_hash)
    validate_schema(material)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(material, sort_keys=True) + "\n")
    return material


def validate_entries(entries: list[dict[str, Any]]) -> None:
    prev_hash = GENESIS_HASH
    run_requests: dict[str, dict[str, Any]] = {}
    for index, entry in enumerate(entries, start=1):
        validate_schema(entry, index)
        expected_hash = compute_entry_hash(entry, prev_hash)
        if entry["prev_hash"] != prev_hash:
            raise ApprovalError(
                f"Log entry {index} has invalid prev_hash; append-only chain is broken."
            )
        if entry["hash"] != expected_hash:
            raise ApprovalError(f"Log entry {index} hash mismatch; log appears to be tampered.")
        if entry["status"] == "requested":
            if entry["execution_hash"] != compute_execution_hash(
                entry["command"], entry["run_id"], entry["timestamp"]
            ):
                raise ApprovalError(f"Entry {index} has an invalid execution_hash.")
            run_requests[entry["run_id"]] = entry
        else:
            request = run_requests.get(entry["run_id"])
            if request is None:
                raise ApprovalError(
                    f"Log entry {index} appears before its requested entry for run {entry['run_id']}."
                )
            if entry["execution_hash"] != request["execution_hash"]:
                raise ApprovalError(
                    f"Log entry {index} execution_hash does not match the original request."
                )
        prev_hash = entry["hash"]


def validate_schema(entry: dict[str, Any], index: int | None = None) -> None:
    location = f" entry {index}" if index is not None else ""
    required_fields = {
        "status": str,
        "action": str,
        "run_id": str,
        "call_id": str,
        "risk_level": str,
        "command": str,
        "execution_hash": str,
        "approved_by": str,
        "expected_records": int,
        "query_filter": dict,
        "timestamp": str,
        "prev_hash": str,
        "hash": str,
    }

    for field_name, field_type in required_fields.items():
        if field_name not in entry:
            raise ApprovalError(f"Missing required field{location}: {field_name}")
        if not isinstance(entry[field_name], field_type):
            raise ApprovalError(f"Field{location} {field_name} must be {field_type.__name__}.")

    if entry["status"] not in STATUSES:
        raise ApprovalError(f"Unsupported status{location}: {entry['status']}")
    if entry["risk_level"] not in RISK_LEVELS:
        raise ApprovalError(f"Unsupported risk level{location}: {entry['risk_level']}")
    if not re.fullmatch(r"[0-9a-f]{64}", entry["execution_hash"]):
        raise ApprovalError(f"Entry{location} has an invalid execution_hash format.")

    verification = entry.get("verification")
    if verification is not None and not isinstance(verification, dict):
        raise ApprovalError(f"Field{location} verification must be an object when present.")


def append_entry(log_path: Path, entry: dict[str, Any]) -> dict[str, Any]:
    with locked_log(log_path):
        _archive_legacy_log_if_needed(log_path)
        entries = read_entries(log_path)
        return _append_entry_locked(log_path, entries, entry)


def create_request_entry(
    *,
    action: str | None,
    command: str,
    requested_risk_level: str | None,
    run_id: str | None,
    call_id: str | None,
    notes: str | None,
    impact: str | None,
    scope: str | None,
    expected_records: int,
    query_filter: dict[str, Any],
) -> dict[str, Any]:
    normalized_command = normalize_command(command)
    policy = classify_command(normalized_command)
    risk_level = coerce_risk_level(policy.risk_level, requested_risk_level)
    timestamp = utc_now()
    effective_run_id = run_id or new_id("run")
    effective_call_id = call_id or new_id("call")

    entry = {
        "status": "requested",
        "action": action or policy.action,
        "run_id": effective_run_id,
        "call_id": effective_call_id,
        "risk_level": risk_level,
        "command": normalized_command,
        "execution_hash": compute_execution_hash(normalized_command, effective_run_id, timestamp),
        "approved_by": "",
        "expected_records": expected_records,
        "query_filter": query_filter,
        "timestamp": timestamp,
        "prev_hash": "",
        "hash": "",
        "notes": notes or "",
        "expected_impact": impact or "",
        "scope": normalize_scope(scope),
        "approval_required": requires_approval(risk_level),
        "confirmation_required": requires_confirmation(risk_level),
        "verification": None,
        "cwd": str(ROOT_DIR),
        "source": "codex",
    }
    return entry


def create_transition_entry(
    run_entries: list[dict[str, Any]],
    *,
    status: str,
    approved_by: str = "",
    notes: str = "",
    verification: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request = get_request_entry(run_entries)
    effective_approved_by = approved_by or get_effective_approved_by(run_entries)
    entry = {
        "status": status,
        "action": request["action"],
        "run_id": request["run_id"],
        "call_id": request["call_id"],
        "risk_level": request["risk_level"],
        "command": request["command"],
        "execution_hash": request["execution_hash"],
        "approved_by": effective_approved_by,
        "expected_records": request["expected_records"],
        "query_filter": request["query_filter"],
        "timestamp": utc_now(),
        "prev_hash": "",
        "hash": "",
        "notes": notes,
        "expected_impact": request.get("expected_impact", ""),
        "scope": request.get("scope", []),
        "approval_required": request.get("approval_required", requires_approval(request["risk_level"])),
        "confirmation_required": request.get(
            "confirmation_required", requires_confirmation(request["risk_level"])
        ),
        "verification": verification,
        "cwd": str(ROOT_DIR),
        "source": "codex",
    }
    return entry


def get_run_entries(entries: list[dict[str, Any]], run_id: str) -> list[dict[str, Any]]:
    run_entries = [entry for entry in entries if entry["run_id"] == run_id]
    if not run_entries:
        raise ApprovalError(f"Unknown run_id: {run_id}")
    return run_entries


def get_request_entry(run_entries: list[dict[str, Any]]) -> dict[str, Any]:
    for entry in run_entries:
        if entry["status"] == "requested":
            return entry
    raise ApprovalError("Run is missing its requested entry.")


def get_effective_approved_by(run_entries: list[dict[str, Any]]) -> str:
    for entry in reversed(run_entries):
        approved_by = entry.get("approved_by", "")
        if approved_by:
            return approved_by
    return ""


def get_latest_entry(run_entries: list[dict[str, Any]]) -> dict[str, Any]:
    return run_entries[-1]


def assert_transition(run_entries: list[dict[str, Any]], expected_status: str) -> None:
    latest_status = get_latest_entry(run_entries)["status"]
    if latest_status != expected_status:
        raise ApprovalError(
            f"Run {get_request_entry(run_entries)['run_id']} is in state {latest_status}, not {expected_status}."
        )


def approve_run(log_path: Path, run_id: str, approved_by: str, notes: str = "") -> dict[str, Any]:
    with locked_log(log_path):
        entries = read_entries(log_path)
        run_entries = get_run_entries(entries, run_id)
        assert_transition(run_entries, "requested")
        entry = create_transition_entry(
            run_entries,
            status="approved",
            approved_by=approved_by,
            notes=notes,
        )
        return _append_entry_locked(log_path, entries, entry)


def reject_run(
    log_path: Path,
    run_id: str,
    reason: str,
    rejected_by: str = "",
) -> dict[str, Any]:
    with locked_log(log_path):
        entries = read_entries(log_path)
        run_entries = get_run_entries(entries, run_id)
        latest = get_latest_entry(run_entries)["status"]
        if latest not in {"requested", "approved"}:
            raise ApprovalError(f"Run {run_id} cannot be rejected from state {latest}.")
        entry = create_transition_entry(
            run_entries,
            status="rejected",
            approved_by="",
            notes=reason if not rejected_by else f"{reason} (by {rejected_by})",
        )
        return _append_entry_locked(log_path, entries, entry)


def _validate_execution_from_entries(
    entries: list[dict[str, Any]],
    *,
    command: str,
    run_id: str | None,
    execution_hash: str | None,
    confirm: bool,
    allowed_latest_statuses: set[str] | None = None,
) -> dict[str, Any]:
    normalized_command = normalize_command(command)
    policy = classify_command(normalized_command)
    result: dict[str, Any] = {
        "command": normalized_command,
        "action": policy.action,
        "risk_level": policy.risk_level,
        "approval_required": policy.approval_required,
        "confirmation_required": policy.confirmation_required,
        "run_id": "",
        "call_id": "",
        "execution_hash": "",
        "expected_records": 0,
        "query_filter": {},
        "approved_by": "",
    }

    run_entries = _resolve_explicit_run(entries, normalized_command, run_id, execution_hash)

    if run_entries is None and not policy.approval_required:
        return result

    permitted_statuses = allowed_latest_statuses or {"approved"}
    if run_entries is None:
        run_entries = resolve_pending_approval(
            entries,
            normalized_command,
            run_id,
            allowed_latest_statuses=permitted_statuses,
        )
    request = get_request_entry(run_entries)
    latest = get_latest_entry(run_entries)

    if latest["status"] not in permitted_statuses:
        raise ApprovalError(
            f"Run {request['run_id']} must be in {sorted(permitted_statuses)} before execution; current status is {latest['status']}."
        )
    if request["command"] != normalized_command:
        raise ApprovalError("Approved command does not match the requested command.")
    if execution_hash and execution_hash != request["execution_hash"]:
        raise ApprovalError("Execution hash mismatch for approved command.")
    if request["execution_hash"] != compute_execution_hash(
        request["command"], request["run_id"], request["timestamp"]
    ):
        raise ApprovalError("Stored execution hash is invalid.")
    if requires_confirmation(request["risk_level"]) and not confirm:
        raise ApprovalError(
            f"Command risk {request['risk_level']} requires the explicit --confirm execution flag."
        )

    result.update(
        {
            "action": request["action"],
            "risk_level": request["risk_level"],
            "approval_required": True,
            "confirmation_required": requires_confirmation(request["risk_level"]),
            "run_id": request["run_id"],
            "call_id": request["call_id"],
            "execution_hash": request["execution_hash"],
            "expected_records": request["expected_records"],
            "query_filter": request["query_filter"],
            "approved_by": get_effective_approved_by(run_entries),
        }
    )
    return result


def _resolve_explicit_run(
    entries: list[dict[str, Any]],
    normalized_command: str,
    run_id: str | None,
    execution_hash: str | None,
) -> list[dict[str, Any]] | None:
    if run_id:
        run_entries = get_run_entries(entries, run_id)
        request = get_request_entry(run_entries)
        if request["command"] != normalized_command:
            raise ApprovalError("Approved command does not match the requested command.")
        if execution_hash and execution_hash != request["execution_hash"]:
            raise ApprovalError("Execution hash mismatch for approved command.")
        return run_entries

    if not execution_hash:
        return None

    for entry in entries:
        if entry["status"] != "requested":
            continue
        if entry["command"] != normalized_command:
            continue
        if entry["execution_hash"] != execution_hash:
            continue
        return get_run_entries(entries, entry["run_id"])

    raise ApprovalError("No matching requested approval record exists for this command.")


def validate_execution(
    log_path: Path,
    *,
    command: str,
    run_id: str | None,
    execution_hash: str | None,
    confirm: bool,
) -> dict[str, Any]:
    entries = read_entries(log_path)
    return _validate_execution_from_entries(
        entries,
        command=command,
        run_id=run_id,
        execution_hash=execution_hash,
        confirm=confirm,
    )


def resolve_pending_approval(
    entries: list[dict[str, Any]],
    normalized_command: str,
    run_id: str | None,
    allowed_latest_statuses: set[str] | None = None,
) -> list[dict[str, Any]]:
    matching_run_ids: list[str] = []
    for entry in entries:
        if entry["status"] != "requested":
            continue
        if entry["command"] != normalized_command:
            continue
        if run_id and entry["run_id"] != run_id:
            continue
        matching_run_ids.append(entry["run_id"])

    if not matching_run_ids:
        raise ApprovalError("No matching requested approval record exists for this command.")

    permitted_statuses = allowed_latest_statuses or {"approved"}
    unique_runs: list[list[dict[str, Any]]] = []
    for candidate_run_id in matching_run_ids:
        run_entries = get_run_entries(entries, candidate_run_id)
        latest_status = get_latest_entry(run_entries)["status"]
        if latest_status in permitted_statuses:
            unique_runs.append(run_entries)

    if not unique_runs:
        raise ApprovalError(
            "A request exists for this command, but none is in an executable approval state."
        )

    if len(unique_runs) > 1 and run_id is None:
        raise ApprovalError(
            "Multiple approved requests match this command. Re-run validation with --run-id."
        )

    return unique_runs[-1]


def log_execution_state(
    log_path: Path,
    *,
    run_id: str,
    status: str,
    notes: str = "",
) -> dict[str, Any]:
    if status not in {"executed"}:
        raise ApprovalError(f"log_execution_state does not support status {status}.")

    with locked_log(log_path):
        entries = read_entries(log_path)
        run_entries = get_run_entries(entries, run_id)
        assert_transition(run_entries, "approved")
        entry = create_transition_entry(run_entries, status=status, notes=notes)
        return _append_entry_locked(log_path, entries, entry)


def finalize_execution(
    log_path: Path,
    *,
    run_id: str,
    command: str,
    execution_hash: str,
    confirm: bool,
    exit_code: int,
    output_text: str,
) -> dict[str, Any]:
    with locked_log(log_path):
        entries = read_entries(log_path)
        validation = _validate_execution_from_entries(
            entries,
            command=command,
            run_id=run_id,
            execution_hash=execution_hash,
            confirm=confirm,
            allowed_latest_statuses={"executed"},
        )
        run_entries = get_run_entries(entries, validation["run_id"])
        assert_transition(run_entries, "executed")
        verification = build_verification(
            command=validation["command"],
            output_text=output_text,
            exit_code=exit_code,
            expected_records=validation["expected_records"],
        )
        status = "completed" if verification["passed"] else "failed"
        notes = "" if status == "completed" else verification["reason"]
        entry = create_transition_entry(
            run_entries,
            status=status,
            notes=notes,
            verification=verification["details"],
        )
        appended = _append_entry_locked(log_path, entries, entry)
        return {
            "status": status,
            "verification": verification["details"],
            "entry": appended,
        }


def build_verification(
    *,
    command: str,
    output_text: str,
    exit_code: int,
    expected_records: int,
) -> dict[str, Any]:
    summary = parse_output_summary(output_text)
    details: dict[str, Any] = {
        "query": "exit_code == 0",
        "expected": 0,
        "actual": exit_code,
    }
    passed = exit_code == 0
    reason = "Command exited successfully."

    if "errors" in summary:
        details["query"] = "exit_code == 0 and summary.errors == 0"
        details["expected"] = {"exit_code": 0, "errors": 0}
        details["actual"] = {"exit_code": exit_code, "errors": summary["errors"]}
        passed = passed and summary["errors"] == 0
        if summary["errors"] != 0:
            reason = f"Post-execution verification found {summary['errors']} errors."

    mutated_metric = infer_mutated_metric(command, summary)
    if expected_records > 0 and mutated_metric is not None:
        metric_name, actual_value = mutated_metric
        details["query"] = f"{metric_name} == expected_records"
        details["expected"] = expected_records
        details["actual"] = actual_value
        passed = passed and actual_value == expected_records
        if actual_value != expected_records:
            reason = (
                f"Verification mismatch for {metric_name}: expected {expected_records}, got {actual_value}."
            )

    if summary:
        details["summary"] = summary
    if exit_code != 0:
        reason = f"Command exited with status {exit_code}."

    details["passed"] = passed
    return {"passed": passed, "reason": reason, "details": details}


def parse_output_summary(output_text: str) -> dict[str, int]:
    summary: dict[str, int] = {}
    for raw_line in output_text.splitlines():
        line = raw_line.strip()
        match = re.match(r"^([A-Za-z0-9 _()-]+):\s*(-?\d+)\s*$", line)
        if not match:
            continue
        label = re.sub(r"[^a-z0-9]+", "_", match.group(1).lower()).strip("_")
        summary[label] = int(match.group(2))
    return summary


def infer_mutated_metric(command: str, summary: dict[str, int]) -> tuple[str, int] | None:
    target = extract_target_script(command_to_tokens(normalize_command(command)))
    if target == "./backend/scripts/backfill_session_snapshots.py" and "repaired" in summary:
        return ("repaired", summary["repaired"])
    if target == "./backend/scripts/cleanup_synthetic_session_data.py" and "deleted_docs" in summary:
        return ("deleted_docs", summary["deleted_docs"])
    if target == "./backend/scripts/repair_count_line_item_names.py" and "repaired" in summary:
        return ("repaired", summary["repaired"])
    if (
        target == "./backend/scripts/repair_legacy_zero_variance_approvals.py"
        and "repaired" in summary
    ):
        return ("repaired", summary["repaired"])
    return None


def shell_exports(values: dict[str, Any]) -> str:
    lines: list[str] = []
    for key, value in values.items():
        env_key = re.sub(r"[^A-Z0-9_]", "_", key.upper())
        serialized = json.dumps(value, sort_keys=True) if isinstance(value, dict) else str(value)
        lines.append(f"{env_key}={shlex.quote(serialized)}")
    return "\n".join(lines)


def verify_chain(log_path: Path) -> dict[str, Any]:
    entries = read_entries(log_path)
    return {
        "log_file": str(log_path),
        "entries": len(entries),
        "valid": True,
        "head_hash": entries[-1]["hash"] if entries else GENESIS_HASH,
    }


def env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _normalize_token(token: str) -> str:
    if not token or token.startswith("-"):
        return token

    repo_token = _resolve_repo_token(token)
    if repo_token:
        return repo_token

    return token


def _resolve_repo_token(token: str) -> str | None:
    candidates = []
    raw = Path(token)
    if raw.is_absolute():
        candidates.append(raw)
    else:
        candidates.append((Path.cwd() / raw).resolve())
        candidates.append((ROOT_DIR / raw).resolve())

    for candidate in candidates:
        try:
            if candidate.exists():
                relative = candidate.relative_to(ROOT_DIR.resolve())
                return f"./{relative.as_posix()}"
        except ValueError:
            continue
    return None


def _archive_legacy_log_if_needed(log_path: Path) -> None:
    if not log_path.exists():
        return

    try:
        raw_entries = []
        with log_path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                raw_entries.append(json.loads(line))
    except json.JSONDecodeError:
        raw_entries = []

    if not raw_entries:
        return

    first_entry = raw_entries[0]
    if not isinstance(first_entry, dict) or not REQUIRED_ENTRY_FIELDS.issubset(first_entry.keys()):
        archive_name = f"{log_path.stem}.legacy-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}{log_path.suffix}"
        archive_path = log_path.with_name(archive_name)
        log_path.replace(archive_path)


def _registry_risk(target: str | None, script_name: str, flags: set[str]) -> str | None:
    registry: dict[str, str] = {
        "./backend/scripts/restore_mongodb_backup.py": "L4",
        "./backend/scripts/verify_reconciliation.py": "L3",
        "./scripts/restore.sh": "L4",
        "./scripts/restore_mongo.sh": "L4",
        "./scripts/rollback_remote_compose.sh": "L4",
        "./scripts/deploy_remote_compose.sh": "L3",
        "./scripts/deploy_manual.sh": "L3",
        "./scripts/init_letsencrypt.sh": "L3",
        "./scripts/clear_sessions.py": "L4",
        "./backend/scripts/reset_staff_session.py": "L4",
        "./scripts/fix_duplicate_db.py": "L4",
        "./scripts/deduplicate_all.py": "L4",
        "./scripts/migrate_batch_id.py": "L3",
        "./scripts/fix_default_users_pin.py": "L3",
        "./scripts/set_admin_pin.py": "L3",
        "./scripts/seed_test_item.py": "L3",
        "./scripts/verify_and_sync_item.py": "L3",
        "./scripts/verify_sujata_db.py": "L3",
        "./scripts/sync_erp_full.py": "L3",
        "./backend/scripts/set_supervisor_pin.py": "L3",
        "./backend/scripts/add_test_items.py": "L3",
        "./backend/scripts/migrate_user_settings.py": "L3",
        "./backend/scripts/create_staff_users.py": "L3",
        "./backend/scripts/sync_sql_to_mongo.py": "L3",
    }
    conditional_registry = {
        "./backend/scripts/backfill_session_snapshots.py": ("--execute", "L3"),
        "./backend/scripts/cleanup_synthetic_session_data.py": ("--execute", "L4"),
        "./backend/scripts/repair_count_line_item_names.py": ("--execute", "L3"),
        "./backend/scripts/repair_legacy_zero_variance_approvals.py": ("--execute", "L3"),
        "./backend/scripts/generate_secrets.py": ("--write", "L3"),
    }

    if target in registry:
        return registry[target]
    if target in conditional_registry:
        required_flag, risk_level = conditional_registry[target]
        if required_flag in flags:
            return risk_level
        return None

    destructive_keywords = ("restore", "rollback", "cleanup", "clear", "delete", "deduplicate")
    if any(keyword in script_name for keyword in destructive_keywords):
        return "L4"

    mutating_keywords = (
        "backfill",
        "repair",
        "migrate",
        "deploy",
        "sync",
        "seed",
        "set_",
        "create_",
        "fix_",
    )
    if any(keyword in script_name for keyword in mutating_keywords):
        return "L3"

    return None


def _git_command_risk(tokens: list[str]) -> str | None:
    if Path(tokens[0]).name != "git" or len(tokens) < 2:
        return None

    subcommand = tokens[1]
    token_set = set(tokens[2:])

    if subcommand == "rm":
        return "L3"
    if subcommand == "clean" and any(token.startswith("-f") or token == "-d" for token in token_set):
        return "L4"
    if subcommand == "reset" and "--hard" in token_set:
        return "L4"
    if subcommand == "checkout" and "--" in token_set:
        return "L4"
    if subcommand == "restore" and (
        "--source" in token_set or "--staged" in token_set or "--worktree" in token_set
    ):
        return "L3"
    if subcommand == "push" and any(token.startswith("--force") for token in token_set):
        return "L4"

    return None
