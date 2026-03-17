import ast
import re
from pathlib import Path

import pytest


DISALLOWED_SQL_KEYWORDS = (
    "INSERT",
    "UPDATE",
    "DELETE",
    "MERGE",
    "DROP",
    "ALTER",
    "TRUNCATE",
    "CREATE",
    "EXEC",
    "EXECUTE",
    "GRANT",
    "REVOKE",
)

CALL_NAMES = {"execute_query", "execute", "executemany"}

BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _iter_candidate_files():
    for folder in ("api", "services"):
        root = BACKEND_ROOT / folder
        for path in root.rglob("*.py"):
            if "tests" in path.parts or "__pycache__" in path.parts:
                continue
            if path.name == "sql_server_connector.py":
                continue
            yield path


def _call_name(node: ast.Call) -> str | None:
    func = node.func
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return None


def _contains_disallowed_keyword(query: str) -> bool:
    normalized = re.sub(r"\s+", " ", query).upper()
    return any(re.search(rf"\b{kw}\b", normalized) for kw in DISALLOWED_SQL_KEYWORDS)


@pytest.mark.governance
def test_write_path_restrictions_on_sql_calls():
    """
    CONTRACT: API/services layers must not issue SQL mutation queries directly.
    Any SQL execution in these layers must remain read-only.
    """
    violations: list[str] = []

    for path in _iter_candidate_files():
        source = path.read_text(encoding="utf-8", errors="ignore")
        tree = ast.parse(source, filename=str(path))

        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue

            name = _call_name(node)
            if name not in CALL_NAMES:
                continue

            if not node.args:
                continue

            first_arg = node.args[0]
            if not isinstance(first_arg, ast.Constant) or not isinstance(first_arg.value, str):
                continue

            query = first_arg.value
            if _contains_disallowed_keyword(query):
                rel = path.relative_to(BACKEND_ROOT).as_posix()
                violations.append(f"{rel}:{node.lineno}")

    assert not violations, (
        "Governance Violation: SQL mutation query usage detected outside connector:\n"
        + "\n".join(sorted(violations))
    )
