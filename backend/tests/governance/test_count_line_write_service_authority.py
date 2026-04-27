import ast
from pathlib import Path

import pytest


MUTATION_METHODS = {"insert_one", "update_one", "update_many", "delete_one", "delete_many", "bulk_write"}
BACKEND_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_FILE = BACKEND_ROOT / "services" / "count_line_write_service.py"


def _iter_python_files() -> list[Path]:
    paths: list[Path] = []
    for path in BACKEND_ROOT.rglob("*.py"):
        if "tests" in path.parts or "__pycache__" in path.parts:
            continue
        paths.append(path)
    return paths


def _slice_to_string(slice_node: ast.AST) -> str | None:
    if isinstance(slice_node, ast.Constant) and isinstance(slice_node.value, str):
        return slice_node.value
    if isinstance(slice_node, ast.Index):  # pragma: no cover - py<3.9 compatibility shape
        return _slice_to_string(slice_node.value)
    return None


def _is_count_lines_target(node: ast.AST) -> bool:
    if isinstance(node, ast.Attribute):
        return node.attr == "count_lines" or _is_count_lines_target(node.value)
    if isinstance(node, ast.Subscript):
        key = _slice_to_string(node.slice)
        return key == "count_lines" or _is_count_lines_target(node.value)
    return False


def _find_direct_count_line_mutations(path: Path) -> list[int]:
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
        if _is_count_lines_target(node.func.value):
            violations.append(node.lineno)
    return violations


@pytest.mark.governance
def test_count_lines_writes_flow_only_through_write_service():
    """
    CONTRACT: No runtime/backend code may mutate `count_lines` directly outside
    CountLineWriteService.
    """
    violations: list[str] = []
    for path in _iter_python_files():
        if path.resolve() == ALLOWED_FILE.resolve():
            continue
        lines = _find_direct_count_line_mutations(path)
        if not lines:
            continue
        rel = path.relative_to(BACKEND_ROOT).as_posix()
        violations.extend(f"{rel}:{line}" for line in lines)

    assert not violations, (
        "Governance Violation: direct count_lines mutation detected outside "
        "CountLineWriteService:\n" + "\n".join(sorted(violations))
    )
