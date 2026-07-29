import ast
from pathlib import Path

import pytest


MUTATION_METHODS = {
    "insert_one",
    "insert_many",
    "update_one",
    "update_many",
    "delete_one",
    "delete_many",
    "bulk_write",
    "replace_one",
    "find_one_and_update",
    "find_one_and_replace",
    "find_one_and_delete",
}
BACKEND_ROOT = Path(__file__).resolve().parents[2]
COUNT_LINE_WRITE_SERVICE = BACKEND_ROOT / "services" / "count_line_write_service.py"
COUNT_LINE_WRITE_OBSERVATION = BACKEND_ROOT / "services" / "count_lines" / "observation.py"
COUNT_LINE_WRITE_SESSION_AGG = BACKEND_ROOT / "services" / "count_lines" / "session_aggregator.py"
COUNT_LINE_WRITE_CORE = BACKEND_ROOT / "services" / "count_lines" / "write_core.py"
SESSION_LIFECYCLE_SERVICE = BACKEND_ROOT / "services" / "session_lifecycle_service.py"
UNKNOWN_ITEM_SERVICE = BACKEND_ROOT / "services" / "unknown_item_service.py"
RECOUNT_SERVICE = BACKEND_ROOT / "services" / "recount_service.py"

COLLECTION_CONTRACTS: dict[str, set[Path]] = {
    "count_lines": {
        COUNT_LINE_WRITE_SERVICE,
        COUNT_LINE_WRITE_OBSERVATION,
        COUNT_LINE_WRITE_SESSION_AGG,
        COUNT_LINE_WRITE_CORE,
    },
    "sessions": {SESSION_LIFECYCLE_SERVICE},
    "verification_sessions": {SESSION_LIFECYCLE_SERVICE},
    "recount_requests": {SESSION_LIFECYCLE_SERVICE, RECOUNT_SERVICE},
    "session_snapshots": {SESSION_LIFECYCLE_SERVICE},
    "unknown_items": {UNKNOWN_ITEM_SERVICE},
}


def _iter_python_files() -> list[Path]:
    paths: list[Path] = []
    for path in BACKEND_ROOT.rglob("*.py"):
        if (
            "tests" in path.parts
            or "__pycache__" in path.parts
            or ".venv" in path.parts
            or "site-packages" in path.parts
        ):
            continue
        paths.append(path)
    return paths


def _slice_to_string(slice_node: ast.AST) -> str | None:
    if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
        return slice_node.value
    if isinstance(slice_node, ast.Index):  # pragma: no cover - py<3.9 compatibility shape
        return _slice_to_string(slice_node.value)
    return None


def _is_collection_target(node: ast.AST, collection_name: str) -> bool:
    if isinstance(node, ast.Attribute):
        return node.attr == collection_name or _is_collection_target(node.value, collection_name)
    if isinstance(node, ast.Subscript):
        key = _slice_to_string(node.slice)
        return key == collection_name or _is_collection_target(node.value, collection_name)
    return False


def _find_direct_collection_mutations(path: Path, collection_name: str) -> list[int]:
    source = path.read_text(encoding="utf-8", errors="ignore")
    tree = ast.parse(source, filename=str(path))

    violations: list[int] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        if not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr not in MUTATION_METHODS:
            continue
        if _is_collection_target(node.func.value, collection_name):
            violations.append(node.lineno)
    return violations


@pytest.mark.governance
@pytest.mark.parametrize("collection_name", sorted(COLLECTION_CONTRACTS.keys()))
def test_governed_collection_writes_flow_only_through_domain_services(collection_name: str):
    """CONTRACT: governed collections must only be mutated by domain write authorities."""
    allowed_files = COLLECTION_CONTRACTS[collection_name]
    violations: list[str] = []

    for path in _iter_python_files():
        if any(path.resolve() == allowed.resolve() for allowed in allowed_files):
            continue
        lines = _find_direct_collection_mutations(path, collection_name)
        if not lines:
            continue
        rel = path.relative_to(BACKEND_ROOT).as_posix()
        violations.extend(f"{rel}:{line}" for line in lines)

    assert not violations, (
        f"Governance Violation: direct {collection_name} mutation detected outside "
        "authorized domain services:\n" + "\n".join(sorted(violations))
    )
