import importlib.util
import json
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "remediation_loop.py"
SPEC = importlib.util.spec_from_file_location("remediation_loop", MODULE_PATH)
assert SPEC and SPEC.loader
remediation_loop = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(remediation_loop)


def manifest(*tasks, approval_required=False):
    return {
        "name": "test",
        "phases": [
            {
                "id": "phase-test",
                "name": "Test phase",
                "approval_required": approval_required,
                "tasks": list(tasks),
            }
        ],
    }


def test_next_work_advances_in_manifest_order():
    plan = manifest(
        {"id": "one", "name": "One", "kind": "manual"},
        {"id": "two", "name": "Two", "kind": "manual"},
    )
    state = remediation_loop.initial_state(plan, "digest")
    phase, task = remediation_loop.next_work(plan, state)
    assert phase["id"] == "phase-test"
    assert task["id"] == "one"
    state["tasks"]["one"]["status"] = "complete"
    assert remediation_loop.next_work(plan, state)[1]["id"] == "two"


def test_dry_run_does_not_execute_or_complete(monkeypatch):
    task = {"id": "check", "name": "Check", "kind": "command", "commands": [["{python}", "-V"]]}
    plan = manifest(task)
    state = remediation_loop.initial_state(plan, "digest")
    monkeypatch.setattr(
        remediation_loop.subprocess,
        "run",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError()),
    )
    assert remediation_loop.run_loop(plan, state, True, 1, False) == 0
    assert state["tasks"]["check"]["status"] == "pending"


def test_approval_blocks_phase(capsys):
    plan = manifest(
        {"id": "manual", "name": "Manual", "kind": "manual", "instructions": "work"},
        approval_required=True,
    )
    state = remediation_loop.initial_state(plan, "digest")
    assert remediation_loop.run_loop(plan, state, False, 1, False) == 2
    assert "requires approval" in capsys.readouterr().out


def test_manifest_reconciliation_preserves_progress():
    old = manifest({"id": "one", "name": "One", "kind": "manual"})
    state = remediation_loop.initial_state(old, "old")
    state["tasks"]["one"]["status"] = "complete"
    new = manifest(
        {"id": "one", "name": "One", "kind": "manual"},
        {"id": "two", "name": "Two", "kind": "manual"},
    )
    reconciled = remediation_loop.reconcile_state(state, new, "new", True)
    assert reconciled["tasks"]["one"]["status"] == "complete"
    assert reconciled["tasks"]["two"]["status"] == "pending"


def test_state_write_is_valid_json(tmp_path):
    path = tmp_path / "state.json"
    state = {"updated_at": None, "tasks": {}}
    remediation_loop.write_state(path, state)
    assert json.loads(path.read_text(encoding="utf-8"))["tasks"] == {}


def test_reopened_task_makes_phase_incomplete():
    plan = manifest({"id": "one", "name": "One", "kind": "manual"})
    state = remediation_loop.initial_state(plan, "digest")
    state["tasks"]["one"]["status"] = "complete"
    assert remediation_loop.phase_complete(plan["phases"][0], state)

    state["tasks"]["one"]["status"] = "pending"

    assert not remediation_loop.phase_complete(plan["phases"][0], state)
    assert remediation_loop.next_work(plan, state)[1]["id"] == "one"
